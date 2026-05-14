Page({
  data: {
    tables: [],
    showInputModal: false,
    inputValue: ''
  },

  onLoad: function() {
    this.loadTables()
  },

  onShow: function() {
    this.loadTables()
  },

  loadTables: function() {
    var tables = wx.getStorageSync('tables') || []
    var orders = wx.getStorageSync('allOrders') || []
    
    tables = tables.map(function(t) {
      var tableOrders = orders.filter(function(o) {
        return o.tableNo === t.name && o.status !== 'completed'
      })
      
      if (tableOrders.length > 0) {
        t.status = 'occupied'
        t.statusText = '有客'
        var total = 0
        var guestCount = 0
        tableOrders.forEach(function(o) { 
          total += o.totalPrice || 0
          guestCount = o.guestCount || 0
        })
        t.orders = total.toFixed(2)
        t.guestCount = guestCount
      } else {
        t.status = 'free'
        t.statusText = '空闲'
        t.orders = 0
        t.guestCount = 0
      }
      return t
    })
    
    this.setData({ tables: tables })
  },

  addTable: function() {
    this.setData({
      showInputModal: true,
      inputValue: '',
      modalAction: 'addTable'
    })
  },

  onInputValueChange: function(e) {
    this.setData({ inputValue: e.detail.value })
  },

  closeInputModal: function() {
    this.setData({
      showInputModal: false,
      inputValue: ''
    })
  },

  confirmInput: function() {
    var that = this
    var value = that.data.inputValue
    
    if (!value) {
      wx.showToast({ title: '请输入桌号', icon: 'none' })
      return
    }
    
    if (that.data.modalAction === 'addTable') {
      var tables = wx.getStorageSync('tables') || []
      
      if (tables.find(function(t) { return t.name === value })) {
        wx.showToast({ title: '桌号已存在', icon: 'none' })
        return
      }
      
      tables.push({
        id: 'T' + Date.now(),
        name: value,
        status: 'free',
        seats: 0
      })
      
      wx.setStorageSync('tables', tables)
      that.setData({ tables: tables })
    }
    
    that.setData({ showInputModal: false, inputValue: '' })
    wx.showToast({ title: '添加成功', icon: 'success' })
  },

  editTable: function(e) {
    var id = e.currentTarget.dataset.id
    var that = this
    
    wx.showActionSheet({
      itemList: ['查看详情', '删除餐桌'],
      success: function(res) {
        if (res.tapIndex === 0) {
          that.viewTableDetail(e)
        } else if (res.tapIndex === 1) {
          that.deleteTable(id)
        }
      }
    })
  },

  viewTableDetail: function(e) {
    var id = e.currentTarget.dataset.id
    var table = this.data.tables.find(function(t) { return t.id === id })
    wx.setStorageSync('currentTableDetail', table)
    wx.navigateTo({ url: '/pages/owner/tableDetail/tableDetail' })
  },

  deleteTable: function(id) {
    var that = this
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这张餐桌吗？',
      success: function(res) {
        if (res.confirm) {
          var tables = that.data.tables.filter(function(t) { return t.id !== id })
          wx.setStorageSync('tables', tables)
          that.setData({ tables: tables })
        }
      }
    })
  }
})