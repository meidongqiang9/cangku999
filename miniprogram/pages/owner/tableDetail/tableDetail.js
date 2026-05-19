const { getDb } = require('../../../utils/cloud')

Page({
  data: {
    table: {},
    allItems: [],
    totalPrice: '0.00'
  },

  onLoad: function() {
    var table = wx.getStorageSync('currentTableDetail')
    if (table) {
      this.setData({ table: table })
      this.loadTableOrders()
    }
  },

  onShow: function() {
    this.loadTableOrders()
  },

  loadTableOrders: function() {
    var that = this
    var table = that.data.table

    try {
      var db = getDb()
      db.collection('order_items')
        .where({ tableName: table.name })
        .orderBy('createdAt', 'asc')
        .get({
          success: function(res) {
            var items = res.data || []
            if (items.length === 0) {
              that.loadFromLocal(table)
            } else {
              // 按 createdAt 分组
              that.groupAndRender(items, table)
            }
          },
          fail: function() {
            that.loadFromLocal(table)
          }
        })
    } catch (e) {
      that.loadFromLocal(table)
    }
  },

  loadFromLocal: function(table) {
    var orders = wx.getStorageSync('allOrders') || []
    var tableOrders = orders.filter(function(o) {
      return o.tableNo === table.name
    }).sort(function(a, b) { return a.createdAt - b.createdAt })

    var flatItems = []
    tableOrders.forEach(function(o) {
      (o.items || []).forEach(function(item) {
        flatItems.push({
          dishId: item.id,
          dishName: item.name,
          price: item.price,
          quantity: item.quantity,
          createdAt: o.createdAt,
          fromOwner: !!o.fromOwner
        })
      })
    })
    this.groupAndRender(flatItems, table)
  },

  groupAndRender: function(items, table) {
    var that = this
    var totalPrice = 0

    function numToChinese(num) {
      var nums = ['零','一','二','三','四','五','六','七','八','九','十']
      if (num <= 10) return nums[num]
      return String(num)
    }

    // 按 createdAt 分组
    var batchMap = {}
    items.forEach(function(item) {
      var key = item.createdAt || Date.now()
      if (!batchMap[key]) batchMap[key] = []
      batchMap[key].push(item)
    })

    var batches = Object.keys(batchMap).sort()
    var groups = {}
    var batchIndex = 0

    batches.forEach(function(key) {
      batchIndex++
      var batchItems = batchMap[key]
      var isOwner = batchItems[0] && batchItems[0].fromOwner

      var title
      if (isOwner) {
        title = '终端协助'
      } else if (batchIndex === 1) {
        title = '首次点单'
      } else {
        title = '第' + numToChinese(batchIndex) + '次加菜'
      }

      // 合并到同名 group
      if (!groups[title]) groups[title] = []
      groups[title] = groups[title].concat(batchItems)
    })

    var allItems = []
    Object.keys(groups).forEach(function(key) {
      if (groups[key] && groups[key].length > 0) {
        var mapped = groups[key].map(function(item) {
          var price = item.price || 0
          var quantity = item.quantity || 1
          totalPrice += price * quantity
          return {
            id: item.dishId || item._id,
            name: item.dishName || item.name || '',
            price: price,
            quantity: quantity
          }
        })

        var subtotal = 0
        mapped.forEach(function(it) { subtotal += it.price * it.quantity })

        allItems.push({
          title: key,
          items: mapped,
          subtotal: subtotal.toFixed(2)
        })
      }
    })

    this.setData({
      allItems: allItems,
      totalPrice: totalPrice.toFixed(2)
    })
  },

  changePrice: function(e) {
    var isPlus = e.currentTarget.dataset.type === 'plus'
    var itemId = e.currentTarget.dataset.itemid
    var table = this.data.table

    // 更新云数据库
    try {
      var db = getDb()
      db.collection('order_items')
        .where({ dishId: itemId, tableName: table.name })
        .get({
          success: function(res) {
            if (res.data && res.data.length > 0) {
              var item = res.data[0]
              var newPrice = isPlus ? (item.price || 0) + 1 : Math.max(0, (item.price || 0) - 1)
              db.collection('order_items').doc(item._id).update({
                data: { price: newPrice }
              })
            }
          }
        })
    } catch (err) {}

    // 更新本地 Storage
    var allOrders = wx.getStorageSync('allOrders') || []
    allOrders.forEach(function(order) {
      if (order.tableNo === table.name && order.status !== 'completed' && order.fromOwner) {
        (order.items || []).forEach(function(item) {
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
    var table = that.data.table
    wx.showModal({
      title: '确认翻台',
      content: '确定要清台吗？流水数据会保留',
      success: function(res) {
        if (res.confirm) {
          var clearTime = Date.now()

          // 更新云数据库 - 关闭会话
          try {
            var db = getDb()
            db.collection('sessions')
              .where({ tableName: table.name, status: 'active' })
              .update({ data: { status: 'closed', clearedAt: clearTime } })
            db.collection('orders')
              .where({ tableName: table.name, status: 'pending' })
              .update({ data: { status: 'paid', paidAt: clearTime } })
          } catch (err) {}

          // 更新本地
          var orders = wx.getStorageSync('allOrders') || []
          orders.forEach(function(o) {
            if (o.tableNo === table.name && !o.cleared) {
              o.cleared = true
              o.clearTime = clearTime
            }
          })
          wx.setStorageSync('allOrders', orders)
          wx.removeStorageSync('tableChecked_' + table.name)

          that.loadTableOrders()
          wx.showToast({ title: '翻台成功', icon: 'success' })
        }
      }
    })
  }
})
