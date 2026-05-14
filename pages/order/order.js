Page({
  data: {
    order: {},
    statusText: '',
    newItems: [],
    allItems: [],
    totalPrice: 0
  },

  onLoad: function(options) {
    var that = this
    var localOrder = wx.getStorageSync('currentOrder')
    that.loadAllItems()
  },

  loadAllItems: function() {
    var tableNo = wx.getStorageSync('currentTable').tableNo
    var orders = wx.getStorageSync('allOrders') || []
    var currentOrder = wx.getStorageSync('currentOrder')
    
    var grouped = {
      '首次点单': [],
      '二次加菜': [],
      '三次加菜': [],
      '终端协助': []
    }
    var totalPrice = 0
    
    orders.forEach(function(order) {
      if (order.tableNo === tableNo && order.status !== 'completed') {
        var isOwner = order.fromOwner || false
        ;(order.items || []).forEach(function(item) {
          item.fromOwner = isOwner
          totalPrice += item.price * item.quantity
        })
      }
    })
    
    var orderList = orders.filter(function(o) {
      return o.tableNo === tableNo && o.status !== 'completed'
    }).sort(function(a, b) { return a.createdAt - b.createdAt })
    
    var ownerOrders = []
    var normalOrders = []
    orderList.forEach(function(order) {
      if (order.fromOwner) {
        ownerOrders.push(order)
      } else {
        normalOrders.push(order)
      }
    })
    
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
      }
    })
    
    if (currentOrder) {
      this.setData({
        order: currentOrder,
        allItems: allItems,
        totalPrice: totalPrice.toFixed(2)
      })
    } else if (allItems.length > 0) {
      this.setData({
        allItems: allItems,
        totalPrice: totalPrice.toFixed(2)
      })
    }
  },

  onShow: function() {
    var newItems = wx.getStorageSync('newOrderItems') || []
    this.setData({ newItems: newItems })
    this.loadAllItems()
  },

  setOrderData: function(order) {
    var statusMap = {
      'pending': '待结账',
      'cooking': '制作中',
      'served': '已上菜',
      'completed': '已完成',
      'cancelled': '已取消'
    }
    this.setData({
      order: order,
      statusText: statusMap[order.status] || '待结账'
    })
  },

  addDish: function() {
    var order = this.data.order
    wx.navigateTo({
      url: '/pages/menu/menu?tableNo=' + order.tableNo + '&guestCount=' + order.guestCount + '&fromOrder=1'
    })
  },

  checkout: function() {
    var that = this
    var price = that.data.totalPrice
    var parts = price.split('.')
    var display = parts[0]
    if (parts.length > 1) {
      display = parts[0] + ' . ' + parts[1]
    }
    wx.showModal({
      title: '确认结账',
      content: '总计 ' + display + ' 米',
      confirmText: '确定',
      cancelText: '取消',
      success: function(res) {
        if (res.confirm) {
          that.requestPayment()
        }
      }
    })
  },

  requestPayment: function() {
    var that = this
    var order = that.data.order
    var shopConfig = wx.getStorageSync('shopConfig') || {}
    var payType = shopConfig.payType || 0
    
    if (payType === 1 && shopConfig.personalQrcode) {
      wx.showModal({
        title: '付款给老板',
        content: '请截屏图中二维码，扫码付款 ' + order.totalPrice + ' 米',
        confirmText: '我已付款',
        success: function(res) {
          if (res.confirm) {
            order.status = 'completed'
            var allOrders = wx.getStorageSync('allOrders') || []
            var idx = allOrders.findIndex(function(o) { 
              return o.tableNo === order.tableNo && o.status === 'pending'
            })
            if (idx !== -1) {
              allOrders[idx].status = 'completed'
            } else {
              allOrders.unshift(order)
            }
            wx.setStorageSync('allOrders', allOrders)
            wx.setStorageSync('currentOrder', order)
            wx.setStorageSync('receiptTotal', that.data.totalPrice)
            wx.navigateTo({ url: '/pages/order/receipt/receipt' })
          }
        },
        fail: function() {
          wx.previewImage({
            urls: [shopConfig.personalQrcode]
          })
        }
      })
      return
    }
    
    wx.showLoading({ title: '正在调起支付...' })
    
    // 检查是否配置了商户信息
    if (!shopConfig.mchId || !shopConfig.mchKey) {
      // 开发测试模式 - 直接成功
      setTimeout(function() {
        wx.hideLoading()
        order.status = 'completed'
        
        // 更新allOrders中的订单状态
        var allOrders = wx.getStorageSync('allOrders') || []
        var idx = allOrders.findIndex(function(o) { 
          return o.tableNo === order.tableNo && o.status === 'pending'
        })
        if (idx !== -1) {
          allOrders[idx].status = 'completed'
        } else {
          allOrders.unshift(order)
        }
        wx.setStorageSync('allOrders', allOrders)
        wx.setStorageSync('currentOrder', order)
        wx.setStorageSync('receiptTotal', that.data.totalPrice)
        wx.navigateTo({ url: '/pages/order/receipt/receipt' })
      }, 1500)
      return
    }
    
    // 调用云函数获取支付参数
    wx.cloud.callFunction({
      name: 'payment',
      data: {
        action: 'getPaymentParams',
        orderData: {
          tableNo: order.tableNo,
          guestCount: order.guestCount,
          items: order.items,
          totalPrice: order.totalPrice
        },
        shopConfig: shopConfig
      },
      success: function(res) {
        if (res.result && res.result.code === 0) {
          var payParams = res.result.data
          
          wx.requestPayment({
            timeStamp: payParams.timeStamp,
            nonceStr: payParams.nonceStr,
            package: payParams.package,
            signType: 'MD5',
            paySign: payParams.paySign,
            success: function() {
              wx.hideLoading()
              order.status = 'completed'
              order.tradeNo = payParams.tradeNo
              wx.setStorageSync('currentOrder', order)
              
              var allOrders = wx.getStorageSync('allOrders') || []
              allOrders.unshift(order)
              wx.setStorageSync('allOrders', allOrders)
              
              wx.setStorageSync('receiptTotal', that.data.totalPrice)
              wx.navigateTo({ url: '/pages/order/receipt/receipt' })
            },
            fail: function(e) {
              wx.hideLoading()
              if (e.errMsg && e.errMsg.indexOf('cancel') !== -1) {
                wx.showToast({ title: '已取消支付', icon: 'none' })
              } else {
                wx.showToast({ title: '支付失败', icon: 'none' })
              }
            }
          })
        } else {
          wx.hideLoading()
          wx.showToast({ title: res.result?.msg || '获取支付参数失败', icon: 'none' })
        }
      },
      fail: function(e) {
        wx.hideLoading()
        // 云函数调用失败，使用模拟模式
        console.error('云函数调用失败', e)
        order.status = 'completed'
        wx.setStorageSync('currentOrder', order)
        
        var allOrders = wx.getStorageSync('allOrders') || []
        allOrders.unshift(order)
        wx.setStorageSync('allOrders', allOrders)
        
        wx.setStorageSync('receiptTotal', that.data.totalPrice)
        wx.navigateTo({ url: '/pages/order/receipt/receipt' })
      }
    })
  }
})