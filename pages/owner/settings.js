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
    personalQrcode: ''
  },

  onLoad: function() {
    this.loadSettings()
  },

  loadSettings: function() {
    var user = wx.getStorageSync('ownerUser')
    var shopConfig = wx.getStorageSync('shopConfig') || {}
    var banners = wx.getStorageSync('shopBanners') || []
    var homeTitle = wx.getStorageSync('homeTitle') || '食易特 Eat'
    
    this.setData({
      shopName: user?.shopName || '',
      phone: shopConfig.phone || '',
      mchId: shopConfig.mchId || '',
      mchKey: shopConfig.mchKey || '',
      qrcodeUrl: 'pages/index/index?shopId=' + (user?.id || ''),
      banners: banners,
      homeTitle: homeTitle,
      payType: shopConfig.payType || 0,
      personalQrcode: shopConfig.personalQrcode || ''
    })
  },

  onShopNameInput: function(e) {
    this.setData({ shopName: e.detail.value })
  },

  onHomeTitleInput: function(e) {
    this.setData({ homeTitle: e.detail.value })
  },

  onPhoneInput: function(e) {
    this.setData({ phone: e.detail.value })
  },

  onMchIdInput: function(e) {
    this.setData({ mchId: e.detail.value })
  },

  onMchKeyInput: function(e) {
    this.setData({ mchKey: e.detail.value })
  },

  onPayTypeChange: function(e) {
    this.setData({ payType: parseInt(e.detail.value) })
  },

  uploadQrcode: function() {
    var that = this
    wx.chooseImage({
      count: 1,
      success: function(res) {
        that.setData({ personalQrcode: res.tempFilePaths[0] })
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
        var newBanners = that.data.banners.concat(res.tempFilePaths).slice(0, 5)
        that.setData({ banners: newBanners })
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
    var user = wx.getStorageSync('ownerUser') || {}
    user.shopName = this.data.shopName
    wx.setStorageSync('ownerUser', user)
    
    var shopConfig = wx.getStorageSync('shopConfig') || {}
    shopConfig.phone = this.data.phone
    shopConfig.mchId = this.data.mchId
    shopConfig.mchKey = this.data.mchKey
    shopConfig.payType = this.data.payType
    shopConfig.personalQrcode = this.data.personalQrcode
    wx.setStorageSync('shopConfig', shopConfig)
    
    wx.setStorageSync('shopBanners', this.data.banners)
    wx.setStorageSync('homeTitle', this.data.homeTitle)
    
    wx.showToast({ title: '保存成功', icon: 'success' })
  }
})