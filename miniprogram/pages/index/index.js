const { getDb } = require('../../utils/cloud')
const { debounce } = require('../../utils/debounce')

Page({
  data: {
    tableNo: '',
    guestCount: '',
    shopName: '食易特 Eat',
    banners: [],
    homeTitle: '食易特 Eat',
    shopId: '',
    tableLocked: true,
    loading: true,
    showNotice: false,
    noticeTitle: '通知',
    noticeContent: ''
  },

  onLoad: function(options) {
    var that = this
    var shopId = options.shopId || ''
    var tableNo = options.tableNo || ''

    // 从 launchOptions / enterOptions 兜底
    if (!shopId || !tableNo) {
      try {
        var launchOpts = wx.getLaunchOptionsSync()
        if (launchOpts && launchOpts.query) {
          shopId = launchOpts.query.shopId || ''
          tableNo = launchOpts.query.tableNo || ''
        }
      } catch (e) {}
    }
    if (!shopId || !tableNo) {
      try {
        var enterOpts = wx.getEnterOptionsSync()
        if (enterOpts && enterOpts.query) {
          shopId = enterOpts.query.shopId || ''
          tableNo = enterOpts.query.tableNo || ''
        }
      } catch (e) {}
    }

    // 解析 scene 参数 (s<shopId>t<tableNo>)
    if ((!shopId || !tableNo) && options.scene) {
      var scene = decodeURIComponent(options.scene)
      if (scene.charAt(0) === 's') {
        var tIdx = scene.indexOf('t', 1)
        if (tIdx > 1) {
          shopId = scene.substring(1, tIdx)
          tableNo = scene.substring(tIdx + 1)
        }
      }
    }

    // 没有扫码参数 → 跳转老板登录页
    if (!shopId || !tableNo) {
      wx.redirectTo({ url: '/pages/owner/login' })
      return
    }

    // 扫码进入：锁定桌号，加载店铺信息
    wx.setStorageSync('currentShopId', shopId)
    that.setData({ shopId: shopId, tableNo: tableNo, tableLocked: true, loading: true })
    that.loadShopInfo(shopId)

    // 厨师扫码
    var chefId = options.chefId || ''
    var chefName = options.chefName ? decodeURIComponent(options.chefName) : ''
    if (chefId && chefName) {
      wx.setStorageSync('currentChef', { id: chefId, name: chefName })
      wx.navigateTo({
        url: '/pages/menuStatus/menuStatus?chefId=' + chefId + '&chefName=' + encodeURIComponent(chefName),
        fail: function() { wx.showToast({ title: '后厨页面不可用', icon: 'none' }) }
      })
    }
  },

  loadFromCache: function() {
    var banners = wx.getStorageSync('shopBanners') || []
    var homeTitle = wx.getStorageSync('homeTitle') || '食易特 Eat'
    var shopName = wx.getStorageSync('shopName') || ''
    this.setData({ banners: banners, homeTitle: homeTitle, shopName: shopName || homeTitle })
  },

  loadShopInfo: function(shopId) {
    var that = this
    try {
      var db = getDb()
      db.collection('shops').doc(shopId).get({
        success: function(res) {
          if (res.data) {
            var shop = res.data
            that.setData({
              shopName: shop.shopName || '食易特 Eat',
              banners: shop.banners || [],
              homeTitle: shop.homeTitle || '食易特 Eat',
              loading: false
            })
            wx.setStorageSync('shopBanners', shop.banners || [])
            wx.setStorageSync('homeTitle', shop.homeTitle || '食易特 Eat')
            wx.setStorageSync('shopName', shop.shopName || '')
            that.checkShopNotice()
          } else {
            that.loadFromCache()
            that.setData({ loading: false })
          }
        },
        fail: function() {
          that.loadFromCache()
          that.setData({ loading: false })
        }
      })
    } catch (e) {
      that.loadFromCache()
      that.setData({ loading: false })
    }
  },

  checkShopNotice: function() {
    var that = this
    var shopId = that.data.shopId || wx.getStorageSync('currentShopId') || ''
    var config = wx.getStorageSync('shopConfig') || {}
    if (config.noticeContent) {
      that.setData({ showNotice: true, noticeTitle: config.noticeTitle || '通知', noticeContent: config.noticeContent })
    }
    if (shopId) {
      try {
        var db = getDb()
        db.collection('shops').doc(shopId).get({
          success: function(res) {
            if (res.data && res.data.noticeContent) {
              config.noticeTitle = res.data.noticeTitle || '通知'
              config.noticeContent = res.data.noticeContent
              wx.setStorageSync('shopConfig', config)
              that.setData({ showNotice: true, noticeTitle: config.noticeTitle, noticeContent: config.noticeContent })
            }
          }
        })
      } catch (e) {}
    }
  },

  closeNotice: function() {
    this.setData({ showNotice: false })
  },

  onGuestInput: function(e) {
    this.setData({ guestCount: e.detail.value })
  },

  startOrder: debounce(function() {
    var that = this
    var tableNo = that.data.tableNo.trim()
    var guestCount = that.data.guestCount.trim()

    if (!guestCount) {
      wx.showToast({ title: '请输入人数', icon: 'none' })
      return
    }
    if (parseInt(guestCount) < 1 || parseInt(guestCount) > 99) {
      wx.showToast({ title: '人数应在1-99之间', icon: 'none' })
      return
    }

    wx.setStorageSync('currentTable', { tableNo: tableNo, guestCount: guestCount })
    wx.navigateTo({
      url: '/pages/menu/menu?tableNo=' + tableNo + '&guestCount=' + guestCount,
      fail: function() { wx.showToast({ title: '页面跳转失败', icon: 'none' }) }
    })
  }, 300),

  goOwnerLogin: function() {
    wx.navigateTo({ url: '/pages/owner/login', fail: function() { wx.showToast({ title: '页面不可用', icon: 'none' }) } })
  }
})
