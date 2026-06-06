const { getDb } = require('../../utils/cloud')
const { formatTime } = require('../../utils/time')

Page({
  data: {
    orders: [],
    tableNo: '',
    currentTab: 'pending',
    watcher: null,
    chefName: ''
  },

  onLoad: function(options) {
    var tableNo = options.tableNo || ''
    var chefName = options.chefName ? decodeURIComponent(options.chefName) : ''
    var isChef = !!chefName
    if (!chefName) {
      var chef = wx.getStorageSync('currentChef')
      if (chef) { chefName = chef.name || ''; isChef = true }
    }
    // 厨师默认显示"已完成"tab，方便查看已走菜菜品
    var defaultTab = isChef ? 'completed' : 'pending'
    this.setData({ tableNo: tableNo, chefName: chefName, currentTab: defaultTab })
    this.loadOrders()
    this.startWatch()
  },

  onUnload: function() {
    if (this.data.watcher) {
      this.data.watcher.close()
    }
  },

  startWatch: function() {
    var that = this
    var shopId = wx.getStorageSync('currentShopId') || ''
    try {
      var db = getDb()
      var watcher = db.collection('order_items')
        .where({ shopId: shopId })
        .watch({
          onChange: function() {
            that.loadOrders()
          },
          onError: function(err) {
            console.error('watch error:', err)
          }
        })
      that.setData({ watcher: watcher })
    } catch (e) {}
  },

  switchTab: function(e) {
    var tab = e.currentTarget.dataset.tab
    this.setData({ currentTab: tab })
    this.loadOrders()
  },

  loadOrders: function() {
    var that = this
    var shopId = wx.getStorageSync('currentShopId') || ''
    try {
      var db = getDb()
      db.collection('order_items')
        .where({ shopId: shopId })
        .orderBy('createdAt', 'desc')
        .get({
          success: function(res) {
            var items = res.data || []
            if (items.length === 0) {
              items = that.getLocalItems()
            }
            that.groupItems(items)
          },
          fail: function() {
            that.groupItems(that.getLocalItems())
          }
        })
    } catch (e) {
      that.groupItems(that.getLocalItems())
    }
  },

  getLocalItems: function() {
    var orders = wx.getStorageSync('allOrders') || []
    var items = []
    orders.forEach(function(o) {
      (o.items || []).forEach(function(item) {
        items.push({
          _id: item.id || '',
          tableName: o.tableNo,
          dishId: item.id,
          dishName: item.name,
          quantity: item.quantity,
          status: item.status || 'submitted',
          taste: item.taste || '',
          createdAt: o.createdAt
        })
      })
    })
    return items
  },

  groupItems: function(items) {
    var that = this
    var currentTab = that.data.currentTab

    // 按 sessionId 或 createdAt 分组为订单
    var orderMap = {}
    items.forEach(function(item) {
      var key = item.sessionId || item.tableName || item._id
      if (!orderMap[key]) {
        orderMap[key] = {
          key: key,
          tableNo: item.tableName || '',
          createdAt: item.createdAt || Date.now(),
          items: [],
          status: 'pending'
        }
      }

      var order = orderMap[key]
      order.items.push({
        _id: item._id || '',
        id: item.dishId || item._id,
        name: item.dishName || '',
        quantity: item.quantity || 1,
        status: item.status || 'submitted',
        taste: item.taste || ''
      })

      // 根据菜品状态推断订单状态
      // all served → completed, any cooking → cooking, else pending
    })

    var orders = Object.values(orderMap)

    // 计算每个订单的聚合状态
    orders.forEach(function(o) {
      var allServed = o.items.every(function(it) { return it.status === 'served' })
      var anyCooking = o.items.some(function(it) { return it.status === 'cooking' })
      var anyCompleted = o.items.some(function(it) { return it.status === 'completed' })

      if (allServed || anyCompleted) {
        o.status = 'completed'
      } else if (anyCooking) {
        o.status = 'cooking'
      } else {
        o.status = 'pending'
      }
    })

    // 按当前 tab 筛选
    var filtered = orders.filter(function(o) {
      if (currentTab === 'completed') return o.status === 'completed'
      if (currentTab === 'cooking') return o.status === 'cooking'
      return o.status === 'pending'
    })

    // 格式化为 WXML 需要的格式
    filtered = filtered.map(function(o) {
      return {
        tableNo: o.tableNo,
        createdAt: o.createdAt,
        time: formatTime(o.createdAt),
        status: o.status,
        items: o.items
      }
    })

    that.setData({ orders: filtered })
  },

  updateItemStatus: function(e) {
    var orderCreatedAt = e.currentTarget.dataset.orderid
    var itemId = e.currentTarget.dataset.itemid
    var docId = e.currentTarget.dataset.docid
    var status = e.currentTarget.dataset.status
    var shopId = wx.getStorageSync('currentShopId') || ''

    try {
      var db = getDb()
      if (docId) {
        db.collection('order_items').doc(docId).update({
          data: { status: status }
        })
      } else {
        db.collection('order_items')
          .where({ dishId: itemId, shopId: shopId })
          .update({
            data: { status: status }
          })
      }
    } catch (err) {}

    // 同步更新本地
    var orders = wx.getStorageSync('allOrders') || []
    orders.forEach(function(order) {
      if (order.createdAt === orderCreatedAt && order.items) {
        order.items.forEach(function(item) {
          if (item.id === itemId) item.status = status
        })
      }
    })
    wx.setStorageSync('allOrders', orders)

    this.loadOrders()
    wx.showToast({ title: '已更新', icon: 'success' })
  },

  revertItemStatus: function(e) {
    var orderCreatedAt = e.currentTarget.dataset.orderid
    var itemId = e.currentTarget.dataset.itemid
    var docId = e.currentTarget.dataset.docid
    var shopId = wx.getStorageSync('currentShopId') || ''

    try {
      var db = getDb()
      if (docId) {
        db.collection('order_items').doc(docId).update({
          data: { status: 'submitted' }
        })
      } else {
        db.collection('order_items')
          .where({ dishId: itemId, shopId: shopId })
          .update({
            data: { status: 'submitted' }
          })
      }
    } catch (err) {}

    var orders = wx.getStorageSync('allOrders') || []
    orders.forEach(function(order) {
      if (order.createdAt === orderCreatedAt && order.items) {
        order.items.forEach(function(item) {
          if (item.id === itemId) item.status = 'submitted'
        })
      }
    })
    wx.setStorageSync('allOrders', orders)

    this.loadOrders()
    wx.showToast({ title: '已退回', icon: 'success' })
  },

  updateStatus: function(e) {
    var orderCreatedAt = parseInt(e.currentTarget.dataset.id) || 0
    var newStatus = e.currentTarget.dataset.status
    var tableNo = e.currentTarget.dataset.tableno || ''
    var shopId = wx.getStorageSync('currentShopId') || ''

    // 更新云数据库
    try {
      var db = getDb()
      var where = { createdAt: orderCreatedAt, shopId: shopId }
      if (tableNo) where.tableName = tableNo
      db.collection('order_items')
        .where(where)
        .update({
          data: { status: newStatus }
        })
    } catch (err) {}

    // 同步更新本地
    var orders = wx.getStorageSync('allOrders') || []
    orders.forEach(function(order) {
      if (order.createdAt === orderCreatedAt) {
        order.status = newStatus
        // 如果整单完成，标记所有菜品
        if (newStatus === 'completed' && order.items) {
          order.items.forEach(function(item) { item.status = 'served' })
        }
      }
    })
    wx.setStorageSync('allOrders', orders)

    this.loadOrders()
    wx.showToast({ title: '已更新', icon: 'success' })
  }
})
