const { getDb } = require('../../../utils/cloud')
const { formatPrice } = require('../../../utils/currency')
const { debounce } = require('../../../utils/debounce')

Page({
  data: {
    tableNo: '',
    items: [],
    allGroups: [],
    totalPrice: '💰0.00',
    rawTotal: 0,
    paying: false,
    paid: false
  },

  onLoad: function(options) {
    var tableNo = options.tableNo || ''
    if (!tableNo) {
      var currentTable = wx.getStorageSync('currentTable')
      tableNo = currentTable ? currentTable.tableNo : ''
    }
    this.setData({ tableNo: tableNo })
    this.loadItems(tableNo)
  },

  loadItems: function(tableNo) {
    var that = this
    var shopId = wx.getStorageSync('currentShopId') || ''
    try {
      var db = getDb()
      // 只查未结账的菜品
      db.collection('order_items')
        .where({ tableName: tableNo, shopId: shopId, status: 'submitted' })
        .orderBy('createdAt', 'asc')
        .get({
          success: function(res) {
            var items = res.data || []
            that.summarize(items)
          },
          fail: function() {
            that.loadFromStorage(tableNo)
          }
        })
    } catch (e) {
      that.loadFromStorage(tableNo)
    }
  },

  loadFromStorage: function(tableNo) {
    var orders = wx.getStorageSync('allOrders') || []
    var allItems = []
    var groupLabels = {}
    var groupIndex = 0

    orders.filter(function(o) {
      return String(o.tableNo) === String(tableNo) && o.status !== 'paid'
    }).sort(function(a, b) { return a.createdAt - b.createdAt }).forEach(function(order) {
      groupIndex++
      if (order.items) {
        var label = groupIndex === 1 ? '首次菜单' : '第' + groupIndex + '次菜单'
        if (order.fromOwner) label = '老板' + label.substring(2)
        groupLabels[label] = groupLabels[label] || []
        order.items.forEach(function(item) {
          groupLabels[label].push(item)
        })
      }
    })

    var allGroups = []
    var flatItems = []
    for (var label in groupLabels) {
      var groupItems = groupLabels[label]
      var subtotal = 0
      groupItems.forEach(function(item) { subtotal += item.price * item.quantity })
      allGroups.push({ label: label, items: groupItems, subtotal: subtotal })
      flatItems = flatItems.concat(groupItems)
    }

    var totalPrice = 0
    flatItems.forEach(function(item) { totalPrice += item.price * item.quantity })

    this.setData({
      items: flatItems,
      allGroups: allGroups,
      totalPrice: formatPrice(totalPrice),
      rawTotal: totalPrice
    })
  },

  summarize: function(items) {
    var that = this

    // 按 createdAt 分组为批次
    var batchMap = {}
    items.forEach(function(item) {
      var key = item.createdAt || item._createTime || 'single'
      if (!batchMap[key]) batchMap[key] = []
      batchMap[key].push({
        dishName: item.dishName,
        price: item.price || 0,
        quantity: item.quantity || 1,
        taste: item.taste || '',
        fromOwner: item.fromOwner
      })
    })

    var batches = Object.keys(batchMap).sort()
    var allGroups = []
    var flatItems = []
    var totalPrice = 0
    var batchIndex = 0

    batches.forEach(function(key) {
      batchIndex++
      var batchItems = batchMap[key]
      var isOwner = batchItems[0] && batchItems[0].fromOwner

      var label
      if (isOwner) {
        label = '终端协助'
      } else if (batchIndex === 1) {
        label = '首次菜单'
      } else {
        label = '第' + batchIndex + '次菜单'
      }

      var subtotal = 0
      var grouped = batchItems.map(function(dish) {
        var dishSubtotal = dish.price * dish.quantity
        subtotal += dishSubtotal
        totalPrice += dishSubtotal
        return {
          dishName: dish.dishName,
          price: dish.price,
          quantity: dish.quantity,
          taste: dish.taste || '',
          subtotal: dishSubtotal
        }
      })

      allGroups.push({ label: label, items: grouped, subtotal: subtotal })
      flatItems = flatItems.concat(grouped)
    })

    that.setData({
      items: flatItems,
      allGroups: allGroups,
      totalPrice: formatPrice(totalPrice),
      rawTotal: totalPrice
    })
  },

  // 确定结账
  pay: debounce(function() {
    var that = this
    if (that.data.paying || that.data.paid) return

    that.setData({ paying: true })

    var amount = that.data.rawTotal
    if (isNaN(amount) || amount <= 0) {
      wx.showToast({ title: '金额错误', icon: 'none' })
      that.setData({ paying: false })
      return
    }

    that.markCheckoutRequested()

    // 检查商户号是否已配置
    var shopConfig = wx.getStorageSync('shopConfig') || {}
    var mchId = shopConfig.mchId || ''

    if (!mchId) {
      // 未配置商户号 → 提示到前台结账
      that.setData({ paying: false })
      wx.showModal({
        title: '提示',
        content: '请到前台扫码',
        showCancel: false,
        confirmText: '我知道了'
      })
      return
    }

    // 已配置商户号 → 走微信支付
    wx.showModal({
      title: '确认结账',
      content: '共计 ' + that.data.totalPrice,
      confirmText: '确认支付',
      cancelText: '取消',
      success: function(res) {
        if (res.confirm) {
          that.processPayment()
        } else {
          that.setData({ paying: false })
        }
      }
    })
  }, 300),

  markCheckoutRequested: function() {
    var that = this
    try {
      var db = getDb()
      var shopId = wx.getStorageSync('currentShopId') || ''
      var tableNo = that.data.tableNo || ''
      if (!shopId || !tableNo) return
      var now = Date.now()
      db.collection('orders')
        .where({ tableName: tableNo, shopId: shopId, status: 'pending' })
        .update({
          data: {
            checkoutRequested: true,
            checkoutRequestedAt: now
          }
        })
    } catch (e) {}
  },

  goBackToOrder: function() {
    wx.redirectTo({ url: '/pages/order/order?tableNo=' + this.data.tableNo })
  },

  // 调起微信支付
  processPayment: function() {
    var that = this

    wx.cloud.callFunction({
      name: 'payment',
      data: {
        orderData: {
          tableNo: that.data.tableNo,
          totalPrice: that.data.rawTotal,
          items: that.data.items
        },
        shopId: wx.getStorageSync('currentShopId') || ''
      },
      success: function(res) {
        if (res.result.code === 0) {
          var payParams = res.result.data
          if (res.result.mock) {
            // 模拟支付模式（商户号配置了但支付失败时降级）
            that.processPaymentSuccess()
          } else {
            // 真实微信支付
            wx.requestPayment({
              timeStamp: payParams.timeStamp,
              nonceStr: payParams.nonceStr,
              package: payParams.package,
              signType: payParams.signType || 'MD5',
              paySign: payParams.paySign,
              success: function() {
                that.processPaymentSuccess()
              },
              fail: function(err) {
                that.setData({ paying: false })
                if (err.errMsg.indexOf('cancel') === -1) {
                  wx.showToast({ title: '支付失败，请重试', icon: 'none' })
                }
              }
            })
          }
        } else {
          that.setData({ paying: false })
          wx.showToast({ title: res.result.msg || '支付失败', icon: 'none' })
        }
      },
      fail: function() {
        // 云函数调用失败，降级为模拟
        that.processPaymentSuccess()
      }
    })
  },

  // 支付成功处理
  processPaymentSuccess: function() {
    var that = this
    var tableNo = that.data.tableNo

    // 更新云数据库订单状态
    try {
      var db = getDb()
      var shopId = wx.getStorageSync('currentShopId') || ''
      // 关闭会话
      db.collection('sessions')
        .where({ tableName: tableNo, status: 'active', shopId: shopId })
        .update({
          data: { status: 'closed', paidAt: Date.now() }
        })
      // 更新订单状态
      db.collection('orders')
        .where({ tableName: tableNo, status: 'pending', shopId: shopId })
        .update({
          data: { status: 'paid', paidAt: Date.now() }
        })
    } catch (e) {
      // 本地模式降级
    }

    // 本地记录已结账
    wx.setStorageSync('tableChecked_' + tableNo, true)
    // 清除当前桌缓存
    wx.removeStorageSync('currentTable')
    wx.removeStorageSync('currentSession')

    that.setData({ paying: false, paid: true })

    wx.showToast({ title: '支付成功', icon: 'success' })
    setTimeout(function() {
      wx.redirectTo({ url: '/pages/order/success/success' })
    }, 1000)
  }
})
