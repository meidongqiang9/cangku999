Page({
  data: {
    filter: 'today',
    orders: [],
    orderCount: 0,
    totalAmount: 0
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
    var filter = this.data.filter
    var allOrders = wx.getStorageSync('allOrders') || []
    
    var filtered = allOrders.filter(function(order) {
      var d = new Date(order.createdAt)
      var now = new Date()
      
      if (filter === 'today') {
        return d.toDateString() === now.toDateString()
      } else if (filter === 'month') {
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      } else if (filter === 'year') {
        return d.getFullYear() === now.getFullYear()
      }
      return true
    })
    
    var statusMap = {
      'pending': '未结账',
      'cooking': '制作中',
      'served': '已上菜',
      'completed': '已结账',
      'cancelled': '已取消'
    }
    
    filtered = filtered.map(function(order) {
      order.timeText = new Date(order.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      order.statusText = statusMap[order.status] || '未知'
      return order
    })
    
    var pendingAmount = 0
    var completedAmount = 0
    var guestCount = 0
    var completedCount = 0
    
    filtered.forEach(function(o) { 
      guestCount += parseInt(o.guestCount) || 0
      if (o.status === 'completed') {
        completedAmount += o.totalPrice || 0
        completedCount++
      } else {
        pendingAmount += o.totalPrice || 0
      }
    })
    
    this.setData({
      orders: filtered,
      orderCount: filtered.length,
      totalAmount: (pendingAmount + completedAmount).toFixed(2),
      completedCount: completedCount,
      completedAmount: completedAmount.toFixed(2),
      guestCount: guestCount
    })
  }
})