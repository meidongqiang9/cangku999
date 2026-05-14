Page({
  data: {
    categories: [],
    allItems: [],
    categoryItems: {},
    cartItems: [],
    currentCategory: 1,
    scrollIntoViewId: '',
    cartCount: 0,
    totalPrice: 0,
    showCart: false,
    tableNo: '',
    guestCount: ''
  },

  onLoad: function(options) {
    this.setData({
      tableNo: options.tableNo || '',
      guestCount: options.guestCount || '',
      fromOrder: options.fromOrder || '',
      fromOwner: options.fromOwner || ''
    })
    this.loadData()
  },

  onShow: function() {
    this.loadData()
  },

  loadData: function() {
    var categories = wx.getStorageSync('menuCategories') || [
      { id: 1, name: '凉菜' },
      { id: 2, name: '热菜' },
      { id: 3, name: '主食' },
      { id: 4, name: '酒水' }
    ]
    var allItems = wx.getStorageSync('menuDishes') || []
    
    this.setData({
      categories: categories,
      allItems: allItems,
      currentCategory: categories.length > 0 ? categories[0].id : 1
    })
    this.setCategoryItems()
    
    var cartItems = wx.getStorageSync('cartItems') || []
    if (cartItems.length > 0) {
      this.setData({ cartItems: cartItems })
      this.updateCart(cartItems)
    }
  },

  setCategoryItems: function() {
    var that = this
    var categoryItems = {}
    this.data.categories.forEach(function(cat) {
      categoryItems[cat.id] = that.data.allItems.filter(function(item) {
        return item.categoryId === cat.id
      })
    })
    this.setData({ categoryItems: categoryItems })
  },

  switchCategory: function(e) {
    var id = e.currentTarget.dataset.id
    this.setData({
      currentCategory: id,
      scrollIntoViewId: 'cat-' + id
    })
  },

  addToCart: function(e) {
    var item = e.currentTarget.dataset.item
    var cartItems = this.data.cartItems
    var existing = cartItems.find(function(i) { return i.id === item.id })
    
    if (existing) {
      existing.quantity++
    } else {
      cartItems.push({ id: item.id, name: item.name, price: item.price, quantity: 1 })
    }
    
    this.updateCart(cartItems)
    wx.showToast({ title: '已加购', icon: 'success' })
  },

  increaseQty: function(e) {
    var id = e.currentTarget.dataset.id
    var cartItems = this.data.cartItems.map(function(item) {
      if (item.id === id) item.quantity++
      return item
    })
    this.updateCart(cartItems)
  },

  decreaseQty: function(e) {
    var id = e.currentTarget.dataset.id
    var cartItems = this.data.cartItems.map(function(item) {
      if (item.id === id) item.quantity--
      return item
    }).filter(function(item) { return item.quantity > 0 })
    this.updateCart(cartItems)
  },

  clearCart: function() {
    var that = this
    wx.showModal({
      title: '清空购物车',
      content: '确定要清空所有菜品吗？',
      success: function(res) {
        if (res.confirm) {
          that.updateCart([])
          that.setData({ showCart: false })
        }
      }
    })
  },

  updateCart: function(cartItems) {
    var totalPrice = 0
    var cartCount = 0
    cartItems.forEach(function(item) {
      totalPrice += item.price * item.quantity
      cartCount += item.quantity
    })
    this.setData({ cartItems: cartItems, totalPrice: totalPrice, cartCount: cartCount })
    wx.setStorageSync('cartItems', cartItems)
  },

  openCart: function() {
    if (this.data.cartItems.length === 0) {
      wx.showToast({ title: '购物车为空', icon: 'none' })
      return
    }
    this.setData({ showCart: true })
  },

  viewOrdered: function() {
    wx.navigateTo({ url: '/pages/order/order' })
  },

  closeCart: function() {
    this.setData({ showCart: false })
  },

  confirmOrder: function() {
    if (this.data.cartItems.length === 0) {
      wx.showToast({ title: '购物车为空', icon: 'none' })
      return
    }
    
    var that = this
    wx.showModal({
      title: '确认走菜',
      confirmText: '走菜',
      cancelText: '再想想',
      success: function(res) {
        if (res.confirm) {
          that.createOrder()
        }
      }
    })
  },

  createOrder: function() {
    var fromOrder = this.data.fromOrder
    var fromOwner = this.data.fromOwner
    var orderData = {
      tableNo: this.data.tableNo || '1',
      guestCount: this.data.guestCount || '1',
      items: this.data.cartItems,
      totalPrice: this.data.totalPrice,
      status: 'pending',
      createdAt: new Date().getTime(),
      fromOwner: fromOwner || false
    }
    
    if (fromOrder) {
      wx.setStorageSync('newOrderItems', this.data.cartItems)
      wx.setStorageSync('lastOrderId', 'local_' + Date.now())
      wx.showToast({ title: '加菜成功', icon: 'success' })
      this.setData({ showCart: false, cartItems: [], cartCount: 0, totalPrice: 0 })
      wx.setStorageSync('cartItems', [])
      wx.navigateBack()
      return
    }
    
    // 保存到所有订单列表
    var allOrders = wx.getStorageSync('allOrders') || []
    allOrders.unshift(orderData)
    wx.setStorageSync('allOrders', allOrders)
    
    wx.setStorageSync('lastOrderId', 'local_' + Date.now())
    wx.setStorageSync('currentOrder', orderData)
    wx.showToast({ title: '下单成功', icon: 'success' })
    
    this.setData({ showCart: false, cartItems: [], cartCount: 0, totalPrice: 0 })
    wx.setStorageSync('cartItems', [])
    
    wx.navigateTo({
      url: '/pages/order/order'
    })
  }
})