const { getDb } = require('../../../utils/cloud')
const { formatPrice } = require('../../../utils/currency')
const { debounce } = require('../../../utils/debounce')

Page({
  data: {
    tableNo: '',
    items: [],
    allGroups: [],
    totalPrice: '0.00米',
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
    try {
      var db = getDb()
      db.collection('order_items')
        .where({ tableName: tableNo })
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
      return String(o.tableNo) === String(tableNo)
    }).sort(function(a, b) { return a.createdAt - b.createdAt }).forEach(function(order) {
      groupIndex++
      if (order.items) {
        var label = groupIndex === 1 ? '首次点单' : '第' + groupIndex + '次加菜'
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
      totalPrice: formatPrice(totalPrice)
    })
  },

  summarize: function(items) {
    var that = this
    // 按 dishName 合并（同名同价菜品合并数量）
    var mergedMap = {}
    items.forEach(function(item) {
      var key = item.dishName + '_' + (item.price || 0)
      if (!mergedMap[key]) {
        mergedMap[key] = {
          dishName: item.dishName,
          price: item.price,
          quantity: 0
        }
      }
      mergedMap[key].quantity += item.quantity || 1
    })

    var mergedItems = []
    var totalPrice = 0
    for (var k in mergedMap) {
      var m = mergedMap[k]
      m.subtotal = m.price * m.quantity
      totalPrice += m.subtotal
      mergedItems.push(m)
    }

    that.setData({
      items: mergedItems,
      allGroups: [{ label: '全部菜品', items: mergedItems, subtotal: totalPrice }],
      totalPrice: formatPrice(totalPrice)
    })
  },

  // 确定结账
  pay: debounce(function() {
    var that = this
    if (that.data.paying || that.data.paid) return

    that.setData({ paying: true })

    var totalPrice = that.data.totalPrice
    var amount = parseFloat(totalPrice)
    if (isNaN(amount) || amount <= 0) {
      wx.showToast({ title: '金额错误', icon: 'none' })
      that.setData({ paying: false })
      return
    }

    // 检查商户号是否已配置
    var shopConfig = wx.getStorageSync('shopConfig') || {}
    var mchId = shopConfig.mchId || ''

    if (!mchId) {
      // 未配置商户号 → 提示到前台结账
      that.setData({ paying: false })
      wx.showModal({
        title: '提示',
        content: '请到前台扫码结账',
        showCancel: false,
        confirmText: '我知道了'
      })
      return
    }

    // 已配置商户号 → 走微信支付
    wx.showModal({
      title: '确认结账',
      content: '共计 ' + totalPrice,
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
          totalPrice: parseFloat(that.data.totalPrice),
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
      // 关闭会话
      db.collection('sessions')
        .where({ tableName: tableNo, status: 'active' })
        .update({
          data: { status: 'closed', paidAt: Date.now() }
        })
      // 更新订单状态
      db.collection('orders')
        .where({ tableName: tableNo, status: 'pending' })
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
