const { getUser, setUser, isLoggedIn, wechatLogin, logout } = require('../../utils/auth')
const { getDb } = require('../../utils/cloud')
const { formatPrice } = require('../../utils/currency')
const { formatDateTime, formatDate } = require('../../utils/time')

Page({
  data: {
    isLoggedIn: false,
    userInfo: null,
    orderHistory: [],
    totalOrders: 0,
    totalSpent: '💰0.00',
    lastOrderTime: ''
  },

  onLoad: function() {
    try {
      this.checkLoginStatus()
      console.log('[mine] onLoad success')
    } catch (e) {
      console.error('[mine] onLoad error:', e)
    }
  },

  onShow: function() {
    try {
      this.checkLoginStatus()
      if (isLoggedIn()) {
        this.loadOrderHistory()
      }
    } catch (e) {
      console.error('[mine] onShow error:', e)
    }
  },

  checkLoginStatus: function() {
    var loggedIn = isLoggedIn()
    var user = getUser()
    this.setData({
      isLoggedIn: loggedIn,
      userInfo: user
    })
  },

  handleLogin: function() {
    var that = this
    var app = getApp()
    app.showPrivacyConsent(function(agreed) {
      if (agreed) {
        wechatLogin().then(function(user) {
          that.setData({
            isLoggedIn: true,
            userInfo: user
          })
          that.loadOrderHistory()
          wx.showToast({ title: '登录成功', icon: 'success' })
        }).catch(function() {
          wx.showToast({ title: '已取消登录，可匿名使用', icon: 'none' })
        })
      }
    })
  },

  loadOrderHistory: function() {
    var that = this
    var shopId = wx.getStorageSync('currentShopId') || ''
    try {
      var db = getDb()
      db.collection('orders')
        .where({ shopId: shopId, _openid: '{openid}' })
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get({
          success: function(res) {
            that.processOrders(res.data || [])
          },
          fail: function() {
            that.loadLocalOrders()
          }
        })
    } catch (e) {
      that.loadLocalOrders()
    }
  },

  loadLocalOrders: function() {
    var orders = wx.getStorageSync('allOrders') || []
    var sorted = orders.sort(function(a, b) { return b.createdAt - a.createdAt }).slice(0, 20)
    this.processOrders(sorted)
  },

  processOrders: function(orders) {
    var totalSpent = 0
    orders.forEach(function(o) {
      totalSpent += o.totalPrice || 0
      if (o.items && !o.totalPrice) {
        o.items.forEach(function(item) {
          totalSpent += (item.price || 0) * (item.quantity || 0)
        })
      }
    })

    var lastOrderTime = ''
    if (orders.length > 0) {
      lastOrderTime = formatDateTime(orders[0].createdAt)
    }

    var history = orders.map(function(o) {
      var itemCount = o.items ? o.items.length : 0
      var itemNames = ''
      if (o.items) {
        itemNames = o.items.slice(0, 3).map(function(i) { return i.name || i.dishName || '' }).join('、')
        if (o.items.length > 3) itemNames += '...'
      }
      return {
        tableName: o.tableName || o.tableNo || '',
        itemCount: itemCount,
        itemNames: itemNames,
        totalPrice: formatPrice(o.totalPrice || 0),
        status: o.status === 'paid' ? '已结账' : o.status === 'pending' ? '进行中' : '已完成',
        statusClass: o.status === 'paid' ? 'paid' : 'pending',
        time: formatDate(o.createdAt)
      }
    })

    this.setData({
      orderHistory: history,
      totalOrders: orders.length,
      totalSpent: formatPrice(totalSpent),
      lastOrderTime: lastOrderTime
    })
  },

  handleLogout: function() {
    var that = this
    wx.showModal({
      title: '确认退出',
      content: '退出后需要重新登录',
      confirmText: '确定退出',
      cancelText: '取消',
      success: function(res) {
        if (res.confirm) {
          logout()
          that.setData({
            isLoggedIn: false,
            userInfo: null,
            orderHistory: [],
            totalOrders: 0,
            totalSpent: '💰0.00'
          })
          wx.showToast({ title: '已退出', icon: 'success' })
        }
      }
    })
  },

  contactMerchant: function() {
    wx.showModal({
      title: '联系商家',
      content: '如需帮助，请联系餐厅工作人员',
      showCancel: false,
      confirmText: '我知道了'
    })
  },

  goAgreement: function() {
    wx.navigateTo({ url: '/pages/agreement/agreement/agreement?type=service' })
  },

  goPrivacy: function() {
    wx.navigateTo({ url: '/pages/agreement/agreement/agreement?type=privacy' })
  }
})
