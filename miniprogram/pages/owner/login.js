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

    var found = users.find(function(u) {
      return u.phone === phone && u.password === password
    })

    // 测试账号兼容
    if (!found && phone === '13889195545' && password === '123456') {
      found = {
        id: 'admin_' + Date.now(),
        phone: '13889195545',
        shopName: '食易特餐厅',
        role: 'owner',
        canUse: true
      }
    }

    if (found) {
      found.loginAt = Date.now()

      // 确保有 shopId：优先从已存储数据，其次从云数据库查找
      var shopId = found.shopId || ''

      if (!shopId) {
        // 旧账号没有 shopId，尝试从 users 集合获取
        this.ensureShopId(found, function(updatedUser) {
          wx.setStorageSync('ownerUser', updatedUser)
          wx.setStorageSync('currentShopId', updatedUser.shopId || '')
          that.finishLogin()
        })
      } else {
        wx.setStorageSync('ownerUser', found)
        wx.setStorageSync('currentShopId', shopId)
        this.finishLogin()
      }
    } else {
      that.setData({ submitting: false })
      wx.showToast({ title: '账号或密码错误', icon: 'none' })
    }
  },

  // 兼容旧账号：无 shopId 时自动创建 shop 文档
  ensureShopId: function(user, callback) {
    var shopName = user.shopName || '我的店铺'
    var phone = user.phone || ''

    try {
      var db = getDb()
      // 查询 users 集合中是否有该手机号对应的 shopId
      db.collection('users').where({ phone: phone, role: 'owner' }).get({
        success: function(res) {
          if (res.data && res.data.length > 0 && res.data[0].shopId) {
            user.shopId = res.data[0].shopId
            callback(user)
          } else {
            // 创建 shop 文档
            db.collection('shops').add({
              data: { shopName: shopName, phone: phone, createdAt: Date.now() },
              success: function(addRes) {
                var shopId = addRes._id
                user.shopId = shopId
                // 回写到 users 集合
                if (res.data && res.data.length > 0) {
                  db.collection('users').doc(res.data[0]._id).update({ data: { shopId: shopId } })
                } else {
                  db.collection('users').add({
                    data: { phone: phone, shopName: shopName, role: 'owner', shopId: shopId, createdAt: Date.now() }
                  })
                }
                callback(user)
              },
              fail: function() { callback(user) }
            })
          }
        },
        fail: function() { callback(user) }
      })
    } catch (e) { callback(user) }
  },

  finishLogin: function() {
    this.setData({ submitting: false })

    wx.cloud.callFunction({
      name: 'login',
      success: function() {},
      fail: function() {}
    })

    wx.showToast({ title: '登录成功', icon: 'success' })
    setTimeout(function() {
      wx.redirectTo({ url: '/pages/owner/home' })
    }, 600)
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

    // 先创建 shop 文档获取 shopId
    that.setData({ submitting: true })
    var shopId = ''
    var userId = 'owner_' + Date.now()

    var doCreateUser = function(shopId) {
      var newUser = {
        id: userId,
        phone: phone,
        password: password,
        shopName: shopName,
        realName: that.data.realName.trim(),
        role: 'owner',
        canUse: true,
        shopId: shopId,
        createdAt: Date.now()
      }

      users.push(newUser)
      wx.setStorageSync('ownerUsers', users)
      wx.setStorageSync('ownerUser', newUser)
      wx.setStorageSync('currentShopId', shopId)

      // 同步用户到云端（含 shopId）
      try {
        var db = getDb()
        db.collection('users').add({
          data: {
            phone: phone,
            shopName: shopName,
            role: 'owner',
            shopId: shopId,
            createdAt: Date.now()
          }
        })
      } catch (e) {}

      that.setData({ submitting: false })
      wx.showToast({ title: '注册成功', icon: 'success' })
      setTimeout(function() {
        wx.redirectTo({ url: '/pages/owner/home' })
      }, 600)
    }

    // 尝试在云数据库创建 shop 文档
    try {
      var db = getDb()
      db.collection('shops').add({
        data: {
          shopName: shopName,
          phone: phone,
          createdAt: Date.now()
        },
        success: function(res) {
          shopId = res._id
          doCreateUser(shopId)
        },
        fail: function() {
          doCreateUser(shopId)
        }
      })
    } catch (e) {
      doCreateUser(shopId)
    }
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
                  var shopName = userInfo.nickName + '的店铺'

                  var user = {
                    id: 'wx_' + openid.substring(0, 12),
                    phone: '',
                    shopName: shopName,
                    avatarUrl: userInfo.avatarUrl,
                    nickname: userInfo.nickName,
                    role: 'owner',
                    canUse: true,
                    loginAt: Date.now()
                  }

                  // 创建 shop 文档获取 shopId
                  try {
                    var db = getDb()
                    db.collection('shops').add({
                      data: { shopName: shopName, phone: '', createdAt: Date.now() },
                      success: function(addRes) {
                        user.shopId = addRes._id
                        that.saveWechatUser(user)
                      },
                      fail: function() {
                        that.saveWechatUser(user)
                      }
                    })
                  } catch (e) {
                    that.saveWechatUser(user)
                  }
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
  },

  saveWechatUser: function(user) {
    wx.setStorageSync('ownerUser', user)
    wx.setStorageSync('currentShopId', user.shopId || '')

    try {
      var db = getDb()
      db.collection('users').add({
        data: {
          phone: '',
          shopName: user.shopName,
          role: 'owner',
          shopId: user.shopId || '',
          createdAt: Date.now()
        }
      })
    } catch (e) {}

    wx.showToast({ title: '登录成功', icon: 'success' })
    setTimeout(function() {
      wx.redirectTo({ url: '/pages/owner/home' })
    }, 600)
  }
})
