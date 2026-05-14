Page({
  data: {
    table: {},
    allItems: [],
    totalPrice: 0
  },

  onLoad: function() {
    var table = wx.getStorageSync('currentTableDetail')
    if (table) {
      this.setData({ table: table })
      this.loadTableOrders()
    }
  },

  loadTableOrders: function() {
    var table = this.data.table
    var orders = wx.getStorageSync('allOrders') || []
    
    var grouped = {
      '首次点单': [],
      '二次加菜': [],
      '三次加菜': [],
      '终端协助': []
    }
    var totalPrice = 0
    
    var orderList = orders.filter(function(o) {
      return o.tableNo === table.name && o.status !== 'completed'
    }).sort(function(a, b) { return a.createdAt - b.createdAt })
    
    var normalOrders = orderList.filter(function(o) { return !o.fromOwner })
    var ownerOrders = orderList.filter(function(o) { return o.fromOwner })
    
    grouped['首次点单'] = normalOrders[0] ? normalOrders[0].items : []
    grouped['二次加菜'] = normalOrders[1] ? normalOrders[1].items : []
    grouped['三次加菜'] = normalOrders[2] ? normalOrders[2].items : []
    var allOwnerItems = []
    ownerOrders.forEach(function(o) {
      allOwnerItems = allOwnerItems.concat(o.items || [])
    })
    grouped['终端协助'] = allOwnerItems
    
    var allItems = []
    Object.keys(grouped).forEach(function(key) {
      if (grouped[key] && grouped[key].length > 0) {
        var sum = 0
        grouped[key].forEach(function(item) { sum += item.price * item.quantity })
        allItems.push({ title: key, items: grouped[key], subtotal: sum })
        totalPrice += sum
      }
    })
    
    this.setData({
      items: allItems,
      allItems: allItems,
      totalPrice: totalPrice.toFixed(2)
    })
  },

  changePrice: function(e) {
    var isPlus = e.currentTarget.dataset.type === 'plus'
    var itemId = e.currentTarget.dataset.itemid
    
    var allOrders = wx.getStorageSync('allOrders') || []
    var table = this.data.table
    
    allOrders.forEach(function(order) {
      if (order.tableNo === table.name && order.status !== 'completed' && order.fromOwner) {
        ;(order.items || []).forEach(function(item) {
          if (item.id === itemId) {
            item.price = isPlus ? item.price + 1 : Math.max(0, item.price - 1)
          }
        })
      }
    })
    
    wx.setStorageSync('allOrders', allOrders)
    this.loadTableOrders()
  },

  addDish: function() {
    var table = this.data.table
    wx.navigateTo({
      url: '/pages/menu/menu?tableNo=' + table.name + '&guestCount=' + (table.guestCount || 1) + '&fromOwner=1'
    })
  },

  resetTable: function() {
    var that = this
    var table = this.data.table
    wx.showModal({
      title: '确认翻台',
      content: '确定要清台吗？该桌所有订单将被清除',
      success: function(res) {
        if (res.confirm) {
          var orders = wx.getStorageSync('allOrders') || []
          orders = orders.filter(function(o) { return o.tableNo !== table.name })
          wx.setStorageSync('allOrders', orders)
          wx.removeStorageSync('tableChecked_' + table.name)
          that.loadTableOrders()
          wx.showToast({ title: '翻台成功', icon: 'success' })
        }
      }
    })
  },

  onShow: function() {
    this.loadTableOrders()
  }
})