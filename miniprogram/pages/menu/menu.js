const { getDb } = require('../../utils/cloud')
const { formatPrice } = require('../../utils/currency')
const { debounce } = require('../../utils/debounce')

Page({
  data: {
    categories: [],
    allDishes: [],
    categoryDishes: [],
    currentCategory: '',
    cartItems: [],
    cartCount: 0,
    totalPrice: '0.00米',
    showCart: false,
    showDishDetail: false,
    showConfirmPopup: false,
    detailDish: null,
    tableNo: '',
    guestCount: '',
    isAdditional: false,
    fromOwner: false,
    orderedItemIds: [],
    orderedItems: [],
    showOrderedPopup: false,
    orderCount: 0,
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

    this.loadCategories()
  },

  loadOrderedItems: function(tableNo) {
    var that = this
    var orderedIds = []
    var orderedItems = []
    var orderCount = 0
    try {
      var db = getDb()
      db.collection('order_items')
        .where({ tableName: tableNo })
        .get({
          success: function(res) {
            if (res.data) {
              orderCount = res.data.length
              res.data.forEach(function(item) {
                orderedIds.push(item.dishId)
                orderedItems.push({
                  name: item.dishName,
                  quantity: item.quantity,
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
      orderCount = orders.length
      orders.forEach(function(o) {
        if (String(o.tableNo) === String(tableNo) && o.items) {
          o.items.forEach(function(item) {
            orderedIds.push(item.id)
            orderedItems.push({
              name: item.name || item.dishName,
              quantity: item.quantity,
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
        .where(shopId ? { shopId: shopId } : {})
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

    try {
      var db = getDb()
      db.collection('dishes')
        .where({ categoryId: categoryId, available: true })
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
      this.addToCartById(dish._id || dish.id)
    }
  },

  addToCartById: function(id) {
    var dishes = this.data.categoryDishes
    var cartItems = this.data.cartItems.slice()
    var dish = dishes.find(function(d) { return (d._id || d.id) === id })

    if (!dish) return

    var exist = cartItems.find(function(c) { return c.id === id })
    if (exist) {
      exist.quantity++
    } else {
      cartItems.push({
        id: id,
        name: dish.name,
        price: dish.price,
        image: dish.image || '',
        quantity: 1
      })
    }

    this.updateCart(cartItems)
    this.setData({ showDishDetail: false, detailDish: null })
    wx.vibrateShort({ type: 'light' })
  },

  addToCart: function(e) {
    var id = e.currentTarget.dataset.id
    this.addToCartById(id)
  },

  increaseQuantity: function(e) {
    var id = e.currentTarget.dataset.id
    var cartItems = this.data.cartItems.slice()
    var item = cartItems.find(function(c) { return c.id === id })
    if (item) {
      item.quantity++
      this.updateCart(cartItems)
    }
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
    cartItems.forEach(function(item) {
      totalPrice += item.price * item.quantity
      cartCount += item.quantity
    })
    this.setData({
      cartItems: cartItems,
      totalPrice: formatPrice(totalPrice),
      cartCount: cartCount,
      showCart: cartCount > 0
    })
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

    var orderItems = that.data.cartItems.map(function(item) {
      return {
        dishId: item.id,
        dishName: item.name,
        price: item.price,
        quantity: item.quantity,
        image: item.image,
        status: 'submitted'
      }
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
          createdAt: Date.now()
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
                quantity: item.quantity,
                image: item.image,
                status: 'submitted',
                fromOwner: fromOwner,
                createdAt: Date.now()
              }
            })
          })

          db.collection('orders').add({
            data: {
              sessionId: sessionId,
              shopId: shopId,
              tableName: that.data.tableNo,
              guestCount: parseInt(that.data.guestCount) || 1,
              totalPrice: totalPrice,
              status: 'pending',
              fromOwner: fromOwner,
              createdAt: Date.now()
            },
            success: function() {
              wx.showToast({ title: fromOwner ? '已加菜' : '已走菜', icon: 'success' })
              that.setData({ submitting: false, cartItems: [], cartCount: 0, totalPrice: '0.00米', showCart: false })
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
      that.setData({ submitting: false, cartItems: [], cartCount: 0, totalPrice: '0.00米', showCart: false })
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
