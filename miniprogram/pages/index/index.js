const { getDb } = require('../../utils/cloud')
const { formatPrice } = require('../../utils/currency')
const { debounce } = require('../../utils/debounce')

Page({
  data: {
    tableNo: '',
    guestCount: '',
    shopName: '食易特 Eat',
    banners: [],
    homeTitle: '食易特 Eat',
    hasActiveSession: false,
    shopId: '',
    tableDisabled: false,
    loading: true
  },

  onLoad: function(options) {
    var that = this
    var shopId = options.shopId || options.scene || ''

    if (shopId) {
      wx.setStorageSync('currentShopId', shopId)
      that.setData({ shopId: shopId })
      that.loadShopInfo(shopId)
    } else {
      var savedShopId = wx.getStorageSync('currentShopId')
      if (savedShopId) {
        that.setData({ shopId: savedShopId })
        that.loadShopInfo(savedShopId)
      } else {
        that.loadFromCache()
        that.setData({ loading: false })
      }
    }

    // 尝试从扫码参数提取桌号
    if (options.tableNo) {
      that.setData({ tableNo: options.tableNo })
      that.checkActiveSession(options.tableNo)
    }
  },

  onShow: function() {
    // 每次显示页面时检查是否有活跃会话
    var currentTable = wx.getStorageSync('currentTable')
    if (currentTable && currentTable.tableNo) {
      this.checkActiveSession(currentTable.tableNo)
    }
  },

  // 从缓存加载数据（兼容未配置云开发的本地模式）
  loadFromCache: function() {
    var banners = wx.getStorageSync('shopBanners') || []
    var homeTitle = wx.getStorageSync('homeTitle') || '食易特 Eat'
    var shopName = wx.getStorageSync('shopName') || ''
    this.setData({
      banners: banners,
      homeTitle: homeTitle,
      shopName: shopName || homeTitle
    })
  },

  // 从云数据库加载店铺信息
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
            // 同步到本地缓存
            wx.setStorageSync('shopBanners', shop.banners || [])
            wx.setStorageSync('homeTitle', shop.homeTitle || '食易特 Eat')
            wx.setStorageSync('shopName', shop.shopName || '')
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

  // 检查是否已有活跃的点餐会话
  checkActiveSession: function(tableNo) {
    var that = this
    try {
      var db = getDb()
      db.collection('sessions')
        .where({ tableName: tableNo, status: 'active' })
        .get({
          success: function(res) {
            if (res.data && res.data.length > 0) {
              that.setData({ hasActiveSession: true })
              var session = res.data[0]
              wx.setStorageSync('currentSession', session)
              wx.setStorageSync('currentTable', {
                tableNo: session.tableName,
                guestCount: session.guestCount
              })
            }
          }
        })
    } catch (e) {
      // 本地模式：检查 storage
      var orders = wx.getStorageSync('allOrders') || []
      var hasActive = orders.some(function(o) {
        return String(o.tableNo) === String(tableNo) && o.status !== 'completed'
      })
      this.setData({ hasActiveSession: hasActive })
    }
  },

  // 桌号输入校验（仅数字+字母，最长10位）
  onTableInput: function(e) {
    var val = e.detail.value.replace(/[^a-zA-Z0-9]/g, '')
    this.setData({ tableNo: val })
    if (val.length >= 2) {
      this.validateTable(val)
    }
  },

  // 人数输入
  onGuestInput: function(e) {
    this.setData({ guestCount: e.detail.value })
  },

  // 校验桌号是否存在且可用
  validateTable: function(tableNo) {
    var that = this
    try {
      var db = getDb()
      db.collection('tables')
        .where({ name: tableNo })
        .get({
          success: function(res) {
            if (res.data && res.data.length > 0) {
              var table = res.data[0]
              that.setData({
                tableDisabled: table.status === 'disabled'
              })
              if (table.status === 'disabled') {
                wx.showToast({ title: '本桌已被禁用', icon: 'none' })
              }
            } else {
              that.setData({ tableDisabled: false })
            }
          }
        })
    } catch (e) {
      // 本地模式：简单校验
      var tables = wx.getStorageSync('tables') || []
      var found = tables.find(function(t) { return t.name === tableNo })
      if (!found) {
        that.setData({ tableDisabled: false })
      }
    }
  },

  // 开始点餐（防抖 300ms）
  startOrder: debounce(function() {
    var that = this
    var tableNo = that.data.tableNo.trim()
    var guestCount = that.data.guestCount.trim()

    if (!tableNo) {
      wx.showToast({ title: '请输入桌号/包房号', icon: 'none' })
      return
    }

    if (that.data.tableDisabled) {
      wx.showToast({ title: '本桌已被禁用，请联系老板', icon: 'none' })
      return
    }

    if (!guestCount) {
      wx.showToast({ title: '请输入就餐人数', icon: 'none' })
      return
    }

    if (parseInt(guestCount) < 1 || parseInt(guestCount) > 99) {
      wx.showToast({ title: '人数应在1-99之间', icon: 'none' })
      return
    }

    // 保存当前桌号信息
    wx.setStorageSync('currentTable', {
      tableNo: tableNo,
      guestCount: guestCount
    })

    // 跳转到点餐页
    wx.navigateTo({
      url: '/pages/menu/menu?tableNo=' + tableNo + '&guestCount=' + guestCount,
      fail: function() {
        wx.showToast({ title: '页面跳转失败', icon: 'none' })
      }
    })
  }, 300),

  // 继续上次点餐
  continueOrder: function() {
    var session = wx.getStorageSync('currentSession')
    if (session) {
      wx.navigateTo({
        url: '/pages/order/order?sessionId=' + session._id
      })
    }
  },

  // 扫码调起
  scanCode: function() {
    var that = this
    wx.scanCode({
      onlyFromCamera: true,
      success: function(res) {
        var result = res.result
        // 解析扫码结果：支持从链接中提取 tableNo
        var tableNo = ''
        if (result.indexOf('tableNo=') !== -1) {
          var match = result.match(/tableNo=([^&]+)/)
          if (match) tableNo = decodeURIComponent(match[1])
        } else {
          tableNo = result.trim()
        }
        that.setData({ tableNo: tableNo })
        if (tableNo) {
          that.checkActiveSession(tableNo)
        }
        wx.showToast({ title: '扫码成功', icon: 'success' })
      },
      fail: function() {
        wx.showToast({ title: '扫码取消', icon: 'none' })
      }
    })
  },

  // 进入厨房后台
  goKitchen: function() {
    wx.navigateTo({ url: '/pages/menuStatus/menuStatus' })
  },

  // 进入我的页面
  goMine: function() {
    wx.navigateTo({ url: '/pages/mine/mine' })
  },

  // 老板管理入口
  goOwnerLogin: function() {
    wx.navigateTo({
      url: '/pages/owner/login',
      fail: function() {
        wx.showToast({ title: '页面不可用', icon: 'none' })
      }
    })
  }
})
