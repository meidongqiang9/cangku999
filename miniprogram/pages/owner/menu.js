const { getDb } = require('../../utils/cloud')

Page({
  data: {
    categories: [],
    currentCategory: 0,
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

  onShow: function() {
    this.loadData()
  },

  loadData: function() {
    var that = this
    var shopId = wx.getStorageSync('currentShopId') || ''

    try {
      var db = getDb()
      db.collection('categories')
        .where(shopId ? { shopId: shopId } : {})
        .orderBy('sort', 'asc')
        .get({
          success: function(res) {
            var categories = (res.data || []).map(function(c) {
              return { id: c._id, name: c.name, sort: c.sort }
            })
            if (categories.length === 0) {
              categories = wx.getStorageSync('menuCategories') || []
            } else {
              wx.setStorageSync('menuCategories', categories)
            }
            that.setData({ categories: categories })
            if (categories.length > 0) {
              that.loadCategoryDishes(categories[0].id)
            }
          },
          fail: function() {
            that.loadFromLocal()
          }
        })
    } catch (e) {
      that.loadFromLocal()
    }
  },

  loadFromLocal: function() {
    var categories = wx.getStorageSync('menuCategories') || [
      { id: 1, name: '凉菜' },
      { id: 2, name: '热菜' },
      { id: 3, name: '主食' },
      { id: 4, name: '酒水' }
    ]
    this.setData({ categories: categories })
    if (categories.length > 0) {
      this.loadCategoryDishes(categories[0].id)
    }
  },

  loadCategoryDishes: function(categoryId) {
    var that = this
    that.setData({ currentCategory: categoryId })
    var shopId = wx.getStorageSync('currentShopId') || ''

    try {
      var db = getDb()
      var query = { categoryId: categoryId, available: true }
      if (shopId) query.shopId = shopId
      db.collection('dishes')
        .where(query)
        .get({
          success: function(res) {
            var dishes = (res.data || []).map(function(d) {
              return {
                id: d._id,
                categoryId: d.categoryId,
                name: d.name,
                description: d.description || '',
                price: d.price,
                image: d.image || '',
                available: d.available
              }
            })
            if (dishes.length === 0) {
              dishes = that.loadDishesFromCache(categoryId)
            } else {
              var allCached = wx.getStorageSync('menuDishes') || []
              var otherDishes = allCached.filter(function(d) { return d.categoryId !== categoryId })
              wx.setStorageSync('menuDishes', otherDishes.concat(dishes))
            }
            that.setData({ currentDishes: dishes })
          },
          fail: function() {
            that.setData({ currentDishes: that.loadDishesFromCache(categoryId) })
          }
        })
    } catch (e) {
      that.setData({ currentDishes: that.loadDishesFromCache(categoryId) })
    }
  },

  loadDishesFromCache: function(categoryId) {
    var allDishes = wx.getStorageSync('menuDishes') || []
    return allDishes.filter(function(d) { return d.categoryId === categoryId })
  },

  switchCategory: function(e) {
    var id = e.currentTarget.dataset.id
    this.loadCategoryDishes(id)
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

            // 尝试上传到云存储
            var cloudPath = 'dishes/' + id + '_' + Date.now() + '.jpg'
            wx.cloud.uploadFile({
              cloudPath: cloudPath,
              filePath: tempFilePath,
              success: function(uploadRes) {
                var fileID = uploadRes.fileID
                // 更新云数据库
                try {
                  var db = getDb()
                  db.collection('dishes').doc(id).update({
                    data: { image: fileID }
                  })
                } catch (err) {}
                // 更新本地缓存
                var dishes = wx.getStorageSync('menuDishes') || []
                var idx = dishes.findIndex(function(d) { return d.id === id })
                if (idx !== -1) dishes[idx].image = fileID
                wx.setStorageSync('menuDishes', dishes)
                that.loadCategoryDishes(that.data.currentCategory)
                wx.showToast({ title: '上传成功', icon: 'success' })
              },
              fail: function() {
                // 云存储失败，使用本地路径
                var dishes = wx.getStorageSync('menuDishes') || []
                var idx = dishes.findIndex(function(d) { return d.id === id })
                if (idx !== -1) {
                  dishes[idx].image = tempFilePath
                  wx.setStorageSync('menuDishes', dishes)
                }
                // 同时更新云数据库
                try {
                  var db = getDb()
                  db.collection('dishes').doc(id).update({
                    data: { image: tempFilePath }
                  })
                } catch (err) {}
                that.loadCategoryDishes(that.data.currentCategory)
                wx.showToast({ title: '已保存(本地)', icon: 'success' })
              }
            })
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

  editCategory: function(e) {
    var id = e.currentTarget.dataset.id
    var name = e.currentTarget.dataset.name
    this.setData({
      showInputModal: true,
      inputTitle: '修改品类名称',
      inputValue: name,
      inputValue2: id,
      inputAction: 'editCategory',
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
          // 删除云数据库中的分类
          try {
            var db = getDb()
            db.collection('categories').doc(id).remove()
            // 删除该分类下所有菜品
            db.collection('dishes').where({ categoryId: id }).remove()
          } catch (err) {}

          // 更新本地
          var categories = that.data.categories.filter(function(c) { return c.id !== id })
          var dishes = wx.getStorageSync('menuDishes') || []
          dishes = dishes.filter(function(d) { return d.categoryId !== id })
          wx.setStorageSync('menuCategories', categories)
          wx.setStorageSync('menuDishes', dishes)
          that.setData({ categories: categories })

          if (String(that.data.currentCategory) === String(id) && categories.length > 0) {
            that.loadCategoryDishes(categories[0].id)
          } else if (categories.length === 0) {
            that.setData({ currentDishes: [] })
          }
          wx.showToast({ title: '已删除', icon: 'success' })
        }
      }
    })
  },

  addDish: function() {
    if (this.data.categories.length === 0) {
      wx.showToast({ title: '请先添加品类', icon: 'none' })
      return
    }
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
          // 删除云数据库中的菜品
          try {
            var db = getDb()
            db.collection('dishes').doc(id).remove()
          } catch (err) {}

          // 更新本地缓存
          var dishes = wx.getStorageSync('menuDishes') || []
          dishes = dishes.filter(function(d) { return d.id !== id })
          wx.setStorageSync('menuDishes', dishes)
          that.loadCategoryDishes(that.data.currentCategory)
          wx.showToast({ title: '已删除', icon: 'success' })
        }
      }
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
    var shopId = wx.getStorageSync('currentShopId') || ''

    if (that.data.inputAction === 'editCategory') {
      var newName = that.data.inputValue.trim()
      var catId = that.data.inputValue2
      if (!newName) {
        wx.showToast({ title: '请输入品类名称', icon: 'none' })
        return
      }

      try {
        var db = getDb()
        db.collection('categories').doc(catId).update({
          data: { name: newName },
          success: function() {
            var categories = that.data.categories.map(function(c) {
              if (c.id === catId) c.name = newName
              return c
            })
            wx.setStorageSync('menuCategories', categories)
            that.setData({ categories: categories, showInputModal: false, inputValue: '', inputValue2: '' })
            wx.showToast({ title: '修改成功', icon: 'success' })
          },
          fail: function() {
            // 本地降级
            var categories = that.data.categories.map(function(c) {
              if (c.id === catId) c.name = newName
              return c
            })
            wx.setStorageSync('menuCategories', categories)
            that.setData({ categories: categories, showInputModal: false, inputValue: '', inputValue2: '' })
            wx.showToast({ title: '修改成功(本地)', icon: 'success' })
          }
        })
      } catch (e) {
        var categories = that.data.categories.map(function(c) {
          if (c.id === catId) c.name = newName
          return c
        })
        wx.setStorageSync('menuCategories', categories)
        that.setData({ categories: categories, showInputModal: false, inputValue: '', inputValue2: '' })
        wx.showToast({ title: '修改成功(本地)', icon: 'success' })
      }
    } else if (that.data.inputAction === 'addCategory') {
      var value = that.data.inputValue.trim()
      if (!value) {
        wx.showToast({ title: '请输入品类名称', icon: 'none' })
        return
      }

      // 写入云数据库
      try {
        var db = getDb()
        db.collection('categories').add({
          data: {
            shopId: shopId,
            name: value,
            sort: that.data.categories.length + 1,
            createdAt: Date.now()
          },
          success: function(res) {
            var newCat = { id: res._id, name: value, sort: that.data.categories.length + 1 }
            var categories = that.data.categories.concat([newCat])
            wx.setStorageSync('menuCategories', categories)
            that.setData({ categories: categories, showInputModal: false, inputValue: '' })
            wx.showToast({ title: '添加成功', icon: 'success' })
          },
          fail: function() {
            that.addCategoryLocal(value)
          }
        })
      } catch (e) {
        that.addCategoryLocal(value)
      }
    } else if (that.data.inputAction === 'addDish') {
      var name = that.data.inputValue.trim()
      var price = parseFloat(that.data.inputPrice) || 0
      var desc = (that.data.inputValue2 || '').substring(0, 10)

      if (!name) { wx.showToast({ title: '请输入名称', icon: 'none' }); return }
      if (!price) { wx.showToast({ title: '请填入价格', icon: 'none' }); return }

      // 先上传图片到云存储
      var saveDish = function(imageUrl) {
        try {
          var db = getDb()
          db.collection('dishes').add({
            data: {
              shopId: shopId,
              categoryId: that.data.currentCategory,
              name: name,
              description: desc,
              price: price,
              image: imageUrl || '',
              available: true,
              createdAt: Date.now()
            },
            success: function(res) {
              var newDish = {
                id: res._id,
                categoryId: that.data.currentCategory,
                name: name,
                description: desc,
                price: price,
                image: imageUrl || '',
                available: true
              }
              var dishes = wx.getStorageSync('menuDishes') || []
              dishes.push(newDish)
              wx.setStorageSync('menuDishes', dishes)
              that.setData({ showInputModal: false, inputValue: '', inputPrice: '', inputValue2: '', tempImage: '' })
              that.loadCategoryDishes(that.data.currentCategory)
              wx.showToast({ title: '添加成功', icon: 'success' })
            },
            fail: function() {
              that.addDishLocal(name, price, desc, imageUrl)
            }
          })
        } catch (e) {
          that.addDishLocal(name, price, desc, imageUrl)
        }
      }

      if (that.data.tempImage) {
        wx.cloud.uploadFile({
          cloudPath: 'dishes/' + Date.now() + '.jpg',
          filePath: that.data.tempImage,
          success: function(uploadRes) { saveDish(uploadRes.fileID) },
          fail: function() { saveDish(that.data.tempImage) }
        })
      } else {
        saveDish('')
      }
    } else if (that.data.inputAction === 'editDish') {
      var priceVal = parseFloat(that.data.inputValue) || 0
      var descVal = (that.data.inputValue2 || '').substring(0, 10)
      var dishId = that.data.editingDishId

      var doEdit = function(imageUrl) {
        var updateData = { price: priceVal, description: descVal }
        if (imageUrl) updateData.image = imageUrl

        try {
          var db = getDb()
          db.collection('dishes').doc(dishId).update({
            data: updateData,
            success: function() {
              var dishes = wx.getStorageSync('menuDishes') || []
              var idx = dishes.findIndex(function(d) { return d.id === dishId })
              if (idx !== -1) {
                dishes[idx].price = priceVal
                dishes[idx].description = descVal
                if (imageUrl) dishes[idx].image = imageUrl
                wx.setStorageSync('menuDishes', dishes)
              }
              that.setData({ showInputModal: false, inputValue: '', inputPrice: '', inputValue2: '', tempImage: '' })
              that.loadCategoryDishes(that.data.currentCategory)
              wx.showToast({ title: '修改成功', icon: 'success' })
            },
            fail: function() {
              that.editDishLocal(dishId, priceVal, descVal, imageUrl)
            }
          })
        } catch (e) {
          that.editDishLocal(dishId, priceVal, descVal, imageUrl)
        }
      }

      if (that.data.tempImage && that.data.tempImage !== that.getOriginalImage(dishId)) {
        wx.cloud.uploadFile({
          cloudPath: 'dishes/' + dishId + '_' + Date.now() + '.jpg',
          filePath: that.data.tempImage,
          success: function(uploadRes) { doEdit(uploadRes.fileID) },
          fail: function() { doEdit(that.data.tempImage) }
        })
      } else {
        doEdit('')
      }
    }
  },

  getOriginalImage: function(dishId) {
    var dishes = wx.getStorageSync('menuDishes') || []
    var found = dishes.find(function(d) { return d.id === dishId })
    return found ? found.image || '' : ''
  },

  // --- Local fallback helpers ---

  addCategoryLocal: function(value) {
    var categories = this.data.categories
    var newId = 'C_' + Date.now()
    categories.push({ id: newId, name: value })
    wx.setStorageSync('menuCategories', categories)
    this.setData({ categories: categories, showInputModal: false, inputValue: '' })
    wx.showToast({ title: '添加成功(本地)', icon: 'success' })
  },

  addDishLocal: function(name, price, desc, imageUrl) {
    var newDish = {
      id: 'D_' + Date.now(),
      categoryId: this.data.currentCategory,
      name: name,
      description: desc,
      price: price,
      image: imageUrl || '',
      available: true
    }
    var dishes = wx.getStorageSync('menuDishes') || []
    dishes.push(newDish)
    wx.setStorageSync('menuDishes', dishes)
    this.setData({ showInputModal: false, inputValue: '', inputPrice: '', inputValue2: '', tempImage: '' })
    this.loadCategoryDishes(this.data.currentCategory)
    wx.showToast({ title: '添加成功(本地)', icon: 'success' })
  },

  editDishLocal: function(dishId, priceVal, descVal, imageUrl) {
    var dishes = wx.getStorageSync('menuDishes') || []
    var idx = dishes.findIndex(function(d) { return d.id === dishId })
    if (idx !== -1) {
      dishes[idx].price = priceVal
      dishes[idx].description = descVal
      if (imageUrl) dishes[idx].image = imageUrl
      wx.setStorageSync('menuDishes', dishes)
    }
    this.setData({ showInputModal: false, inputValue: '', inputPrice: '', inputValue2: '', tempImage: '' })
    this.loadCategoryDishes(this.data.currentCategory)
    wx.showToast({ title: '修改成功(本地)', icon: 'success' })
  }
})
