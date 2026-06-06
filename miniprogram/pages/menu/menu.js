const { getDb, getSafeShopId } = require('../../utils/cloud')
const { formatPrice } = require('../../utils/currency')
const { debounce } = require('../../utils/debounce')

Page({
  data: {
    categories: [],
    allDishes: [],
    categoryDishes: [],
    currentCategory: '',
    cartItems: [],
    cartMap: {},
    cartCount: 0,
    totalPrice: '💰0.00',
    showCart: false,
    showDishDetail: false,
    showConfirmPopup: false,
    showTastePopup: false,
    tasteDish: null,
    tasteOptions: ['多辣','少辣','多糖','少糖','多麻','少麻','多醋','少醋'],
    selectedTastes: {},
    detailDish: null,
    tableNo: '',
    guestCount: '',
    isAdditional: false,
    fromOwner: false,
    orderedItemIds: [],
    orderedItems: [],
    showOrderedPopup: false,
    orderCount: 0,
    hasActiveOrder: false,
    submitting: false
  },

  onLoad: function(options) {
    var tableNo = options.tableNo || ''
    var guestCount = options.guestCount || '1'
    var isAdditional = options.additional === '1'
    var fromOwner = options.fromOwner === '1'

    this.setData({
      tableNo: tableNo,
      guestCount: guestCount,
      isAdditional: isAdditional,
      fromOwner: fromOwner
    })

    if (isAdditional) {
      this.loadOrderedItems(tableNo)
    }
    if (tableNo && !isAdditional && !fromOwner) {
      this.checkActiveOrder(tableNo)
    }

    this.loadCategories()
  },

  onShow: function() {
    var tableNo = this.data.tableNo
    if (tableNo && !this.data.isAdditional && !this.data.fromOwner) {
      this.checkActiveOrder(tableNo)
    }
  },

  checkActiveOrder: function(tableNo) {
    var that = this
    var shopId = wx.getStorageSync('currentShopId') || ''
    try {
      var db = getDb()
      db.collection('order_items')
        .where({ tableName: tableNo, shopId: shopId, status: 'submitted' })
        .limit(1)
        .get({
          success: function(res) {
            that.setData({ hasActiveOrder: res.data && res.data.length > 0 })
          },
          fail: function() {}
        })
    } catch (e) {}
  },

  goToOrder: function() {
    var tableNo = this.data.tableNo
    var session = wx.getStorageSync('currentSession')
    if (session && session._id) {
      wx.navigateTo({ url: '/pages/order/order?sessionId=' + session._id + '&tableNo=' + tableNo })
    } else {
      wx.navigateTo({ url: '/pages/order/order?tableNo=' + tableNo })
    }
  },

  loadOrderedItems: function(tableNo) {
    var that = this
    var orderedIds = []
    var orderedItems = []
    var orderCount = 0
    var shopId = wx.getStorageSync('currentShopId') || ''
    try {
      var db = getDb()
      db.collection('order_items')
        .where({ tableName: tableNo, shopId: shopId, status: 'submitted' })
        .get({
          success: function(res) {
            if (res.data) {
              orderCount = res.data.length
              res.data.forEach(function(item) {
                orderedIds.push(item.dishId)
                orderedItems.push({
                  name: item.dishName,
                  quantity: item.quantity,
                  taste: item.taste || '',
                  status: item.status
                })
              })
            }
            that.setData({
              orderedItemIds: orderedIds,
              orderedItems: orderedItems,
              orderCount: orderCount
            })
          }
        })
    } catch (e) {
      var orders = wx.getStorageSync('allOrders') || []
      var orderedItems = []
      orderCount = 0
      orders.forEach(function(o) {
        if (String(o.tableNo) === String(tableNo) && o.items && o.status !== 'paid') {
          orderCount += o.items.length
          o.items.forEach(function(item) {
            orderedIds.push(item.id)
            orderedItems.push({
              name: item.name || item.dishName,
              quantity: item.quantity,
              taste: item.taste || '',
              status: item.status
            })
          })
        }
      })
      this.setData({
        orderedItemIds: orderedIds,
        orderedItems: orderedItems,
        orderCount: orderCount
      })
    }
  },

  loadCategories: function() {
    var that = this
    try {
      var db = getDb()
      var shopId = wx.getStorageSync('currentShopId') || ''
      db.collection('categories')
        .where({ shopId: shopId })
        .orderBy('sort', 'asc')
        .get({
          success: function(res) {
            var categories = res.data || []
            if (categories.length === 0) {
              categories = that.loadCategoriesFromCache()
            }
            that.setData({ categories: categories })
            if (categories.length > 0) {
              var firstId = categories[0]._id || categories[0].id
              that.setData({ currentCategory: firstId })
              that.loadDishes(firstId)
            }
          },
          fail: function() {
            var categories = that.loadCategoriesFromCache()
            that.setData({ categories: categories })
            if (categories.length > 0) {
              that.setData({ currentCategory: categories[0].id })
              that.loadDishes(categories[0].id)
            }
          }
        })
    } catch (e) {
      var categories = this.loadCategoriesFromCache()
      this.setData({ categories: categories })
      if (categories.length > 0) {
        this.setData({ currentCategory: categories[0].id })
        this.loadDishes(categories[0].id)
      }
    }
  },

  loadCategoriesFromCache: function() {
    return wx.getStorageSync('menuCategories') || [
      { id: 1, name: '凉菜' },
      { id: 2, name: '热菜' },
      { id: 3, name: '主食' },
      { id: 4, name: '酒水' }
    ]
  },

  loadDishes: function(categoryId) {
    var that = this
    that.setData({ currentCategory: categoryId })
    var shopId = getSafeShopId()

    try {
      var db = getDb()
      var query = { categoryId: categoryId, available: true }
      if (shopId) query.shopId = shopId
      db.collection('dishes')
        .where(query)
        .get({
          success: function(res) {
            var dishes = res.data || []
            if (dishes.length === 0) {
              dishes = that.loadDishesFromCache(categoryId)
            }
            that.setData({ categoryDishes: dishes })
          },
          fail: function() {
            that.setData({ categoryDishes: that.loadDishesFromCache(categoryId) })
          }
        })
    } catch (e) {
      this.setData({ categoryDishes: this.loadDishesFromCache(categoryId) })
    }
  },

  loadDishesFromCache: function(categoryId) {
    var allDishes = wx.getStorageSync('menuDishes') || []
    return allDishes.filter(function(d) { return d.categoryId === categoryId })
  },

  switchCategory: function(e) {
    var id = e.currentTarget.dataset.id
    this.loadDishes(id)
    this.setData({ scrollToCategory: 'cat-' + id })
  },

  showDishDetail: function(e) {
    var id = e.currentTarget.dataset.id
    var dish = this.data.categoryDishes.find(function(d) { return (d._id || d.id) === id })
    if (dish) {
      this.setData({
        showDishDetail: true,
        detailDish: dish
      })
    }
  },

  closeDishDetail: function() {
    this.setData({ showDishDetail: false, detailDish: null })
  },

  stopPropagation: function() {},

  addFromDetail: function() {
    var dish = this.data.detailDish
    if (dish) {
      this.setData({ showDishDetail: false, detailDish: null })
      this.showTastePopup(dish._id || dish.id, dish)
    }
  },

  showTastePopup: function(id, dish) {
    this.setData({
      showTastePopup: true,
      tasteDish: dish,
      selectedTastes: {},
      _pendingAddId: id
    })
  },

  toggleTaste: function(e) {
    var taste = e.currentTarget.dataset.taste
    var selected = this.data.selectedTastes
    if (selected[taste]) {
      delete selected[taste]
    } else {
      selected[taste] = true
    }
    this.setData({ selectedTastes: selected })
  },

  getSelectedTasteStr: function() {
    var selected = this.data.selectedTastes
    var result = []
    this.data.tasteOptions.forEach(function(t) {
      if (selected[t]) result.push(t)
    })
    return result.join(',')
  },

  confirmTaste: function() {
    var taste = this.getSelectedTasteStr()
    this.setData({ showTastePopup: false, tasteDish: null, selectedTastes: {} })
    this.addToCartWithTaste(this.data._pendingAddId, taste)
  },

  skipTaste: function() {
    this.setData({ showTastePopup: false, tasteDish: null, selectedTastes: {} })
    this.addToCartWithTaste(this.data._pendingAddId, '')
  },

  addToCartWithTaste: function(id, taste) {
    var dishes = this.data.categoryDishes
    var cartItems = this.data.cartItems.slice()
    var dish = dishes.find(function(d) { return (d._id || d.id) === id })

    if (!dish) return

    var exist = cartItems.find(function(c) { return c.id === id && c.taste === taste })
    if (exist) {
      exist.quantity++
    } else {
      cartItems.push({
        id: id,
        name: dish.name,
        price: dish.price,
        image: dish.image || '',
        quantity: 1,
        taste: taste
      })
    }

    this.updateCart(cartItems)
    wx.vibrateShort({ type: 'light' })
  },

  addToCart: function(e) {
    var id = e.currentTarget.dataset.id
    var dish = this.data.categoryDishes.find(function(d) { return (d._id || d.id) === id })
    if (dish) {
      this.addToCartDirect(id, dish)
    }
  },

  increaseQuantity: function(e) {
    var id = e.currentTarget.dataset.id
    var dish = this.data.categoryDishes.find(function(d) { return (d._id || d.id) === id })
    if (dish) {
      this.addToCartDirect(id, dish)
    }
  },

  addToCartDirect: function(id, dish) {
    var cartItems = this.data.cartItems.slice()
    var exist = cartItems.find(function(c) { return (c._id || c.id) === id })
    if (exist) {
      exist.quantity++
    } else {
      cartItems.push({
        id: id,
        name: dish.name,
        price: dish.price,
        image: dish.image || '',
        quantity: 1,
        taste: ''
      })
    }
    this.updateCart(cartItems)
    wx.vibrateShort({ type: 'light' })
  },

  decreaseQuantity: function(e) {
    var id = e.currentTarget.dataset.id
    var cartItems = this.data.cartItems.slice()
    var idx = cartItems.findIndex(function(c) { return c.id === id })
    if (idx !== -1) {
      if (cartItems[idx].quantity > 1) {
        cartItems[idx].quantity--
      } else {
        cartItems.splice(idx, 1)
      }
      this.updateCart(cartItems)
    }
  },

  updateCart: function(cartItems) {
    var totalPrice = 0
    var cartCount = 0
    var cartMap = {}
    cartItems.forEach(function(item) {
      totalPrice += item.price * item.quantity
      cartCount += item.quantity
      cartMap[item.id] = (cartMap[item.id] || 0) + item.quantity
    })
    this.setData({
      cartItems: cartItems,
      cartMap: cartMap,
      totalPrice: formatPrice(totalPrice),
      cartCount: cartCount,
      showCart: cartCount > 0
    })
  },

  // 直接输入数量
  onQtyBlur: function(e) {
    var id = e.currentTarget.dataset.id
    var val = parseInt(e.detail.value) || 0
    var cartItems = this.data.cartItems.slice()

    if (val <= 0) {
      // 数量归零则移除
      cartItems = cartItems.filter(function(c) { return c.id !== id })
    } else {
      var item = cartItems.find(function(c) { return c.id === id })
      if (item) item.quantity = Math.min(val, 99)
    }

    this.updateCart(cartItems)
  },

  toggleCart: function() {
    this.setData({ showCartPanel: !this.data.showCartPanel })
  },

  confirmSubmit: function() {
    if (this.data.submitting) return

    var cartItems = this.data.cartItems
    if (cartItems.length === 0) {
      wx.showToast({ title: '请先选择菜品', icon: 'none' })
      return
    }

    this.setData({ showConfirmPopup: true })
  },

  closeConfirmPopup: function() {
    this.setData({ showConfirmPopup: false })
  },

  toggleOrderedPopup: function() {
    this.setData({ showOrderedPopup: !this.data.showOrderedPopup })
  },

  goBackToOrder: function() {
    wx.redirectTo({ url: '/pages/order/order?tableNo=' + this.data.tableNo })
  },

  submitOrder: debounce(function() {
    var that = this
    if (that.data.submitting) return

    that.setData({ submitting: true, showConfirmPopup: false })

    var fromOwner = that.data.fromOwner
    var batchTime = Date.now()  // 同一批次共享时间戳，确保归为一次点单

    var orderItems = that.data.cartItems.map(function(item) {
      var orderItem = {
        dishId: item.id,
        dishName: item.name,
        price: item.price,
        quantity: item.quantity,
        image: item.image,
        taste: item.taste || '',
        status: 'submitted'
      }
      // 终端协助：保存原价作为后续调价上限
      if (fromOwner) {
        orderItem.originalPrice = item.price
      }
      return orderItem
    })

    try {
      var db = getDb()
      var shopId = wx.getStorageSync('currentShopId') || ''

      db.collection('sessions').add({
        data: {
          shopId: shopId,
          tableName: that.data.tableNo,
          guestCount: parseInt(that.data.guestCount) || 1,
          status: 'active',
          createdAt: batchTime
        },
        success: function(sessionRes) {
          var sessionId = sessionRes._id
          var totalPrice = 0

          orderItems.forEach(function(item) {
            totalPrice += item.price * item.quantity
            db.collection('order_items').add({
              data: {
                sessionId: sessionId,
                shopId: shopId,
                tableName: that.data.tableNo,
                dishId: item.dishId,
                dishName: item.dishName,
                price: item.price,
                originalPrice: item.originalPrice || item.price,
                quantity: item.quantity,
                image: item.image,
                status: 'submitted',
                taste: item.taste || '',
                fromOwner: fromOwner,
                createdAt: batchTime
              }
            })
          })

          // 构建菜品明细快照（供营收统计使用）
          var itemsSnapshot = orderItems.map(function(item) {
            return {
              dishId: item.dishId,
              name: item.dishName,
              price: item.price,
              quantity: item.quantity,
              taste: item.taste || ''
            }
          })

          db.collection('orders').add({
            data: {
              sessionId: sessionId,
              shopId: shopId,
              tableName: that.data.tableNo,
              guestCount: parseInt(that.data.guestCount) || 1,
              totalPrice: totalPrice,
              items: itemsSnapshot,
              status: 'pending',
              fromOwner: fromOwner,
              createdAt: Date.now()
            },
            success: function() {
              wx.showToast({ title: fromOwner ? '已加菜' : '已走菜', icon: 'success' })
              that.setData({ submitting: false, cartItems: [], cartMap: {}, cartCount: 0, totalPrice: '💰0.00', showCart: false })
              setTimeout(function() {
                if (fromOwner) {
                  wx.navigateBack()
                } else {
                  wx.redirectTo({
                    url: '/pages/order/order?sessionId=' + sessionId + '&tableNo=' + that.data.tableNo
                  })
                }
              }, 500)
            },
            fail: function(err) {
              that.setData({ submitting: false })
              wx.showToast({ title: '提交失败: ' + err.errMsg, icon: 'none' })
            }
          })
        },
        fail: function(err) {
          that.setData({ submitting: false })
          wx.showToast({ title: '创建会话失败: ' + err.errMsg, icon: 'none' })
        }
      })
    } catch (e) {
      var newOrder = {
        tableNo: that.data.tableNo,
        guestCount: that.data.guestCount,
        items: that.data.cartItems.slice(),
        fromOwner: fromOwner,
        createdAt: Date.now(),
        status: 'pending'
      }
      var orders = wx.getStorageSync('allOrders') || []
      orders.push(newOrder)
      wx.setStorageSync('allOrders', orders)
      wx.setStorageSync('needRefreshOrder', true)

      wx.showToast({ title: fromOwner ? '已加菜(本地)' : '已走菜(本地)', icon: 'success' })
      that.setData({ submitting: false, cartItems: [], cartMap: {}, cartCount: 0, totalPrice: '💰0.00', showCart: false })
      setTimeout(function() {
        if (fromOwner) {
          wx.navigateBack()
        } else {
          wx.redirectTo({
            url: '/pages/order/order?tableNo=' + that.data.tableNo
          })
        }
      }, 500)
    }
  }, 300)
})
