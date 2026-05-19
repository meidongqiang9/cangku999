const { getDb } = require('../../utils/cloud')

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
    var that = this
    try {
      var db = getDb()
      db.collection('tables').get({
        success: function(res) {
          var tables = res.data || []
          if (tables.length === 0) {
            tables = wx.getStorageSync('tables') || []
          }
          that.enrichTables(tables)
        },
        fail: function() {
          var tables = wx.getStorageSync('tables') || []
          that.enrichTables(tables)
        }
      })
    } catch (e) {
      var tables = wx.getStorageSync('tables') || []
      that.enrichTables(tables)
    }
  },

  enrichTables: function(tables) {
    var that = this
    var orders = wx.getStorageSync('allOrders') || []

    tables = tables.map(function(t) {
      var tableOrders = orders.filter(function(o) {
        return o.tableNo === t.name && !o.cleared
      })

      if (tableOrders.length > 0) {
        t.status = 'occupied'
        t.statusText = '有客'
        var total = 0
        var guestCount = 0
        tableOrders.forEach(function(o) {
          if (o.items) {
            o.items.forEach(function(item) {
              total += item.price * item.quantity
            })
          }
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

    that.setData({ tables: tables })
  },

  addTable: function() {
    this.setData({
      showInputModal: true,
      inputValue: ''
    })
  },

  onInputValueChange: function(e) {
    this.setData({ inputValue: e.detail.value })
  },

  closeInputModal: function() {
    this.setData({ showInputModal: false, inputValue: '' })
  },

  confirmInput: function() {
    var that = this
    var value = that.data.inputValue.trim()

    if (!value) {
      wx.showToast({ title: '请输入桌号', icon: 'none' })
      return
    }

    var tables = that.data.tables

    if (tables.find(function(t) { return t.name === value })) {
      wx.showToast({ title: '桌号已存在', icon: 'none' })
      return
    }

    var newTable = {
      id: 'T' + Date.now(),
      name: value,
      status: 'free',
      seats: 0
    }

    try {
      var db = getDb()
      var shopId = wx.getStorageSync('currentShopId') || ''
      db.collection('tables').add({
        data: {
          shopId: shopId,
          name: value,
          status: 'free',
          createdAt: Date.now()
        },
        success: function() {
          tables.push(newTable)
          wx.setStorageSync('tables', tables)
          that.setData({ tables: tables, showInputModal: false, inputValue: '' })
          wx.showToast({ title: '添加成功', icon: 'success' })
        },
        fail: function() {
          tables.push(newTable)
          wx.setStorageSync('tables', tables)
          that.setData({ tables: tables, showInputModal: false, inputValue: '' })
          wx.showToast({ title: '添加成功', icon: 'success' })
        }
      })
    } catch (e) {
      tables.push(newTable)
      wx.setStorageSync('tables', tables)
      that.setData({ tables: tables, showInputModal: false, inputValue: '' })
      wx.showToast({ title: '添加成功', icon: 'success' })
    }
  },

  viewTableDetail: function(e) {
    var id = e.currentTarget.dataset.id
    var table = this.data.tables.find(function(t) { return t.id === id })
    if (table) {
      wx.setStorageSync('currentTableDetail', table)
      wx.navigateTo({ url: '/pages/owner/tableDetail/tableDetail' })
    }
  },

  deleteTable: function(e) {
    var id = e.currentTarget.dataset.id
    var that = this
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这张餐桌吗？',
      success: function(res) {
        if (res.confirm) {
          var tables = that.data.tables.filter(function(t) { return t.id !== id })
          wx.setStorageSync('tables', tables)
          that.setData({ tables: tables })
          wx.showToast({ title: '已删除', icon: 'success' })
        }
      }
    })
  }
})
