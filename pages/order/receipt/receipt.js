Page({
  data: {
    tableNo: '',
    totalPrice: 0,
    allItems: []
  },

  onLoad: function() {
    var currentTable = wx.getStorageSync('currentTable')
    var orders = wx.getStorageSync('allOrders') || []
    
    var grouped = {
      '首次点单': [],
      '二次加菜': [],
      '三次加菜': [],
      '终端协助': []
    }
    var totalPrice = 0
    
    var orderList = orders.filter(function(o) {
      return o.tableNo === currentTable.tableNo && o.status !== 'completed'
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
      tableNo: currentTable.tableNo,
      totalPrice: totalPrice.toFixed(2),
      allItems: allItems
    })
    
    wx.setStorageSync('tableChecked_' + currentTable.tableNo, true)
  },

  goHome: function() {
    wx.reLaunch({ url: '/pages/index/index' })
  }
})