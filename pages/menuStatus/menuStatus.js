Page({
  data: {
    orders: [],
    tableNo: ''
  },

  onLoad: function(options) {
    var tableNo = options.tableNo || ''
    this.setData({ tableNo: tableNo })
    this.loadOrders()
  },

  loadOrders: function() {
    var tableNo = this.data.tableNo
    var orders = wx.getStorageSync('allOrders') || []
    var currentOrder = wx.getStorageSync('currentOrder')
    
    if (currentOrder && currentOrder.tableNo === tableNo) {
      var exists = orders.some(function(o) { return o.createdAt === currentOrder.createdAt })
      if (!exists) orders.unshift(currentOrder)
    }
    
    orders = orders.filter(function(o) {
      return o.tableNo === tableNo
    })
    
    this.setData({ orders: orders })
  },

  updateStatus: function(e) {
    var id = e.currentTarget.dataset.id
    var status = e.currentTarget.dataset.status
    
    var orders = this.data.orders.map(function(order) {
      if (order.createdAt === id) {
        order.status = status
      }
      return order
    })
    
    wx.setStorageSync('allOrders', orders)
    this.setData({ orders: orders })
    wx.showToast({ title: '已更新', icon: 'success' })
  }
})