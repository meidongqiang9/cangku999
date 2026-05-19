const { getDb } = require('../../utils/cloud')

Page({
  data: {
    shopName: '',
    phone: '',
    mchId: '',
    mchKey: '',
    qrcodeUrl: '',
    banners: [],
    homeTitle: '',
    payType: 0,
    personalQrcode: '',
    shopId: ''
  },

  onLoad: function() {
    this.loadSettings()
  },

  onShow: function() {
    this.loadSettings()
  },

  loadSettings: function() {
    var that = this
    var user = wx.getStorageSync('ownerUser') || {}
    var shopId = wx.getStorageSync('currentShopId') || ''

    that.setData({ shopId: shopId })

    // 尝试从云数据库加载
    if (shopId) {
      try {
        var db = getDb()
        db.collection('shops').doc(shopId).get({
          success: function(res) {
            if (res.data) {
              var shop = res.data
              wx.setStorageSync('shopConfig', {
                phone: shop.phone || '',
                mchId: shop.mchId || '',
                mchKey: shop.mchKey || '',
                payType: shop.payType || 0,
                personalQrcode: shop.personalQrcode || ''
              })
              wx.setStorageSync('shopBanners', shop.banners || [])
              wx.setStorageSync('homeTitle', shop.homeTitle || '食易特 Eat')
              wx.setStorageSync('shopName', shop.shopName || '')

              that.setData({
                shopName: shop.shopName || '',
                phone: shop.phone || '',
                mchId: shop.mchId || '',
                mchKey: shop.mchKey || '',
                payType: shop.payType || 0,
                personalQrcode: shop.personalQrcode || '',
                banners: shop.banners || [],
                homeTitle: shop.homeTitle || '食易特 Eat',
                qrcodeUrl: 'pages/index/index?shopId=' + shopId
              })
            } else {
              that.loadFromLocal(user)
            }
          },
          fail: function() {
            that.loadFromLocal(user)
          }
        })
      } catch (e) {
        that.loadFromLocal(user)
      }
    } else {
      that.loadFromLocal(user)
    }
  },

  loadFromLocal: function(user) {
    var shopConfig = wx.getStorageSync('shopConfig') || {}
    var banners = wx.getStorageSync('shopBanners') || []
    var homeTitle = wx.getStorageSync('homeTitle') || '食易特 Eat'
    var shopId = wx.getStorageSync('currentShopId') || ''

    this.setData({
      shopName: (user && user.shopName) || '',
      phone: shopConfig.phone || '',
      mchId: shopConfig.mchId || '',
      mchKey: shopConfig.mchKey || '',
      payType: shopConfig.payType || 0,
      personalQrcode: shopConfig.personalQrcode || '',
      banners: banners,
      homeTitle: homeTitle,
      qrcodeUrl: 'pages/index/index?shopId=' + shopId
    })
  },

  onShopNameInput: function(e) { this.setData({ shopName: e.detail.value }) },
  onHomeTitleInput: function(e) { this.setData({ homeTitle: e.detail.value }) },
  onPhoneInput: function(e) { this.setData({ phone: e.detail.value }) },
  onMchIdInput: function(e) { this.setData({ mchId: e.detail.value }) },
  onMchKeyInput: function(e) { this.setData({ mchKey: e.detail.value }) },

  onPayTypeChange: function(e) {
    this.setData({ payType: parseInt(e.detail.value) })
  },

  uploadQrcode: function() {
    var that = this
    wx.chooseImage({
      count: 1,
      success: function(res) {
        var tempFilePath = res.tempFilePaths[0]
        // 尝试上传到云存储
        wx.cloud.uploadFile({
          cloudPath: 'qrcodes/' + Date.now() + '.jpg',
          filePath: tempFilePath,
          success: function(uploadRes) {
            that.setData({ personalQrcode: uploadRes.fileID })
          },
          fail: function() {
            that.setData({ personalQrcode: tempFilePath })
          }
        })
      }
    })
  },

  addBanner: function() {
    if (this.data.banners.length >= 5) {
      wx.showToast({ title: '最多5张图片', icon: 'none' })
      return
    }
    var that = this
    wx.chooseImage({
      count: 5 - that.data.banners.length,
      success: function(res) {
        var files = res.tempFilePaths
        var uploaded = []
        var remaining = files.length

        if (files.length === 0) return

        files.forEach(function(filePath) {
          wx.cloud.uploadFile({
            cloudPath: 'banners/' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) + '.jpg',
            filePath: filePath,
            success: function(uploadRes) {
              uploaded.push(uploadRes.fileID)
              remaining--
              if (remaining === 0) {
                that.setData({ banners: that.data.banners.concat(uploaded).slice(0, 5) })
              }
            },
            fail: function() {
              uploaded.push(filePath)
              remaining--
              if (remaining === 0) {
                that.setData({ banners: that.data.banners.concat(uploaded).slice(0, 5) })
              }
            }
          })
        })
      }
    })
  },

  removeBanner: function(e) {
    var index = e.currentTarget.dataset.index
    var newBanners = this.data.banners.filter(function(_, i) { return i !== index })
    this.setData({ banners: newBanners })
  },

  copyLink: function() {
    wx.setClipboardData({
      data: this.data.qrcodeUrl,
      success: function() {
        wx.showToast({ title: '已复制', icon: 'success' })
      }
    })
  },

  saveSettings: function() {
    var that = this
    var shopId = that.data.shopId
    var user = wx.getStorageSync('ownerUser') || {}

    var updateData = {
      shopName: that.data.shopName,
      phone: that.data.phone,
      mchId: that.data.mchId,
      mchKey: that.data.mchKey,
      payType: that.data.payType,
      personalQrcode: that.data.personalQrcode,
      banners: that.data.banners,
      homeTitle: that.data.homeTitle,
      updatedAt: Date.now()
    }

    // 更新本地
    user.shopName = that.data.shopName
    wx.setStorageSync('ownerUser', user)

    var shopConfig = wx.getStorageSync('shopConfig') || {}
    shopConfig.phone = that.data.phone
    shopConfig.mchId = that.data.mchId
    shopConfig.mchKey = that.data.mchKey
    shopConfig.payType = that.data.payType
    shopConfig.personalQrcode = that.data.personalQrcode
    wx.setStorageSync('shopConfig', shopConfig)

    wx.setStorageSync('shopBanners', that.data.banners)
    wx.setStorageSync('homeTitle', that.data.homeTitle)
    wx.setStorageSync('shopName', that.data.shopName)

    // 写入云数据库
    try {
      var db = getDb()
      if (shopId) {
        db.collection('shops').doc(shopId).update({
          data: updateData,
          success: function() {
            wx.showToast({ title: '保存成功', icon: 'success' })
          },
          fail: function() {
            wx.showToast({ title: '保存成功(本地)', icon: 'success' })
          }
        })
      } else {
        db.collection('shops').add({
          data: updateData,
          success: function(res) {
            wx.setStorageSync('currentShopId', res._id)
            that.setData({ shopId: res._id, qrcodeUrl: 'pages/index/index?shopId=' + res._id })
            wx.showToast({ title: '保存成功', icon: 'success' })
          },
          fail: function() {
            wx.showToast({ title: '保存成功(本地)', icon: 'success' })
          }
        })
      }
    } catch (e) {
      wx.showToast({ title: '保存成功(本地)', icon: 'success' })
    }
  }
})
