const { getDb } = require('../../utils/cloud')
const { isSameDay, isSameMonth, isSameYear } = require('../../utils/time')

Page({
  data: {
    tab: 'dish',
    dishFilter: 'today',
    salesFilter: 'month',
    dishStats: [],
    salesStats: [],
    timeStats: []
  },

  onLoad: function() {
    this.loadStats()
  },

  onShow: function() {
    this.loadStats()
  },

  switchTab: function(e) {
    var tab = e.currentTarget.dataset.tab
    this.setData({ tab: tab })
  },

  setDishFilter: function(e) {
    var filter = e.currentTarget.dataset.filter
    this.setData({ dishFilter: filter })
    this.loadStats()
  },

  setSalesFilter: function(e) {
    var filter = e.currentTarget.dataset.filter
    this.setData({ salesFilter: filter })
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
          var orders = res.data || []
          if (orders.length === 0) {
            orders = wx.getStorageSync('allOrders') || []
          }
          that.computeAll(orders)
        },
        fail: function() {
          var orders = wx.getStorageSync('allOrders') || []
          that.computeAll(orders)
        }
      })
    } catch (e) {
      var orders = wx.getStorageSync('allOrders') || []
      that.computeAll(orders)
    }
  },

  computeAll: function(orders) {
    this.loadDishStats(orders)
    this.loadSalesStats(orders)
    this.loadTimeStats(orders)
  },

  loadDishStats: function(orders) {
    var filter = this.data.dishFilter

    var filtered = orders.filter(function(o) {
      if (o.status === 'cancelled') return false
      if (filter === 'today') return isSameDay(o.createdAt, Date.now())
      if (filter === 'month') return isSameMonth(o.createdAt, Date.now())
      if (filter === 'year') return isSameYear(o.createdAt, Date.now())
      return true
    })

    var dishMap = {}
    filtered.forEach(function(o) {
      (o.items || []).forEach(function(item) {
        var name = item.name || item.dishName || ''
        if (!name) return
        if (!dishMap[name]) dishMap[name] = { name: name, quantity: 0 }
        dishMap[name].quantity += item.quantity || 1
      })
    })

    var dishStats = Object.values(dishMap)
      .sort(function(a, b) { return b.quantity - a.quantity })
      .slice(0, 10)
    this.setData({ dishStats: dishStats })
  },

  loadSalesStats: function(orders) {
    var filter = this.data.salesFilter
    var now = new Date()

    var filtered = orders.filter(function(o) {
      if (o.status === 'cancelled') return false
      if (filter === 'month') return isSameMonth(o.createdAt, Date.now())
      if (filter === 'year') return isSameYear(o.createdAt, Date.now())
      return true
    })

    var dates = []
    if (filter === 'month') {
      var daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
      for (var i = 1; i <= daysInMonth; i++) {
        dates.push({ day: i, label: i + '日' })
      }
    } else if (filter === 'year') {
      for (var j = 1; j <= 12; j++) {
        dates.push({ day: j, label: j + '月' })
      }
    }

    var salesStats = dates.map(function(item) {
      var dayOrders = filtered.filter(function(o) {
        var d = new Date(o.createdAt)
        if (filter === 'year') {
          return d.getFullYear() === now.getFullYear() && (d.getMonth() + 1) === item.day
        }
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && d.getDate() === item.day
      })
      var amount = 0
      dayOrders.forEach(function(o) {
        amount += o.totalPrice || 0
        if (!o.totalPrice && o.items) {
          o.items.forEach(function(it) { amount += (it.price || 0) * (it.quantity || 1) })
        }
      })
      return { date: item.label, amount: amount }
    })

    var maxAmount = Math.max.apply(null, salesStats.map(function(s) { return s.amount })) || 1
    var chartHeight = 75
    salesStats = salesStats.map(function(s) {
      s.percent = (s.amount / maxAmount) * chartHeight
      s.amount = s.amount.toFixed(2)
      return s
    })

    this.setData({ salesStats: salesStats })
  },

  loadTimeStats: function(orders) {
    var completed = orders.filter(function(o) {
      return o.status === 'completed' || o.status === 'paid'
    })

    var hourMap = {}
    for (var h = 10; h <= 22; h++) {
      hourMap[h] = { hour: h, orders: 0 }
    }

    completed.forEach(function(o) {
      var hour = new Date(o.createdAt).getHours()
      if (hourMap[hour]) hourMap[hour].orders++
    })

    var timeStats = Object.values(hourMap)
    var maxOrders = Math.max.apply(null, timeStats.map(function(t) { return t.orders })) || 1
    timeStats = timeStats.map(function(t) {
      t.percent = (t.orders / maxOrders) * 100
      return t
    })

    this.setData({ timeStats: timeStats })
  }
})
