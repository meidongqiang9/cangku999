const { getDb } = require('../../utils/cloud')

Page({
  data: {
    isLogin: true,
    phone: '',
    password: '',
    showPassword: false,
    shopName: '',
    realName: '',
    submitting: false
  },

  onLoad: function() {
    var user = wx.getStorageSync('ownerUser')
    if (user) {
      wx.redirectTo({ url: '/pages/owner/home' })
    }
  },

  onPhoneInput: function(e) {
    this.setData({ phone: e.detail.value })
  },

  onPasswordInput: function(e) {
    this.setData({ password: e.detail.value })
  },

  onShopNameInput: function(e) {
    this.setData({ shopName: e.detail.value })
  },

  onRealNameInput: function(e) {
    this.setData({ realName: e.detail.value })
  },

  togglePassword: function() {
    this.setData({ showPassword: !this.data.showPassword })
  },

  toggleMode: function() {
    this.setData({
      isLogin: !this.data.isLogin,
      phone: '',
      password: '',
      shopName: '',
      realName: ''
    })
  },

  submit: function() {
    if (this.data.submitting) return

    var phone = this.data.phone.trim()
    var password = this.data.password.trim()

    if (!phone) {
      wx.showToast({ title: '请输入手机号', icon: 'none' })
      return
    }
    if (!/^1\d{10}$/.test(phone)) {
      wx.showToast({ title: '手机号格式不正确', icon: 'none' })
      return
    }
    if (!password) {
      wx.showToast({ title: '请输入密码', icon: 'none' })
      return
    }
    if (password.length < 6) {
      wx.showToast({ title: '密码至少6位', icon: 'none' })
      return
    }

    this.setData({ submitting: true })

    if (this.data.isLogin) {
      this.doLogin(phone, password)
    } else {
      this.doRegister(phone, password)
    }
  },

  doLogin: function(phone, password) {
    var that = this
    var users = wx.getStorageSync('ownerUsers') || []

    // 硬编码测试账号
    var found = users.find(function(u) {
      return u.phone === phone && u.password === password
    })

    if (!found) {
      // 测试账号兼容
      if (phone === '13889195545' && password === '123456') {
        found = {
          id: 'admin_' + Date.now(),
          phone: '13889195545',
          shopName: '食易特餐厅',
          role: 'owner',
          canUse: true
        }
      }
    }

    if (found) {
      found.loginAt = Date.now()
      wx.setStorageSync('ownerUser', found)
      that.setData({ submitting: false })

      // 尝试通过云函数获取 openid 绑定
      wx.cloud.callFunction({
        name: 'login',
        success: function() {},
        fail: function() {}
      })

      wx.showToast({ title: '登录成功', icon: 'success' })
      setTimeout(function() {
        wx.redirectTo({ url: '/pages/owner/home' })
      }, 600)
    } else {
      that.setData({ submitting: false })
      wx.showToast({ title: '账号或密码错误', icon: 'none' })
    }
  },

  doRegister: function(phone, password) {
    var that = this
    var shopName = that.data.shopName.trim()

    if (!shopName) {
      wx.showToast({ title: '请输入店铺名称', icon: 'none' })
      that.setData({ submitting: false })
      return
    }

    var users = wx.getStorageSync('ownerUsers') || []

    if (users.some(function(u) { return u.phone === phone })) {
      wx.showToast({ title: '该手机号已注册', icon: 'none' })
      that.setData({ submitting: false })
      return
    }

    var newUser = {
      id: 'owner_' + Date.now(),
      phone: phone,
      password: password,
      shopName: shopName,
      realName: that.data.realName.trim(),
      role: 'owner',
      canUse: true,
      createdAt: Date.now()
    }

    users.push(newUser)
    wx.setStorageSync('ownerUsers', users)
    wx.setStorageSync('ownerUser', newUser)

    // 如果配置了云开发，同步用户到云端
    try {
      var db = getDb()
      db.collection('users').add({
        data: {
          phone: phone,
          shopName: shopName,
          role: 'owner',
          createdAt: Date.now()
        }
      })
    } catch (e) {}

    that.setData({ submitting: false })
    wx.showToast({ title: '注册成功', icon: 'success' })
    setTimeout(function() {
      wx.redirectTo({ url: '/pages/owner/home' })
    }, 600)
  },

  onWechatLogin: function() {
    var that = this
    wx.getUserProfile({
      desc: '用于完善用户资料',
      success: function(profileRes) {
        var userInfo = profileRes.userInfo
        wx.login({
          success: function(loginRes) {
            if (loginRes.code) {
              wx.cloud.callFunction({
                name: 'login',
                data: { code: loginRes.code },
                success: function(cfRes) {
                  var openid = cfRes.result.openid
                  var user = {
                    id: 'wx_' + openid.substring(0, 12),
                    phone: '',
                    shopName: userInfo.nickName + '的店铺',
                    avatarUrl: userInfo.avatarUrl,
                    nickname: userInfo.nickName,
                    role: 'owner',
                    canUse: true,
                    loginAt: Date.now()
                  }
                  wx.setStorageSync('ownerUser', user)
                  wx.showToast({ title: '登录成功', icon: 'success' })
                  setTimeout(function() {
                    wx.redirectTo({ url: '/pages/owner/home' })
                  }, 600)
                },
                fail: function() {
                  wx.showToast({ title: '微信登录失败，请重试', icon: 'none' })
                }
              })
            }
          },
          fail: function() {
            wx.showToast({ title: '微信登录失败', icon: 'none' })
          }
        })
      },
      fail: function() {
        wx.showToast({ title: '已取消授权', icon: 'none' })
      }
    })
  }
})
