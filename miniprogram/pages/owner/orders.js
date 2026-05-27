const { getDb } = require('../../utils/cloud')
const { formatDateTime, isSameDay, isSameMonth, isSameYear } = require('../../utils/time')

Page({
  data: {
    filter: 'today',
    orders: [],
    orderCount: 0,
    totalAmount: '0.00',
    completedCount: 0,
    completedAmount: '0.00',
    guestCount: 0,
    showDetailPopup: false,
    detailOrder: {}
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
    var that = this
    var shopId = wx.getStorageSync('currentShopId') || ''
    try {
      var db = getDb()
      db.collection('orders')
        .where({ shopId: shopId })
        .orderBy('createdAt', 'desc')
        .get({
          success: function(res) {
            var orders = res.data || []
            if (orders.length === 0) {
              orders = wx.getStorageSync('allOrders') || []
            }
            that.processOrders(orders)
          },
          fail: function() {
            var orders = wx.getStorageSync('allOrders') || []
            that.processOrders(orders)
          }
        })
    } catch (e) {
      var orders = wx.getStorageSync('allOrders') || []
      that.processOrders(orders)
    }
  },

  processOrders: function(orders) {
    var filter = this.data.filter

    var filtered = orders.filter(function(o) {
      if (filter === 'today') {
        return isSameDay(o.createdAt, Date.now())
      } else if (filter === 'month') {
        return isSameMonth(o.createdAt, Date.now())
      } else if (filter === 'year') {
        return isSameYear(o.createdAt, Date.now())
      }
      return true
    })

    var statusMap = {
      'pending': '未结账',
      'cooking': '制作中',
      'served': '已上菜',
      'completed': '已结账',
      'paid': '已结账',
      'cancelled': '已取消'
    }

    // 按翻台批次合并：pending 按桌号合并，paid 按桌号+翻台时间(paidAt)合并
    var tableMap = {}
    filtered.forEach(function(o) {
      var orderStatus = o.status || 'pending'
      // pending: 同一次就餐合并；paid: 同一次翻台（相同paidAt）合并
      var groupKey
      if (orderStatus === 'pending') {
        groupKey = (o.tableName || o.tableNo || '') + '_pending'
      } else if (orderStatus === 'paid' || orderStatus === 'completed') {
        groupKey = (o.tableName || o.tableNo || '') + '_' + (o.paidAt || o.createdAt || '')
      } else {
        groupKey = (o.tableName || o.tableNo || '') + '_' + (o._id || orderStatus)
      }
      if (!groupKey) return

      if (!tableMap[groupKey]) {
        tableMap[groupKey] = {
          tableNo: o.tableName || o.tableNo || '',
          guestCount: 0,
          totalPrice: 0,
          status: orderStatus,
          createdAt: o.createdAt || Date.now(),
          allItems: [],
          detailItems: []
        }
      }

      var entry = tableMap[groupKey]

      // 取最大客人数
      entry.guestCount = Math.max(entry.guestCount, parseInt(o.guestCount) || 0)

      // 取最新创建时间
      if ((o.createdAt || 0) > entry.createdAt) {
        entry.createdAt = o.createdAt
      }

      // 同组状态取最高（已结账 > 未结账）
      if (orderStatus === 'completed' || orderStatus === 'paid') {
        entry.status = 'paid'
      }

      // 合并菜品
      var items = o.items || []
      items.forEach(function(item) {
        var dishName = item.name || item.dishName || ''
        var qty = item.quantity || 1
        var price = item.price || 0
        entry.allItems.push({
          name: dishName,
          quantity: qty,
          taste: item.taste || ''
        })
        entry.detailItems.push({
          name: dishName,
          quantity: qty,
          price: price,
          taste: item.taste || '',
          fromOwner: !!o.fromOwner
        })
      })

      // 累加金额
      var orderAmount = o.totalPrice || 0
      if (!orderAmount && o.items) {
        o.items.forEach(function(item) {
          orderAmount += (item.price || 0) * (item.quantity || 1)
        })
      }
      entry.totalPrice += orderAmount
    })

    // 计算统计数据
    var orderCount = 0
    var totalAmount = 0
    var completedCount = 0
    var completedAmount = 0
    var guestCount = 0

    var displayOrders = []
    Object.keys(tableMap).sort().forEach(function(key) {
      var entry = tableMap[key]
      orderCount++
      guestCount += entry.guestCount
      totalAmount += entry.totalPrice

      if (entry.status === 'paid') {
        completedCount++
        completedAmount += entry.totalPrice
      }

      displayOrders.push({
        tableNo: entry.tableNo,
        guestCount: entry.guestCount,
        timeText: formatDateTime(entry.createdAt),
        statusText: statusMap[entry.status] || '未结账',
        status: entry.status,
        totalPrice: entry.totalPrice.toFixed(2),
        items: entry.allItems,
        detailItems: entry.detailItems
      })
    })

    this.setData({
      orders: displayOrders,
      orderCount: orderCount,
      totalAmount: totalAmount.toFixed(2),
      completedCount: completedCount,
      completedAmount: completedAmount.toFixed(2),
      guestCount: guestCount
    })
  },

  showDetail: function(e) {
    var index = e.currentTarget.dataset.index
    var order = this.data.orders[index]
    if (order) {
      this.setData({ showDetailPopup: true, detailOrder: order })
    }
  },

  closeDetail: function() {
    this.setData({ showDetailPopup: false, detailOrder: {} })
  }
})
