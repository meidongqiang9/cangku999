const { getDb } = require('../../utils/cloud')
const { isSameDay, isSameMonth, isSameYear, todayStart, monthStart, yearStart } = require('../../utils/time')

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
    var shopId = wx.getStorageSync('currentShopId') || ''
    try {
      var db = getDb()
      db.collection('orders')
        .where(shopId ? { shopId: shopId } : {})
        .get({
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
    var todayCleared = {}
    var monthCleared = {}
    var todayAmount = 0
    var monthAmount = 0

    orders.forEach(function(o) {
      // 只统计已结账（清台翻台）的订单
      if (o.status !== 'paid' && o.status !== 'completed') return

      var isToday = isSameDay(o.paidAt || o.createdAt, Date.now())
      var isThisMonth = isSameMonth(o.paidAt || o.createdAt, Date.now())
      var amount = o.totalPrice || 0

      // 按桌号+结账时间排重（同一次翻台可能有多条订单：顾客+协助）
      var clearKey = (o.tableName || o.tableNo || '') + '_' + (o.paidAt || o.createdAt || '')
      if (isToday && clearKey) {
        todayCleared[clearKey] = true
        todayAmount += amount
      }
      if (isThisMonth && clearKey) {
        monthCleared[clearKey] = true
        monthAmount += amount
      }
    })

    this.setData({
      todayOrders: Object.keys(todayCleared).length,
      todayAmount: todayAmount.toFixed(2),
      monthOrders: Object.keys(monthCleared).length,
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
  goChefs: function() { wx.navigateTo({ url: '/pages/owner/chefs/chefs' }) },

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
    var shopId = wx.getStorageSync('currentShopId') || ''

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

    // 从云数据库基于 shopId 清零
    try {
      var db = getDb()
      var cutoff
      if (type === 0) {
        cutoff = todayStart()
      } else if (type === 1) {
        cutoff = monthStart()
      } else {
        cutoff = yearStart()
      }
      db.collection('orders').where({ shopId: shopId }).get({
        success: function(res) {
          (res.data || []).forEach(function(o) {
            if (o.createdAt >= cutoff && o._id) {
              db.collection('orders').doc(o._id).remove()
            }
          })
        }
      })
    } catch (e) {}

    // 同时清理本地缓存
    var orders = wx.getStorageSync('allOrders') || []
    if (type === 0) {
      orders = orders.filter(function(o) {
        return !isSameDay(o.createdAt, Date.now())
      })
    } else if (type === 1) {
      orders = orders.filter(function(o) {
        return !isSameMonth(o.createdAt, Date.now())
      })
    } else {
      orders = orders.filter(function(o) {
        return !isSameYear(o.createdAt, Date.now())
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
