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

  loadStats: function() {
    var orders = wx.getStorageSync('allOrders') || []
    
    this.loadDishStats(orders)
    this.loadSalesStats(orders)
    this.loadTimeStats(orders)
  },

  loadDishStats: function(orders) {
    var filter = this.data.dishFilter
    var now = new Date()
    
    var filtered = orders.filter(function(order) {
      if (order.status !== 'completed') return false
      var d = new Date(order.createdAt)
      
      if (filter === 'today') {
        return d.toDateString() === now.toDateString()
      } else if (filter === 'month') {
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      } else if (filter === 'year') {
        return d.getFullYear() === now.getFullYear()
      }
      return true
    })
    
    var dishMap = {}
    filtered.forEach(function(order) {
      (order.items || []).forEach(function(item) {
        if (!dishMap[item.name]) {
          dishMap[item.name] = { name: item.name, quantity: 0 }
        }
        dishMap[item.name].quantity += item.quantity || 1
      })
    })
    
    var dishStats = Object.values(dishMap).sort(function(a, b) { return b.quantity - a.quantity }).slice(0, 10)
    this.setData({ dishStats: dishStats })
  },

  setSalesFilter: function(e) {
    var filter = e.currentTarget.dataset.filter
    this.setData({ salesFilter: filter })
    this.loadStats()
  },

  loadSalesStats: function(orders) {
    var filter = this.data.salesFilter
    var now = new Date()
    
    var filtered = orders.filter(function(order) {
      if (order.status !== 'completed') return false
      var d = new Date(order.createdAt)
      
      if (filter === 'month') {
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      } else if (filter === 'year') {
        return d.getFullYear() === now.getFullYear()
      }
      return true
    })
    
    var dates = []
    var daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    
    if (filter === 'month') {
      for (var i = 1; i <= daysInMonth; i++) {
        dates.push({ day: i, label: i + '日' })
      }
    } else if (filter === 'year') {
      for (var i = 1; i <= 12; i++) {
        dates.push({ day: i, label: i + '月' })
      }
    }
    
    var salesStats = dates.map(function(item) {
      var dayOrders
      if (filter === 'year') {
        dayOrders = filtered.filter(function(o) {
          var d = new Date(o.createdAt)
          return d.getFullYear() === now.getFullYear() && (d.getMonth() + 1) === item.day
        })
      } else {
        dayOrders = filtered.filter(function(o) {
          var d = new Date(o.createdAt)
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && d.getDate() === item.day
        })
      }
      var amount = 0
      dayOrders.forEach(function(o) { amount += o.totalPrice || 0 })
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
    var completed = orders.filter(function(o) { return o.status === 'completed' })
    var hourMap = {}
    
    for (var h = 10; h <= 22; h++) {
      hourMap[h] = { hour: h, orders: 0 }
    }
    
    completed.forEach(function(order) {
      var hour = new Date(order.createdAt).getHours()
      if (hourMap[hour]) {
        hourMap[hour].orders++
      }
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