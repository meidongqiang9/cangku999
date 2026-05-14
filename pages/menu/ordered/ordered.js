Page({
  data: {
    tableNo: '',
    orderedItems: [],
    addedItems: [],
    ownerItems: [],
    totalPrice: 0
  },

  onLoad: function() {
    var currentTable = wx.getStorageSync('currentTable')
    if (currentTable) {
      this.setData({ tableNo: currentTable.tableNo })
      this.loadOrders()
    }
  },

  loadOrders: function() {
    var tableNo = wx.getStorageSync('currentTable').tableNo
    var orders = wx.getStorageSync('allOrders') || []
    
    var orderedItems = []
    var addedItems = []
    var ownerItems = []
    var totalPrice = 0
    
    orders.forEach(function(order) {
      if (order.tableNo === tableNo && order.status !== 'completed') {
        var isFromOwner = order.fromOwner || false
        ;(order.items || []).forEach(function(item) {
          var itemTotal = item.price * item.quantity
          totalPrice += itemTotal
          
          if (isFromOwner) {
            ownerItems.push(item)
          } else {
            orderedItems.push(item)
          }
        })
      }
    })
    
    this.setData({
      orderedItems: orderedItems,
      ownerItems: ownerItems,
      totalPrice: totalPrice.toFixed(2)
    })
  },

  goAddDish: function() {
    var tableNo = this.data.tableNo
    wx.navigateTo({
      url: '/pages/menu/menu?tableNo=' + tableNo + '&fromOrder=1'
    })
  },

  onShow: function() {
    this.loadOrders()
  }
})