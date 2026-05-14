Page({
  data: {
    shopName: '',
    todayOrders: 0,
    todayAmount: '0',
    monthOrders: 0,
    monthAmount: '0',
    daysLeft: 0,
    isExpiring: false,
    showPasswordModal: false,
    passwordAction: 0
  },

  onLoad: function() {
    this.checkAuth()
    this.loadData()
  },

  checkAuth: function() {
    var user = wx.getStorageSync('ownerUser')
    if (!user) return
    
    var now = Date.now()
    if (user.expiresAt && now > user.expiresAt) {
      wx.showModal({
        title: '账号到期',
        content: '建议及更多功能请联系作者',
        showCancel: false,
        success: function() {
          wx.removeStorageSync('ownerUser')
          wx.redirectTo({ url: '/pages/owner/login' })
        }
      })
      return
    }
    
    if (!user.canUse) {
      wx.showModal({
        title: '账号已禁用',
        content: '建议及更多功能请联系作者',
        showCancel: false,
        success: function() {
          wx.removeStorageSync('ownerUser')
          wx.redirectTo({ url: '/pages/owner/login' })
        }
      })
      return
    }
  },

  loadData: function() {
    var user = wx.getStorageSync('ownerUser')
    if (user) {
      this.setData({
        shopName: user.shopName || '我的店铺'
      })
    }
    this.loadStats()
  },

  onShow: function() {
    this.checkAuth()
    this.loadStats()
  },

  loadStats: function() {
    var orders = wx.getStorageSync('allOrders') || []
    var today = new Date().toDateString()
    var thisMonth = new Date().getMonth()
    
    var todayOrders = orders.filter(function(o) {
      return new Date(o.createdAt).toDateString() === today && o.status === 'completed'
    })
    
    var monthOrders = orders.filter(function(o) {
      var d = new Date(o.createdAt)
      return d.getMonth() === thisMonth && o.status === 'completed'
    })
    
    var totalToday = 0
    todayOrders.forEach(function(o) { totalToday += o.totalPrice || 0 })
    
    var totalMonth = 0
    monthOrders.forEach(function(o) { totalMonth += o.totalPrice || 0 })
    
    this.setData({
      todayOrders: todayOrders.length,
      todayAmount: totalToday.toFixed(2),
      monthOrders: monthOrders.length,
      monthAmount: totalMonth.toFixed(2)
    })
  },

  goMenu: function() {
    wx.navigateTo({ url: '/pages/owner/menu' })
  },

  goTables: function() {
    wx.navigateTo({ url: '/pages/owner/tables' })
  },

  goOrders: function() {
    wx.navigateTo({ url: '/pages/owner/orders' })
  },

  goSettings: function() {
    wx.navigateTo({ url: '/pages/owner/settings' })
  },

  goContact: function() {
    wx.navigateTo({ url: '/pages/owner/contact' })
  },

  clearData: function() {
    var that = this
    wx.showActionSheet({
      itemList: ['清零今日数据', '清零本月数据', '清零本年数据'],
      success: function(res) {
        that.setData({
          showPasswordModal: true,
          passwordAction: res.tapIndex
        })
      }
    })
  },

  onPasswordInput: function(e) {
    this.setData({ password: e.detail.value })
  },

  confirmPassword: function() {
    var that = this
    var pwd = that.data.password || ''
    var users = wx.getStorageSync('ownerUsers') || []
    var user = wx.getStorageSync('ownerUser')
    var valid = false
    
    if (user && user.phone === '13889195545' && pwd === '123456') {
      valid = true
    } else if (users.find(function(u) { return u.password === pwd })) {
      valid = true
    }
    
    if (!valid) {
      wx.showToast({ title: '密码错误', icon: 'none' })
      return
    }
    
    var type = that.data.passwordAction
    var orders = wx.getStorageSync('allOrders') || []
    var now = new Date()
    
    if (type === 0) {
      orders = orders.filter(function(o) {
        return new Date(o.createdAt).toDateString() !== now.toDateString()
      })
    } else if (type === 1) {
      orders = orders.filter(function(o) {
        var d = new Date(o.createdAt)
        return !(d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear())
      })
    } else {
      orders = orders.filter(function(o) {
        var d = new Date(o.createdAt)
        return d.getFullYear() !== now.getFullYear()
      })
    }
    
    wx.setStorageSync('allOrders', orders)
    that.setData({ showPasswordModal: false, password: '' })
    that.loadStats()
    wx.showToast({ title: '已清零', icon: 'success' })
  },

  closePasswordModal: function() {
    this.setData({ showPasswordModal: false, password: '' })
  },

  logout: function() {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      success: function(res) {
        if (res.confirm) {
          wx.removeStorageSync('ownerUser')
          wx.redirectTo({ url: '/pages/owner/login' })
        }
      }
    })
  }
})