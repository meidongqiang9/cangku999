Page({
  data: {
    tableNo: '',
    guestCount: '',
    shopName: '',
    banners: [],
    homeTitle: '食易特 Eat'
  },

  onLoad: function(options) {
    var shopId = options.shopId || ''
    
    if (shopId) {
      wx.setStorageSync('currentShopId', shopId)
      this.loadShopInfo(shopId)
    } else {
      var savedShopId = wx.getStorageSync('currentShopId')
      if (savedShopId) {
        this.loadShopInfo(savedShopId)
      }
    }
    
    this.loadBanners()
    this.loadHomeTitle()
    this.checkNotice()
  },

  loadHomeTitle: function() {
    var homeTitle = wx.getStorageSync('homeTitle') || '食易特 Eat'
    this.setData({ homeTitle: homeTitle })
  },

  checkNotice: function() {
    var notice = wx.getStorageSync('globalNotice')
    if (notice && Date.now() - notice.time < 24 * 60 * 60 * 1000) {
      wx.showModal({
        title: '通知',
        content: notice.text,
        showCancel: false
      })
    }
  },

  loadShopInfo: function(shopId) {
    var shopData = wx.getStorageSync('shopList') || {}
    var shop = shopData[shopId]
    if (shop) {
      this.setData({ shopName: shop.shopName })
    }
  },
  
  loadBanners: function() {
    var banners = wx.getStorageSync('shopBanners') || []
    this.setData({ banners: banners })
  },

  onTableInput: function(e) {
    this.setData({ tableNo: e.detail.value })
  },

  onGuestInput: function(e) {
    this.setData({ guestCount: e.detail.value })
  },

startOrder: function() {
    var tableNo = this.data.tableNo
    var guestCount = this.data.guestCount
    
    if (!tableNo) {
      wx.showToast({ title: '请输入桌号', icon: 'none' })
      return
    }
    
    var tables = wx.getStorageSync('tables') || []
    var validTable = tables.find(function(t) { return t.name === tableNo })
    if (!validTable) {
      wx.showToast({ title: '桌号不存在', icon: 'none' })
      return
    }
    
    var isChecked = wx.getStorageSync('tableChecked_' + tableNo)
    if (isChecked) {
      wx.setStorageSync('currentTable', { tableNo: tableNo, guestCount: guestCount })
      wx.navigateTo({ url: '/pages/order/receipt/receipt' })
      return
    }
    
    if (!guestCount) {
      wx.showToast({ title: '请输入人数', icon: 'none' })
      return
    }
    
    wx.setStorageSync('currentTable', { tableNo: tableNo, guestCount: guestCount })
    wx.navigateTo({
      url: '/pages/menu/menu?tableNo=' + tableNo + '&guestCount=' + guestCount
    })
  },

  goKitchen: function() {
    wx.navigateTo({
      url: '/pages/menuStatus/menuStatus'
    })
  },

  goMine: function() {
    wx.navigateTo({
      url: '/pages/mine/mine'
    })
  },

  goOwnerLogin: function() {
    wx.navigateTo({
      url: '/pages/owner/login'
    })
  }
})