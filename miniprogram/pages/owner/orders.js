const { getDb } = require('../../utils/cloud')

Page({
  data: {
    filter: 'today',
    orders: [],
    orderCount: 0,
    totalAmount: '0.00',
    completedCount: 0,
    completedAmount: '0.00',
    guestCount: 0
  },

  onLoad: function() {
    this.loadOrders()
  },

  onShow: function() {
    this.loadOrders()
  },

  setFilter: function(e) {
    var filter = e.currentTarget.dataset.filter
    this.setData({ filter: filter })
    this.loadOrders()
  },

  loadOrders: function() {
    var that = this
    try {
      var db = getDb()
      db.collection('orders')
        .orderBy('createdAt', 'desc')
        .get({
          success: function(res) {
            var orders = res.data || []
            if (orders.length === 0) {
              orders = wx.getStorageSync('allOrders') || []
            }
            that.processOrders(orders)
          },
          fail: function() {
            var orders = wx.getStorageSync('allOrders') || []
            that.processOrders(orders)
          }
        })
    } catch (e) {
      var orders = wx.getStorageSync('allOrders') || []
      that.processOrders(orders)
    }
  },

  processOrders: function(orders) {
    var filter = this.data.filter
    var now = new Date()
    var today = now.toDateString()
    var thisMonth = now.getMonth()
    var thisYear = now.getFullYear()

    var filtered = orders.filter(function(o) {
      var d = new Date(o.createdAt)
      if (filter === 'today') {
        return d.toDateString() === today
      } else if (filter === 'month') {
        return d.getMonth() === thisMonth && d.getFullYear() === thisYear
      } else if (filter === 'year') {
        return d.getFullYear() === thisYear
      }
      return true
    })

    var statusMap = {
      'pending': '未结账',
      'cooking': '制作中',
      'served': '已上菜',
      'completed': '已结账',
      'paid': '已结账',
      'cancelled': '已取消'
    }

    var orderCount = 0
    var totalAmount = 0
    var completedCount = 0
    var completedAmount = 0
    var guestCount = 0
    var sessionSet = {}

    filtered.forEach(function(o) {
      // 按 sessionId 去重统计桌数
      var key = o.sessionId || o.tableName || o.tableNo
      if (key && !sessionSet[key]) {
        sessionSet[key] = true
        orderCount++
        guestCount += parseInt(o.guestCount) || 0

        var amount = o.totalPrice || 0
        // 如果 totalPrice 不存在，从 items 计算
        if (!amount && o.items) {
          o.items.forEach(function(item) {
            amount += (item.price || 0) * (item.quantity || 1)
          })
        }

        if (o.status === 'completed' || o.status === 'paid') {
          completedCount++
          completedAmount += amount
        }
        totalAmount += amount
      }
    })

    // 格式化订单列表
    var displayOrders = filtered.map(function(o) {
      var d = new Date(o.createdAt || Date.now())
      var timeText = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      var dateText = d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })

      // 归一化 items
      var items = (o.items || []).map(function(item) {
        return {
          name: item.name || item.dishName || '',
          quantity: item.quantity || 1
        }
      })

      var orderAmount = o.totalPrice || 0
      if (!orderAmount && items.length > 0) {
        o.items.forEach(function(item) {
          orderAmount += (item.price || 0) * (item.quantity || 1)
        })
      }

      return {
        tableNo: o.tableName || o.tableNo || '',
        guestCount: o.guestCount || 0,
        timeText: dateText + ' ' + timeText,
        statusText: statusMap[o.status] || '未知',
        status: o.status || 'pending',
        totalPrice: orderAmount.toFixed(2),
        items: items,
        createdAt: o.createdAt
      }
    })

    this.setData({
      orders: displayOrders,
      orderCount: orderCount,
      totalAmount: totalAmount.toFixed(2),
      completedCount: completedCount,
      completedAmount: completedAmount.toFixed(2),
      guestCount: guestCount
    })
  }
})
