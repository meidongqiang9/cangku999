const { getDb } = require('../../utils/cloud')
const { formatPrice } = require('../../utils/currency')
const { debounce } = require('../../utils/debounce')
const { formatTime, formatDateTime } = require('../../utils/time')

Page({
  data: {
    tableNo: '',
    sessionId: '',
    orderGroups: [],       // 按批次分组的菜品
    servedCount: 0,
    submittedCount: 0,
    totalPrice: '¥0.00',
    allItems: [],          // 所有菜品扁平列表
    hasUnpaidOrder: false,
    watcher: null
  },

  onLoad: function(options) {
    var that = this
    var sessionId = options.sessionId || ''
    var tableNo = options.tableNo || ''

    if (!tableNo) {
      var currentTable = wx.getStorageSync('currentTable')
      if (currentTable) {
        tableNo = currentTable.tableNo
      }
    }

    that.setData({
      sessionId: sessionId,
      tableNo: tableNo
    })

    that.loadOrderData()
  },

  onShow: function() {
    // 每次显示时刷新数据
    this.loadOrderData()
  },

  onUnload: function() {
    // 清理 watch 监听
    if (this.data.watcher) {
      this.data.watcher.close()
    }
  },

  // 加载订单数据
  loadOrderData: function() {
    var that = this
    var tableNo = that.data.tableNo
    var shopId = wx.getStorageSync('currentShopId') || ''

    try {
      var db = getDb()
      // 只监听未结账的菜品（翻台后已结账的不再显示）
      var watcher = db.collection('order_items')
        .where({ tableName: tableNo, shopId: shopId, status: 'submitted' })
        .watch({
          onChange: function() {
            that.fetchOrderItems(tableNo)
          },
          onError: function(err) {
            console.error('watch error:', err)
          }
        })
      that.setData({ watcher: watcher })

      that.fetchOrderItems(tableNo)
    } catch (e) {
      that.loadFromStorage(tableNo)
    }
  },

  // 从云数据库取数据
  fetchOrderItems: function(tableNo) {
    var that = this
    var shopId = wx.getStorageSync('currentShopId') || ''
    try {
      var db = getDb()
      // 只查未结账的菜品，已结账（paid）的不显示
      db.collection('order_items')
        .where({ tableName: tableNo, shopId: shopId, status: 'submitted' })
        .orderBy('createdAt', 'asc')
        .get({
          success: function(res) {
            var items = res.data || []
            that.processItems(items)
          },
          fail: function() {
            that.loadFromStorage(tableNo)
          }
        })
    } catch (e) {
      that.loadFromStorage(tableNo)
    }
  },

  // 从本地 Storage 取数据（降级模式）
  loadFromStorage: function(tableNo) {
    var orders = wx.getStorageSync('allOrders') || []
    var tableOrders = orders.filter(function(o) {
      return String(o.tableNo) === String(tableNo) && o.status !== 'paid'
    }).sort(function(a, b) { return a.createdAt - b.createdAt })

    var allItems = []
    tableOrders.forEach(function(order) {
      if (order.items) {
        order.items.forEach(function(item) {
          allItems.push({
            dishId: item.id,
            dishName: item.name,
            price: item.price,
            quantity: item.quantity,
            status: item.status || 'submitted',
            createdAt: order.createdAt,
            batchLabel: order.fromOwner ? '老板加菜' : '点单'
          })
        })
      }
    })
    this.processItems(allItems)
  },

  // 处理菜品数据，按批次分组
  processItems: function(items) {
    var that = this
    var submittedCount = 0
    var servedCount = 0
    var returnedCount = 0
    var totalPrice = 0

    // 按 createdAt 分组为批次
    var batchMap = {}
    items.forEach(function(item) {
      var batchKey = item.createdAt || item._createTime || 'single'
      if (!batchMap[batchKey]) {
        batchMap[batchKey] = []
      }
      batchMap[batchKey].push(item)

      // 统计
      if (item.status === 'submitted') submittedCount++
      else if (item.status === 'served') servedCount++
      else if (item.status === 'returned') returnedCount++

      totalPrice += (item.price || 0) * (item.quantity || 0)
    })

    // 生成分组标题
    var batches = Object.keys(batchMap).sort()
    var orderGroups = []
    var batchIndex = 0
    batches.forEach(function(key) {
      batchIndex++
      var batchItems = batchMap[key]
      var batchSubtotal = 0
      batchItems.forEach(function(item) {
        batchSubtotal += (item.price || 0) * (item.quantity || 0)
      })

      // 生成批次标题
      var time = new Date(parseInt(key) || Date.now())
      var title = ''
      if (batchIndex === 1) {
        title = '第1次点单'
      } else {
        title = '第' + batchIndex + '次加菜'
      }
      title += '  ' + formatTime(time)

      orderGroups.push({
        key: key,
        title: title,
        items: batchItems,
        subtotal: formatPrice(batchSubtotal),
        timeText: formatTime(time),
        fromOwner: batchItems.length > 0 && batchItems[0].fromOwner
      })
    })

    that.setData({
      orderGroups: orderGroups,
      allItems: items,
      submittedCount: submittedCount,
      servedCount: servedCount,
      returnedCount: returnedCount,
      totalPrice: formatPrice(totalPrice),
      hasUnpaidOrder: items.length > 0
    })
  },

  // 追加点单
  addDish: function() {
    var that = this
    wx.navigateTo({
      url: '/pages/menu/menu?tableNo=' + that.data.tableNo +
           '&guestCount=' + (wx.getStorageSync('currentTable') || {}).guestCount +
           '&additional=1'
    })
  },

  // 结账
  checkout: debounce(function() {
    var that = this
    if (!that.data.hasUnpaidOrder) {
      wx.showToast({ title: '暂无待结账菜品', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: '/pages/order/receipt/receipt?tableNo=' + that.data.tableNo
    })
  }, 300),

  // 返回首页
  goHome: function() {
    wx.reLaunch({ url: '/pages/index/index' })
  }
})
