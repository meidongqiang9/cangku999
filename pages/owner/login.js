Page({
  data: {
    phone: '',
    password: '',
    shopName: '',
    realName: '',
    isLogin: true,
    showPassword: false
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

  toggleMode: function() {
    this.setData({ isLogin: !this.data.isLogin })
  },

  togglePassword: function() {
    this.setData({ showPassword: !this.data.showPassword })
  },

  submit: function() {
    var that = this
    var phone = that.data.phone
    var password = that.data.password
    
    if (!phone || phone.length !== 11) {
      wx.showToast({ title: '请输入正确手机号', icon: 'none' })
      return
    }
    
    if (!password || password.length < 6) {
      wx.showToast({ title: '密码至少6位', icon: 'none' })
      return
    }
    
    wx.showLoading({ title: that.data.isLogin ? '登录中...' : '注册中...' })
    
    if (that.data.isLogin) {
      that.login(phone, password)
    } else {
      that.register(phone, password)
    }
  },

  login: function(phone, password) {
    var that = this
    
    if (phone === '13889195545' && password === '123456') {
      var adminUser = {
        id: 'admin',
        phone: '13889195545',
        shopName: '超级管理员',
        createdAt: Date.now(),
        expiresAt: null,
        isPaid: true,
        membership: 'admin',
        canUse: true
      }
      wx.hideLoading()
      wx.setStorageSync('ownerUser', adminUser)
      wx.showToast({ title: '登录成功', icon: 'success' })
      setTimeout(function() {
        wx.reLaunch({ url: '/pages/owner/home' })
      }, 1000)
      return
    }
    
    var users = wx.getStorageSync('ownerUsers') || []
    var user = users.find(function(u) { return u.phone === phone })
    
    if (!user) {
      wx.hideLoading()
      wx.showToast({ title: '账号不存在', icon: 'none' })
      return
    }
    
    if (user.password !== password) {
      wx.hideLoading()
      wx.showToast({ title: '密码错误', icon: 'none' })
      return
    }
    
    if (!user.canUse) {
      wx.hideLoading()
      wx.showToast({ title: '账号已被禁用', icon: 'none' })
      return
    }
    
    if (user.expiresAt && Date.now() > user.expiresAt) {
      wx.hideLoading()
      wx.showModal({
        title: '账号到期',
        content: '建议及更多功能请联系作者',
        showCancel: false
      })
      return
    }
    
    wx.hideLoading()
    wx.setStorageSync('ownerUser', user)
    wx.showToast({ title: '登录成功', icon: 'success' })
    
    setTimeout(function() {
      wx.reLaunch({ url: '/pages/owner/home' })
    }, 1000)
  },

  register: function(phone, password) {
    var that = this
    
    if (!that.data.shopName) {
      wx.hideLoading()
      wx.showToast({ title: '请填写店铺名称', icon: 'none' })
      return
    }
    
    var users = wx.getStorageSync('ownerUsers') || []
    
    if (users.find(function(u) { return u.phone === phone })) {
      wx.hideLoading()
      wx.showToast({ title: '手机号已注册', icon: 'none' })
      return
    }
    
    var newUser = {
      id: 'U' + Date.now(),
      phone: phone,
      password: password,
      shopName: that.data.shopName,
      realName: that.data.realName || '',
      createdAt: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      isPaid: false,
      membership: 'free',
      canUse: true
    }
    
    users.push(newUser)
    wx.setStorageSync('ownerUsers', users)
    
    wx.hideLoading()
    wx.setStorageSync('ownerUser', newUser)
    wx.showToast({ title: '注册成功', icon: 'success' })
    
    setTimeout(function() {
      wx.reLaunch({ url: '/pages/owner/home' })
    }, 1000)
  },

  onWechatLogin: function() {
    var that = this
    
    wx.getUserProfile({
      desc: '用于老板登录',
      success: function(res) {
        var userInfo = res.userInfo
        var users = wx.getStorageSync('ownerUsers') || []
        
        var user = users.find(function(u) { return u.nickName === userInfo.nickName && u.avatarUrl === userInfo.avatarUrl })
        
        if (user) {
          if (!user.canUse) {
            wx.showToast({ title: '账号已被禁用', icon: 'none' })
            return
          }
          wx.setStorageSync('ownerUser', user)
          wx.showToast({ title: '登录成功', icon: 'success' })
          setTimeout(function() {
            wx.reLaunch({ url: '/pages/owner/home' })
          }, 1000)
          return
        }
        
        user = {
          id: 'W' + Date.now(),
          nickName: userInfo.nickName,
          avatarUrl: userInfo.avatarUrl,
          shopName: that.data.shopName || '我的店铺',
          createdAt: Date.now(),
          expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
          isPaid: false,
          membership: 'free',
          canUse: true
        }
        users.push(user)
        wx.setStorageSync('ownerUsers', users)
        
        wx.setStorageSync('ownerUser', user)
        wx.showToast({ title: '登录成功', icon: 'success' })
        
        setTimeout(function() {
          wx.reLaunch({ url: '/pages/owner/home' })
        }, 1000)
      },
      fail: function() {
        wx.showToast({ title: '授权失败', icon: 'none' })
      }
    })
  }
})