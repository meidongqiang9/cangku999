const { getDb } = require('../../../utils/cloud')

Page({
  data: {
    table: {},
    allItems: [],
    totalPrice: '0.00',
    ownerTotal: '0.00',
    totalAll: '0.00'
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
    var shopId = wx.getStorageSync('currentShopId') || ''

    try {
      var db = getDb()
      // 只查未结账的菜品（翻台后已结账的不再显示）
      db.collection('order_items')
        .where({ tableName: table.name, shopId: shopId, status: 'submitted' })
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
      return o.tableNo === table.name && o.status !== 'paid'
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

  // 同步 orders 快照：修改 order_items 后，更新 orders 中对应菜品的数量和价格
  syncOrdersSnapshot: function(table, shopId, dishId, field, value) {
    try {
      var db = getDb()
      db.collection('orders')
        .where({ tableName: table.name, shopId: shopId, status: 'pending' })
        .get({
          success: function(res) {
            (res.data || []).forEach(function(order) {
              var items = order.items || []
              var found = false
              // 更新菜品数据
              for (var i = 0; i < items.length; i++) {
                if ((items[i].dishId || items[i].id) === dishId) {
                  found = true
                  if (field === 'quantity') items[i].quantity = value
                  if (field === 'price') items[i].price = value
                  break
                }
              }
              if (!found) return
              // 数量减到0则移除菜品
              if (field === 'quantity' && value === 0) {
                items = items.filter(function(item) {
                  return (item.dishId || item.id) !== dishId
                })
              }
              // 重算金额
              var newTotal = 0
              items.forEach(function(item) {
                newTotal += (item.price || 0) * (item.quantity || 1)
              })
              db.collection('orders').doc(order._id).update({
                data: { items: items, totalPrice: newTotal }
              })
            })
          }
        })
    } catch (e) {}
  },

  groupAndRender: function(items, table) {
    var that = this
    var customerTotal = 0
    var ownerTotal = 0

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
        var isOwnerGroup = key === '终端协助'
        var mapped = groups[key].map(function(item) {
          var price = item.price || 0
          var quantity = item.quantity || 1
          // 分开计入顾客总额和协助总额
          if (isOwnerGroup) {
            ownerTotal += price * quantity
          } else {
            customerTotal += price * quantity
          }
          return {
            id: item.dishId || item._id,
            name: item.dishName || item.name || '',
            price: price,
            quantity: quantity,
            dishId: item.dishId || '',
            taste: item.taste || '',
            originalPrice: item.originalPrice || price
          }
        })

        var subtotal = 0
        mapped.forEach(function(it) { subtotal += it.price * it.quantity })

        allItems.push({
          title: key,
          items: mapped,
          subtotal: subtotal.toFixed(2),
          isOwner: isOwnerGroup
        })
      }
    })

    this.setData({
      allItems: allItems,
      totalPrice: customerTotal.toFixed(2),
      ownerTotal: ownerTotal.toFixed(2),
      totalAll: (customerTotal + ownerTotal).toFixed(2)
    })
  },

  // 终端协助：直接输入数量
  onOwnerQtyBlur: function(e) {
    var itemId = e.currentTarget.dataset.itemid
    var val = parseInt(e.detail.value)
    var table = this.data.table
    var shopId = wx.getStorageSync('currentShopId') || ''
    var that = this

    // 非法或负数 → 恢复原值
    if (isNaN(val) || val < 0) {
      this.loadTableOrders()
      return
    }

    // 先更新本地缓存（即时反馈）
    var allOrders = wx.getStorageSync('allOrders') || []
    allOrders.forEach(function(order) {
      if (order.tableNo === table.name && !order.cleared && order.fromOwner) {
        (order.items || []).forEach(function(item) {
          if (item.id === itemId) {
            if (val === 0) { order.items = (order.items || []).filter(function(i) { return i.id !== itemId }) }
            else { item.quantity = val }
          }
        })
      }
    })
    wx.setStorageSync('allOrders', allOrders)

    // 更新云数据库，完成后刷新
    try {
      var db = getDb()
      db.collection('order_items')
        .where({ dishId: itemId, tableName: table.name, shopId: shopId, fromOwner: true, status: 'submitted' })
        .get({
          success: function(res) {
            if (res.data && res.data.length > 0) {
              var item = res.data[0]
              var cb = function() {
                that.syncOrdersSnapshot(table, shopId, itemId, 'quantity', val)
                setTimeout(function() { that.loadTableOrders() }, 150)
              }
              if (val === 0) {
                db.collection('order_items').doc(item._id).remove({ success: cb, fail: cb })
              } else {
                db.collection('order_items').doc(item._id).update({ data: { quantity: val }, success: cb, fail: cb })
              }
            } else {
              that.loadTableOrders()
            }
          },
          fail: function() { that.loadTableOrders() }
        })
    } catch (err) { that.loadTableOrders() }
  },

  // 终端协助：直接输入单价
  onOwnerPriceBlur: function(e) {
    var itemId = e.currentTarget.dataset.itemid
    var val = parseFloat(e.detail.value)
    var maxPrice = parseFloat(e.currentTarget.dataset.originalprice) || 0
    var table = this.data.table
    var shopId = wx.getStorageSync('currentShopId') || ''
    var that = this

    // 非法/负数/超上限 → 恢复原值
    if (isNaN(val) || val < 0 || (maxPrice > 0 && val > maxPrice)) {
      this.loadTableOrders()
      return
    }

    // 先更新本地缓存
    var allOrders = wx.getStorageSync('allOrders') || []
    allOrders.forEach(function(order) {
      if (order.tableNo === table.name && !order.cleared && order.fromOwner) {
        (order.items || []).forEach(function(item) {
          if (item.id === itemId) item.price = val
        })
      }
    })
    wx.setStorageSync('allOrders', allOrders)

    // 更新云数据库，完成后刷新
    try {
      var db = getDb()
      db.collection('order_items')
        .where({ dishId: itemId, tableName: table.name, shopId: shopId, fromOwner: true, status: 'submitted' })
        .get({
          success: function(res) {
            if (res.data && res.data.length > 0) {
              var cb = function() {
                that.syncOrdersSnapshot(table, shopId, itemId, 'price', val)
                setTimeout(function() { that.loadTableOrders() }, 150)
              }
              db.collection('order_items').doc(res.data[0]._id).update({ data: { price: val }, success: cb, fail: cb })
            } else {
              that.loadTableOrders()
            }
          },
          fail: function() { that.loadTableOrders() }
        })
    } catch (err) { that.loadTableOrders() }
  },

  changePrice: function(e) {
    var isPlus = e.currentTarget.dataset.type === 'plus'
    var itemId = e.currentTarget.dataset.itemid
    var maxPrice = parseFloat(e.currentTarget.dataset.originalprice) || 0
    var table = this.data.table
    var shopId = wx.getStorageSync('currentShopId') || ''
    var that = this

    try {
      var db = getDb()
      db.collection('order_items')
        .where({ dishId: itemId, tableName: table.name, shopId: shopId, fromOwner: true, status: 'submitted' })
        .get({
          success: function(res) {
            if (res.data && res.data.length > 0) {
              var item = res.data[0]
              var curPrice = item.price || 0
              var newPrice
              if (isPlus) {
                newPrice = Math.min(curPrice + 1, maxPrice || curPrice + 1)
              } else {
                newPrice = Math.max(0, curPrice - 1)
              }

              // 更新本地
              var allOrders = wx.getStorageSync('allOrders') || []
              allOrders.forEach(function(order) {
                if (order.tableNo === table.name && order.status !== 'completed' && order.fromOwner) {
                  (order.items || []).forEach(function(it) {
                    if (it.id === itemId) it.price = newPrice
                  })
                }
              })
              wx.setStorageSync('allOrders', allOrders)

              var cb = function() {
                that.syncOrdersSnapshot(table, shopId, itemId, 'price', newPrice)
                setTimeout(function() { that.loadTableOrders() }, 150)
              }
              db.collection('order_items').doc(item._id).update({ data: { price: newPrice }, success: cb, fail: cb })
            }
          },
          fail: function() { that.loadTableOrders() }
        })
    } catch (err) { that.loadTableOrders() }
  },

  // 直接输入价格
  onPriceBlur: function(e) {
    var itemId = e.currentTarget.dataset.itemid
    var val = parseFloat(e.detail.value) || 0
    var table = this.data.table
    var shopId = wx.getStorageSync('currentShopId') || ''
    var that = this

    // 先更新本地缓存
    var allOrders = wx.getStorageSync('allOrders') || []
    allOrders.forEach(function(order) {
      if (order.tableNo === table.name && !order.cleared && order.fromOwner) {
        (order.items || []).forEach(function(item) {
          if (item.id === itemId) item.price = val
        })
      }
    })
    wx.setStorageSync('allOrders', allOrders)

    // 更新云数据库，完成后刷新
    try {
      var db = getDb()
      db.collection('order_items')
        .where({ dishId: itemId, tableName: table.name, shopId: shopId, fromOwner: true, status: 'submitted' })
        .get({
          success: function(res) {
            if (res.data && res.data.length > 0) {
              var cb = function() {
                that.syncOrdersSnapshot(table, shopId, itemId, 'price', val)
                setTimeout(function() { that.loadTableOrders() }, 150)
              }
              db.collection('order_items').doc(res.data[0]._id).update({ data: { price: val }, success: cb, fail: cb })
            } else {
              that.loadTableOrders()
            }
          },
          fail: function() { that.loadTableOrders() }
        })
    } catch (err) { that.loadTableOrders() }
  },

  changeQty: function(e) {
    var isPlus = e.currentTarget.dataset.type === 'plus'
    var itemId = e.currentTarget.dataset.itemid
    var table = this.data.table
    var shopId = wx.getStorageSync('currentShopId') || ''
    var that = this

    try {
      var db = getDb()
      db.collection('order_items')
        .where({ dishId: itemId, tableName: table.name, shopId: shopId, fromOwner: true, status: 'submitted' })
        .get({
          success: function(res) {
            if (res.data && res.data.length > 0) {
              var item = res.data[0]
              var curQty = item.quantity || 1
              var newQty = isPlus ? curQty + 1 : Math.max(0, curQty - 1)

              // 更新本地
              var allOrders = wx.getStorageSync('allOrders') || []
              allOrders.forEach(function(order) {
                if (order.tableNo === table.name && !order.cleared && order.fromOwner) {
                  (order.items || []).forEach(function(it) {
                    if (it.id === itemId) it.quantity = isPlus ? it.quantity + 1 : Math.max(1, it.quantity - 1)
                  })
                }
              })
              wx.setStorageSync('allOrders', allOrders)

              var cb = function() {
                that.syncOrdersSnapshot(table, shopId, itemId, 'quantity', newQty)
                setTimeout(function() { that.loadTableOrders() }, 150)
              }
              if (newQty === 0) {
                db.collection('order_items').doc(item._id).remove({ success: cb, fail: cb })
              } else {
                db.collection('order_items').doc(item._id).update({ data: { quantity: newQty }, success: cb, fail: cb })
              }
            }
          },
          fail: function() { that.loadTableOrders() }
        })
    } catch (err) { that.loadTableOrders() }
  },

  // 直接输入数量
  onQtyBlur: function(e) {
    var itemId = e.currentTarget.dataset.itemid
    var val = parseInt(e.detail.value) || 1
    val = Math.max(1, Math.min(val, 99))
    var table = this.data.table
    var shopId = wx.getStorageSync('currentShopId') || ''
    var that = this

    // 先更新本地缓存
    var allOrders = wx.getStorageSync('allOrders') || []
    allOrders.forEach(function(order) {
      if (order.tableNo === table.name && !order.cleared && order.fromOwner) {
        (order.items || []).forEach(function(item) {
          if (item.id === itemId) item.quantity = val
        })
      }
    })
    wx.setStorageSync('allOrders', allOrders)

    // 更新云数据库，完成后刷新
    try {
      var db = getDb()
      db.collection('order_items')
        .where({ dishId: itemId, tableName: table.name, shopId: shopId, fromOwner: true, status: 'submitted' })
        .get({
          success: function(res) {
            if (res.data && res.data.length > 0) {
              var cb = function() {
                that.syncOrdersSnapshot(table, shopId, itemId, 'quantity', val)
                setTimeout(function() { that.loadTableOrders() }, 150)
              }
              db.collection('order_items').doc(res.data[0]._id).update({ data: { quantity: val }, success: cb, fail: cb })
            } else {
              that.loadTableOrders()
            }
          },
          fail: function() { that.loadTableOrders() }
        })
    } catch (err) { that.loadTableOrders() }
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
      content: '确定要清台吗？已结账数据会保留在营收统计中',
      success: function(res) {
        if (res.confirm) {
          var clearTime = Date.now()
          var shopId = wx.getStorageSync('currentShopId') || ''

          try {
            var db = getDb()
            // 关闭会话（保留记录）
            db.collection('sessions')
              .where({ tableName: table.name, status: 'active', shopId: shopId })
              .update({ data: { status: 'closed', clearedAt: clearTime } })

            // 标记订单为已结账（保留菜品明细供营收统计）
            db.collection('orders')
              .where({ tableName: table.name, shopId: shopId, status: 'pending' })
              .update({ data: { status: 'paid', paidAt: clearTime } })

            // 标记菜品项为已结账（不删除，营收统计需要）
            db.collection('order_items')
              .where({ tableName: table.name, shopId: shopId })
              .update({ data: { status: 'paid', paidAt: clearTime } })
          } catch (err) {}

          // 本地订单标记为已结账（保留供营收统计降级使用）
          var allOrders = wx.getStorageSync('allOrders') || []
          allOrders.forEach(function(o) {
            if (o.tableNo === table.name && !o.cleared) {
              o.status = 'paid'
              o.paidAt = clearTime
            }
          })
          wx.setStorageSync('allOrders', allOrders)
          wx.removeStorageSync('tableChecked_' + table.name)
          wx.removeStorageSync('currentTable')
          wx.removeStorageSync('currentSession')

          that.setData({ allItems: [], totalPrice: '0.00', ownerTotal: '0.00', totalAll: '0.00' })
          that.loadTableOrders()
          wx.showToast({ title: '已清台，账单已存档', icon: 'success' })
        }
      }
    })
  }
})
