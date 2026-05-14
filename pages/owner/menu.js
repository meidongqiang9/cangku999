Page({
  data: {
    categories: [],
    currentCategory: 1,
    currentDishes: [],
    showInputModal: false,
    inputTitle: '',
    inputValue: '',
    inputPrice: '',
    inputValue2: '',
    inputAction: '',
    editingDishId: '',
    editingDishName: '',
    tempImage: ''
  },

  onLoad: function() {
    this.loadData()
  },

  loadData: function() {
    var categories = wx.getStorageSync('menuCategories') || [
      { id: 1, name: '凉菜' },
      { id: 2, name: '热菜' },
      { id: 3, name: '主食' },
      { id: 4, name: '酒水' }
    ]
    var dishes = wx.getStorageSync('menuDishes') || []
    
    this.setData({ categories: categories })
    this.loadCategoryDishes(categories[0].id, dishes)
  },

  loadCategoryDishes: function(categoryId, dishes) {
    dishes = dishes || wx.getStorageSync('menuDishes') || []
    var currentDishes = dishes.filter(function(d) { return d.categoryId === categoryId })
    this.setData({
      currentCategory: categoryId,
      currentDishes: currentDishes
    })
  },

  switchCategory: function(e) {
    var id = e.currentTarget.dataset.id
    this.loadCategoryDishes(id)
  },

  uploadImage: function(e) {
    var id = e.currentTarget.dataset.id
    var that = this
    
    wx.showActionSheet({
      itemList: ['从相册选择', '拍照'],
      success: function(res) {
        var sourceType = res.tapIndex === 0 ? ['album'] : ['camera']
        
        wx.chooseImage({
          count: 1,
          sizeType: ['compressed'],
          sourceType: sourceType,
          success: function(imgRes) {
            var tempFilePath = imgRes.tempFilePaths[0]
            var dishes = wx.getStorageSync('menuDishes') || []
            var idx = dishes.findIndex(function(d) { return d.id === id })
            if (idx !== -1) {
              dishes[idx].image = tempFilePath
              wx.setStorageSync('menuDishes', dishes)
              that.loadCategoryDishes(that.data.currentCategory, dishes)
              wx.showToast({ title: '上传成功', icon: 'success' })
            }
          }
        })
      }
    })
  },

  chooseImage: function() {
    var that = this
    wx.showActionSheet({
      itemList: ['从相册选择', '拍照'],
      success: function(res) {
        var sourceType = res.tapIndex === 0 ? ['album'] : ['camera']
        
        wx.chooseImage({
          count: 1,
          sizeType: ['compressed'],
          sourceType: sourceType,
          success: function(imgRes) {
            that.setData({ tempImage: imgRes.tempFilePaths[0] })
          }
        })
      }
    })
  },

  addCategory: function() {
    this.setData({
      showInputModal: true,
      inputTitle: '添加品类',
      inputValue: '',
      inputValue2: '',
      inputAction: 'addCategory',
      tempImage: ''
    })
  },

  deleteCategory: function(e) {
    var id = e.currentTarget.dataset.id
    var that = this
    wx.showModal({
      title: '确认删除',
      content: '删除后该品类下的菜品也会被删除',
      success: function(res) {
        if (res.confirm) {
          var categories = that.data.categories.filter(function(c) { return c.id !== id })
          var dishes = wx.getStorageSync('menuDishes') || []
          dishes = dishes.filter(function(d) { return d.categoryId !== id })
          wx.setStorageSync('menuCategories', categories)
          wx.setStorageSync('menuDishes', dishes)
          that.setData({ categories: categories })
          if (that.data.currentCategory === id && categories.length > 0) {
            that.loadCategoryDishes(categories[0].id, dishes)
          }
        }
      }
    })
  },

  addDish: function() {
    this.setData({
      showInputModal: true,
      inputTitle: '添加菜品',
      inputValue: '',
      inputPrice: '',
      inputValue2: '',
      inputAction: 'addDish',
      tempImage: ''
    })
  },

  onInputValueChange: function(e) {
    this.setData({ inputValue: e.detail.value })
  },

  onInputPriceChange: function(e) {
    this.setData({ inputPrice: e.detail.value })
  },

  onInputValue2Change: function(e) {
    this.setData({ inputValue2: e.detail.value })
  },

  closeInputModal: function() {
    this.setData({
      showInputModal: false,
      inputValue: '',
      inputPrice: '',
      inputValue2: '',
      tempImage: ''
    })
  },

  confirmInput: function() {
    var that = this
    var value = that.data.inputValue
    var value2 = that.data.inputValue2 || ''
    var tempImage = that.data.tempImage
    
    if (!value && that.data.inputAction !== 'editDish') {
      wx.showToast({ title: '请输入内容', icon: 'none' })
      return
    }
    
    if (that.data.inputAction === 'addCategory') {
      var categories = that.data.categories
      var newId = 1
      if (categories.length > 0) {
        newId = Math.max.apply(null, categories.map(function(c) { return c.id })) + 1
      }
      categories.push({ id: newId, name: value })
      wx.setStorageSync('menuCategories', categories)
      that.setData({ categories: categories })
    } else if (that.data.inputAction === 'addDish') {
      var dishes = wx.getStorageSync('menuDishes') || []
      if (!value) {
        wx.showToast({ title: '请输入名称', icon: 'none' })
        return
      }
      if (!that.data.inputPrice) {
        wx.showToast({ title: '请填入米', icon: 'none' })
        return
      }
      var newDish = {
        id: 'D' + Date.now(),
        categoryId: that.data.currentCategory,
        name: value,
        description: value2.substring(0, 10),
        price: parseFloat(that.data.inputPrice) || 0,
        available: true,
        image: tempImage
      }
      dishes.push(newDish)
      wx.setStorageSync('menuDishes', dishes)
      that.loadCategoryDishes(that.data.currentCategory, dishes)
    } else if (that.data.inputAction === 'editDish') {
      var dishes = wx.getStorageSync('menuDishes') || []
      var idx = dishes.findIndex(function(d) { return d.id === that.data.editingDishId })
      if (idx !== -1) {
        if (value) dishes[idx].price = parseFloat(value) || 0
        dishes[idx].description = value2 ? value2.substring(0, 10) : ''
        if (tempImage) dishes[idx].image = tempImage
        wx.setStorageSync('menuDishes', dishes)
        that.loadCategoryDishes(that.data.currentCategory, dishes)
      }
    }
    
    that.setData({ showInputModal: false, inputValue: '', inputPrice: '', inputValue2: '', tempImage: '' })
    wx.showToast({ title: '保存成功', icon: 'success' })
  },

  editDish: function(e) {
    var id = e.currentTarget.dataset.id
    var that = this
    var dish = that.data.currentDishes.find(function(d) { return d.id === id })
    if (!dish) return
    
    this.setData({
      showInputModal: true,
      inputTitle: '编辑菜品',
      inputValue: String(dish.price),
      inputValue2: dish.description || '',
      inputAction: 'editDish',
      editingDishId: id,
      editingDishName: dish.name,
      tempImage: dish.image || ''
    })
  },

  deleteDish: function(e) {
    var id = e.currentTarget.dataset.id
    var that = this
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这道菜吗？',
      success: function(res) {
        if (res.confirm) {
          var dishes = wx.getStorageSync('menuDishes') || []
          dishes = dishes.filter(function(d) { return d.id !== id })
          wx.setStorageSync('menuDishes', dishes)
          that.loadCategoryDishes(that.data.currentCategory, dishes)
        }
      }
    })
  }
})