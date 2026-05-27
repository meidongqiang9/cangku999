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
    tableLocked: false,
    loading: true,
    showNotice: false,
    noticeTitle: '通知',
    noticeContent: ''
  },

  onLoad: function(options) {
    var that = this
    var shopId = options.shopId || ''
    var tableNo = options.tableNo || ''

    // 解析 getUnlimited 的 scene 参数（格式: s<shopId24位>t<tableNo>）
    if (!shopId && options.scene) {
      var scene = decodeURIComponent(options.scene)
      // scene 格式: s + 24位hex shopId + t + tableNo
      if (scene.charAt(0) === 's' && scene.length > 25) {
        shopId = scene.substring(1, 25)  // 24位 shopId
        tableNo = scene.substring(26)     // t 之后的部分
      }
    }

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

    // 尝试从扫码参数提取桌号（扫码进入则锁定桌号）
    if (tableNo) {
      that.setData({ tableNo: tableNo, tableLocked: true })
      that.checkActiveSession(tableNo)
    }

    // 厨师扫码进入（通过小程序码）
    var chefId = options.chefId || ''
    var chefName = options.chefName ? decodeURIComponent(options.chefName) : ''
    if (chefId && chefName) {
      var chefShopId = options.shopId || shopId || ''
      wx.setStorageSync('currentShopId', chefShopId)
      wx.setStorageSync('currentChef', { id: chefId, name: chefName })
      wx.navigateTo({
        url: '/pages/menuStatus/menuStatus?chefId=' + chefId + '&chefName=' + encodeURIComponent(chefName),
        fail: function() {
          wx.showToast({ title: '后厨页面不可用', icon: 'none' })
        }
      })
    }

    // 扫码进入时弹出店铺通知
    if (tableNo || options.scene) {
      that.checkShopNotice()
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
            // 加载完店铺信息后检查通知
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

  // 检查店铺通知（扫码进入时弹出）
  checkShopNotice: function() {
    var that = this
    var shopId = that.data.shopId || wx.getStorageSync('currentShopId') || ''

    // 先从本地配置读（保证有内容显示）
    var config = wx.getStorageSync('shopConfig') || {}
    if (config.noticeContent) {
      that.setData({
        showNotice: true,
        noticeTitle: config.noticeTitle || '通知',
        noticeContent: config.noticeContent
      })
    }

    // 再从云端同步最新通知
    if (shopId) {
      try {
        var db = getDb()
        db.collection('shops').doc(shopId).get({
          success: function(res) {
            if (res.data && res.data.noticeContent) {
              var noticeTitle = res.data.noticeTitle || '通知'
              var noticeContent = res.data.noticeContent
              // 更新本地缓存
              config.noticeTitle = noticeTitle
              config.noticeContent = noticeContent
              wx.setStorageSync('shopConfig', config)
              // 如果云端内容不同，更新显示
              that.setData({
                showNotice: true,
                noticeTitle: noticeTitle,
                noticeContent: noticeContent
              })
            }
          }
        })
      } catch (e) {}
    }
  },

  closeNotice: function() {
    this.setData({ showNotice: false })
  },

  // 检查是否已有活跃的点餐会话
  checkActiveSession: function(tableNo) {
    var that = this
    var shopId = that.data.shopId || wx.getStorageSync('currentShopId') || ''
    try {
      var db = getDb()
      db.collection('sessions')
        .where({ tableName: tableNo, status: 'active', shopId: shopId })
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
    var shopId = that.data.shopId || wx.getStorageSync('currentShopId') || ''
    try {
      var db = getDb()
      db.collection('tables')
        .where({ name: tableNo, shopId: shopId })
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
      wx.showToast({ title: '请输入人数', icon: 'none' })
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
        var tableNo = ''
        var shopId = ''
        var chefId = ''
        var chefName = ''

        // 检测厨师扫码
        if (result.indexOf('chefId=') !== -1) {
          var chefMatch = result.match(/chefId=([^&]+)/)
          if (chefMatch) chefId = decodeURIComponent(chefMatch[1])
          var chefNameMatch = result.match(/chefName=([^&]+)/)
          if (chefNameMatch) chefName = decodeURIComponent(chefNameMatch[1])
        }

        // 解析 shopId
        if (result.indexOf('shopId=') !== -1) {
          var shopMatch = result.match(/shopId=([^&]+)/)
          if (shopMatch) shopId = decodeURIComponent(shopMatch[1])
        }

        // 解析 tableNo
        if (result.indexOf('tableNo=') !== -1) {
          var match = result.match(/tableNo=([^&]+)/)
          if (match) tableNo = decodeURIComponent(match[1])
        } else if (!chefId) {
          tableNo = result.trim()
        }

        // 厨师扫码 → 跳转后厨
        if (chefId && shopId) {
          wx.setStorageSync('currentShopId', shopId)
          wx.setStorageSync('currentChef', { id: chefId, name: chefName || '厨师' })
          wx.showToast({ title: chefName + ' 登录成功', icon: 'success' })
          setTimeout(function() {
            wx.navigateTo({ url: '/pages/menuStatus/menuStatus?chefId=' + chefId + '&chefName=' + encodeURIComponent(chefName) })
          }, 600)
          return
        }

        // 如果扫到了 shopId，更新店铺信息
        if (shopId) {
          wx.setStorageSync('currentShopId', shopId)
          that.setData({ shopId: shopId })
          that.loadShopInfo(shopId)
        }

        if (tableNo) {
          that.setData({ tableNo: tableNo, tableLocked: true })
          // 自动进入点餐：存桌号信息后直接跳转菜单页
          wx.setStorageSync('currentTable', {
            tableNo: tableNo,
            guestCount: '1'
          })
          wx.showToast({ title: '扫码成功，进入点餐', icon: 'success' })
          setTimeout(function() {
            wx.navigateTo({
              url: '/pages/menu/menu?tableNo=' + tableNo + '&guestCount=1'
            })
          }, 500)
          return
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
