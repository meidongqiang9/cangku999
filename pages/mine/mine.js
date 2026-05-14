Page({
  data: {
    shopId: '',
    shopName: '',
    mchId: '',
    mchKey: '',
    subAppId: '',
    bankName: '',
    bankAccount: '',
    bankNameFull: '',
    orderCount: 0,
    todayAmount: 0
  },

  onLoad: function() {
    this.loadShopData()
    this.loadTodayStats()
  },

  onShopNameInput: function(e) {
    this.setData({ shopName: e.detail.value })
  },
  onMchIdInput: function(e) {
    this.setData({ mchId: e.detail.value })
  },
  onMchKeyInput: function(e) {
    this.setData({ mchKey: e.detail.value })
  },
  onSubAppIdInput: function(e) {
    this.setData({ subAppId: e.detail.value })
  },
  onBankNameInput: function(e) {
    this.setData({ bankName: e.detail.value })
  },
  onBankAccountInput: function(e) {
    this.setData({ bankAccount: e.detail.value })
  },
  onBankNameFullInput: function(e) {
    this.setData({ bankNameFull: e.detail.value })
  },

  loadShopData: function() {
    var shopData = wx.getStorageSync('shopConfig')
    if (shopData) {
      this.setData({
        shopId: shopData.shopId || '',
        shopName: shopData.shopName || '',
        mchId: shopData.mchId || '',
        mchKey: shopData.mchKey || '',
        subAppId: shopData.subAppId || '',
        bankName: shopData.bankName || '',
        bankAccount: shopData.bankAccount || '',
        bankNameFull: shopData.bankNameFull || ''
      })
    }
  },

  saveSettings: function() {
    var data = {
      shopId: this.data.shopId,
      shopName: this.data.shopName,
      mchId: this.data.mchId,
      mchKey: this.data.mchKey,
      subAppId: this.data.subAppId,
      bankName: this.data.bankName,
      bankAccount: this.data.bankAccount,
      bankNameFull: this.data.bankNameFull
    }
    
    if (!this.data.shopId) {
      data.shopId = 'SHOP' + Date.now()
    }
    
    wx.setStorageSync('shopConfig', data)
    wx.showToast({ title: '保存成功', icon: 'success' })
  },

  generateQrCode: function() {
    if (!this.data.shopId) {
      wx.showToast({ title: '请先保存设置', icon: 'none' })
      return
    }
    
    var qrUrl = 'https://yourdomain.com/#/pages/index/index?shopId=' + this.data.shopId
    
    wx.showModal({
      title: '店铺二维码',
      content: '链接: ' + qrUrl + '\n\n可将此链接生成二维码打印给顾客扫码',
      confirmText: '复制链接',
      success: function(res) {
        if (res.confirm) {
          wx.setClipboardData({ data: qrUrl })
        }
      }
    })
  },

  loadTodayStats: function() {
    var orders = wx.getStorageSync('allOrders') || []
    var today = new Date().toDateString()
    var todayOrders = orders.filter(function(o) {
      return new Date(o.createdAt).toDateString() === today
    })
    
    var total = 0
    todayOrders.forEach(function(o) {
      total += o.totalPrice || 0
    })
    
    this.setData({
      orderCount: todayOrders.length,
      todayAmount: total.toFixed(2)
    })
  }
})