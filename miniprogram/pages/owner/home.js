const { getDb } = require('../../utils/cloud')

Page({
  data: {
    shopName: '',
    todayOrders: 0,
    todayAmount: '0.00',
    monthOrders: 0,
    monthAmount: '0.00',
    showPasswordModal: false,
    passwordAction: 0,
    password: ''
  },

  onLoad: function() {
    this.checkAuth()
    this.loadData()
  },

  onShow: function() {
    this.checkAuth()
    this.loadStats()
  },

  checkAuth: function() {
    var user = wx.getStorageSync('ownerUser')
    if (!user) {
      wx.redirectTo({ url: '/pages/owner/login' })
      return
    }

    var now = Date.now()
    if (user.expiresAt && now > user.expiresAt) {
      wx.showModal({
        title: '账号到期',
        content: '请联系作者续费',
        showCancel: false,
        success: function() {
          wx.removeStorageSync('ownerUser')
          wx.redirectTo({ url: '/pages/owner/login' })
        }
      })
      return
    }

    if (user.canUse === false) {
      wx.showModal({
        title: '账号已禁用',
        content: '请联系作者',
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
      this.setData({ shopName: user.shopName || '我的店铺' })
    }
    this.loadStats()
  },

  loadStats: function() {
    var that = this
    try {
      var db = getDb()
      db.collection('orders').get({
        success: function(res) {
          that.calcStats(res.data || [])
        },
        fail: function() {
          that.calcStatsFromLocal()
        }
      })
    } catch (e) {
      that.calcStatsFromLocal()
    }
  },

  calcStats: function(orders) {
    var today = new Date().toDateString()
    var thisMonth = new Date().getMonth()
    var thisYear = new Date().getFullYear()

    var todaySet = {}
    var monthSet = {}
    var todayAmount = 0
    var monthAmount = 0

    orders.forEach(function(o) {
      var d = new Date(o.createdAt)
      var isToday = d.toDateString() === today
      var isThisMonth = d.getMonth() === thisMonth && d.getFullYear() === thisYear
      var amount = o.totalPrice || 0

      var sessionKey = o.sessionId || o.tableName
      if (isToday && sessionKey) {
        todaySet[sessionKey] = true
        todayAmount += amount
      }
      if (isThisMonth && sessionKey) {
        monthSet[sessionKey] = true
        monthAmount += amount
      }
    })

    this.setData({
      todayOrders: Object.keys(todaySet).length,
      todayAmount: todayAmount.toFixed(2),
      monthOrders: Object.keys(monthSet).length,
      monthAmount: monthAmount.toFixed(2)
    })
  },

  calcStatsFromLocal: function() {
    var orders = wx.getStorageSync('allOrders') || []
    this.calcStats(orders)
  },

  goMenu: function() { wx.navigateTo({ url: '/pages/owner/menu' }) },
  goTables: function() { wx.navigateTo({ url: '/pages/owner/tables' }) },
  goOrders: function() { wx.navigateTo({ url: '/pages/owner/orders' }) },
  goSettings: function() { wx.navigateTo({ url: '/pages/owner/settings' }) },
  goContact: function() { wx.navigateTo({ url: '/pages/owner/contact' }) },
  goUsers: function() { wx.navigateTo({ url: '/pages/owner/users' }) },

  clearData: function() {
    var that = this
    wx.showActionSheet({
      itemList: ['清零今日数据', '清零本月数据', '清零本年数据'],
      success: function(res) {
        that.setData({
          showPasswordModal: true,
          passwordAction: res.tapIndex,
          password: ''
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
    if (user && pwd === '123456') {
      valid = true
    } else if (users.some(function(u) { return u.password === pwd })) {
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
