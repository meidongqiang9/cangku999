const { getDb } = require('../../utils/cloud')
const { startOwnerNotifier, stopOwnerNotifier } = require('../../utils/ownerNotifier')
const { isSameDay, isSameMonth, isSameYear, todayStart, monthStart, yearStart } = require('../../utils/time')

Page({
  data: {
    shopName: '',
    todayOrders: 0,
    todayAmount: '0.00',
    monthOrders: 0,
    monthAmount: '0.00',
    showPasswordModal: false,
    passwordAction: 0,
    password: '',
    referralCode: '',
    referralCount: 0,
    referralCredit: '0',
    yuanbao: 0,
    frozen: false
  },

  onLoad: function() {
    this.checkAuth()
    this.loadData()
    this.checkAndDeductYuanbao()
  },

  onShow: function() {
    this.checkAuth()
    this.loadStats()
    startOwnerNotifier(this)
  },

  onHide: function() {
    stopOwnerNotifier()
  },

  onUnload: function() {
    stopOwnerNotifier()
  },

  checkAuth: function() {
    var user = wx.getStorageSync('ownerUser')
    if (!user) {
      wx.redirectTo({ url: '/pages/owner/login' })
      return
    }

    var now = Date.now()
    if (user.expiresAt && now > user.expiresAt) {
      wx.showModal({
        title: '账号到期',
        content: '请联系作者续费',
        showCancel: false,
        success: function() {
          wx.removeStorageSync('ownerUser')
          wx.redirectTo({ url: '/pages/owner/login' })
        }
      })
      return
    }

    if (user.canUse === false) {
      wx.showModal({
        title: '账号已禁用',
        content: '请联系作者',
        showCancel: false,
        success: function() {
          wx.removeStorageSync('ownerUser')
          wx.redirectTo({ url: '/pages/owner/login' })
        }
      })
      return
    }

    if (user.frozen) {
      wx.showModal({
        title: '账户已冻结',
        content: '您的元宝余额已耗尽，请联系客服充值解冻',
        showCancel: false,
        success: function() {
          wx.removeStorageSync('ownerUser')
          wx.redirectTo({ url: '/pages/owner/login' })
        }
      })
      return
    }
  },

  loadData: function() {
    var user = wx.getStorageSync('ownerUser')
    if (user) {
      this.setData({
        shopName: user.shopName || '我的店铺',
        referralCode: user.referralCode || ''
      })
    }
    this.loadReferralStats()
    this.loadStats()
  },

  loadReferralStats: function() {
    var that = this
    var shopId = wx.getStorageSync('currentShopId') || ''
    if (!shopId) return
    try {
      var db = getDb()
      db.collection('shops').doc(shopId).get({
        success: function(res) {
          if (res.data) {
            var count = res.data.referralCount || 0
            var yuanbao = res.data.yuanbao || 0
            that.setData({
              referralCode: res.data.referralCode || that.data.referralCode,
              referralCount: count,
              referralCredit: (count * 10).toString(),
              yuanbao: yuanbao,
              frozen: res.data.frozen || false
            })
          }
        },
        fail: function() {}
      })
    } catch (e) {}
  },

  checkAndDeductYuanbao: function() {
    var that = this
    var shopId = wx.getStorageSync('currentShopId') || ''
    if (!shopId) return
    try {
      var db = getDb()
      db.collection('shops').doc(shopId).get({
        success: function(res) {
          var shop = res.data || {}
          if (shop.frozen) return
          var today = that.getDateString()
          var lastDate = shop.lastDeductionDate || ''
          if (lastDate === today) return

          var yuanbao = shop.yuanbao || 0
          if (lastDate) {
            var lastTime = new Date(lastDate.replace(/-/g, '/') + 'T00:00:00').getTime()
            var todayTime = new Date(today.replace(/-/g, '/') + 'T00:00:00').getTime()
            var daysMissed = Math.floor((todayTime - lastTime) / 86400000)
            daysMissed = Math.min(daysMissed, 30)
            yuanbao = Math.max(0, yuanbao - daysMissed)
          } else {
            yuanbao = Math.max(0, yuanbao - 1)
          }

          var frozen = yuanbao <= 0
          db.collection('shops').doc(shopId).update({
            data: { yuanbao: yuanbao, frozen: frozen, lastDeductionDate: today }
          })
          if (yuanbao < (shop.yuanbao || 0)) {
            try {
              db.collection('yuanbao_transactions').add({
                data: {
                  shopId: shopId,
                  amount: -(shop.yuanbao - yuanbao),
                  type: 'daily_deduction',
                  description: '每日扣费',
                  balance: yuanbao,
                  createdAt: Date.now()
                }
              })
            } catch (e) {}
          }
          that.setData({ yuanbao: yuanbao, frozen: frozen })
          if (frozen) {
            var user = wx.getStorageSync('ownerUser') || {}
            user.frozen = true
            wx.setStorageSync('ownerUser', user)
            wx.showModal({
              title: '账户已冻结',
              content: '您的元宝余额已耗尽，请联系客服充值解冻',
              showCancel: false,
              success: function() {
                wx.removeStorageSync('ownerUser')
                wx.redirectTo({ url: '/pages/owner/login' })
              }
            })
          }
        }
      })
    } catch (e) {}
  },

  getDateString: function() {
    var d = new Date()
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0')
  },

  loadStats: function() {
    var that = this
    var shopId = wx.getStorageSync('currentShopId') || ''
    try {
      var db = getDb()
      db.collection('orders')
        .where({ shopId: shopId })
        .get({
        success: function(res) {
          that.calcStats(res.data || [])
        },
        fail: function() {
          that.calcStatsFromLocal()
        }
      })
    } catch (e) {
      that.calcStatsFromLocal()
    }
  },

  calcStats: function(orders) {
    var todayCleared = {}
    var monthCleared = {}
    var todayAmount = 0
    var monthAmount = 0

    orders.forEach(function(o) {
      // 只统计已结账（清台翻台）的订单
      if (o.status !== 'paid' && o.status !== 'completed') return

      var isToday = isSameDay(o.paidAt || o.createdAt, Date.now())
      var isThisMonth = isSameMonth(o.paidAt || o.createdAt, Date.now())
      var amount = o.totalPrice || 0

      // 按桌号+结账时间排重（同一次翻台可能有多条订单：顾客+协助）
      var clearKey = (o.tableName || o.tableNo || '') + '_' + (o.paidAt || o.createdAt || '')
      if (isToday && clearKey) {
        todayCleared[clearKey] = true
        todayAmount += amount
      }
      if (isThisMonth && clearKey) {
        monthCleared[clearKey] = true
        monthAmount += amount
      }
    })

    this.setData({
      todayOrders: Object.keys(todayCleared).length,
      todayAmount: todayAmount.toFixed(2),
      monthOrders: Object.keys(monthCleared).length,
      monthAmount: monthAmount.toFixed(2)
    })
  },

  calcStatsFromLocal: function() {
    var orders = wx.getStorageSync('allOrders') || []
    this.calcStats(orders)
  },

  goMenu: function() { wx.navigateTo({ url: '/pages/owner/menu' }) },
  goTables: function() { wx.navigateTo({ url: '/pages/owner/tables' }) },
  goOrders: function() { wx.navigateTo({ url: '/pages/owner/orders' }) },
  goSettings: function() { wx.navigateTo({ url: '/pages/owner/settings' }) },
  goContact: function() { wx.navigateTo({ url: '/pages/owner/contact' }) },
  goChefs: function() { wx.navigateTo({ url: '/pages/owner/chefs/chefs' }) },

  clearData: function() {
    var that = this
    wx.showActionSheet({
      itemList: ['清零今日数据', '清零本月数据', '清零本年数据', '重置测试数据(订单+菜品+会话)'],
      success: function(res) {
        that.setData({
          showPasswordModal: true,
          passwordAction: res.tapIndex,
          password: ''
        })
      }
    })
  },

  onPasswordInput: function(e) {
    this.setData({ password: e.detail.value })
  },

  confirmPassword: function() {
    var that = this
    var pwd = that.data.password || ''
    var users = wx.getStorageSync('ownerUsers') || []
    var user = wx.getStorageSync('ownerUser')
    var shopId = wx.getStorageSync('currentShopId') || ''

    var valid = false
    if (user && pwd === 'M@dq616699') {
      valid = true
    } else if (users.some(function(u) { return u.password === pwd })) {
      valid = true
    }

    if (!valid) {
      wx.showToast({ title: '密码错误', icon: 'none' })
      return
    }

    var type = that.data.passwordAction

    // 重置全部测试数据：清 sessions + orders + order_items
    if (type === 3) {
      var done = 0
      var cols = ['sessions', 'orders', 'order_items']
      try {
        var db = getDb()
        cols.forEach(function(coll) {
          db.collection(coll).where({ shopId: shopId }).get({
            success: function(res) {
              (res.data || []).forEach(function(d) { if (d._id) db.collection(coll).doc(d._id).remove() })
              done++
              if (done >= 3) {
                wx.removeStorageSync('allOrders')
                wx.removeStorageSync('currentTable')
                wx.removeStorageSync('currentSession')
                that.loadStats()
                wx.showToast({ title: '测试数据已重置', icon: 'success' })
              }
            },
            fail: function() {
              done++
              if (done >= 3) {
                wx.removeStorageSync('allOrders')
                wx.removeStorageSync('currentTable')
                wx.removeStorageSync('currentSession')
                that.loadStats()
                wx.showToast({ title: '重置完成', icon: 'success' })
              }
            }
          })
        })
      } catch (e) { wx.showToast({ title: '重置失败', icon: 'none' }) }
      that.setData({ showPasswordModal: false, password: '' })
      return
    }

    // 从云数据库基于 shopId 清零
    try {
      var db = getDb()
      var cutoff
      if (type === 0) {
        cutoff = todayStart()
      } else if (type === 1) {
        cutoff = monthStart()
      } else {
        cutoff = yearStart()
      }
      db.collection('orders').where({ shopId: shopId }).get({
        success: function(res) {
          (res.data || []).forEach(function(o) {
            if (o.createdAt >= cutoff && o._id) {
              db.collection('orders').doc(o._id).remove()
            }
          })
          // 同步刷新本地数据和UI
          that.loadStats()
          wx.showToast({ title: '数据已清零', icon: 'success' })
        }
      })
    } catch (e) {}

    // 同时清理本地缓存
    var orders = wx.getStorageSync('allOrders') || []
    if (type === 0) {
      orders = orders.filter(function(o) {
        return !isSameDay(o.createdAt, Date.now())
      })
    } else if (type === 1) {
      orders = orders.filter(function(o) {
        return !isSameMonth(o.createdAt, Date.now())
      })
    } else {
      orders = orders.filter(function(o) {
        return !isSameYear(o.createdAt, Date.now())
      })
    }

    wx.setStorageSync('allOrders', orders)
    that.setData({ showPasswordModal: false, password: '' })
    that.loadStats()
    wx.showToast({ title: '已清零', icon: 'success' })
  },

  closePasswordModal: function() {
    this.setData({ showPasswordModal: false, password: '' })
  },

  logout: function() {
    var that = this
    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      success: function(res) {
        if (res.confirm) {
          var keys = [
            'ownerUser', 'currentShopId', 'shopConfig', 'shopBanners',
            'homeTitle', 'shopName', 'menuCategories', 'menuDishes',
            'tables', 'allOrders', 'currentTable', 'currentSession',
            'currentTableDetail', 'currentChef', 'needRefreshOrder'
          ]
          keys.forEach(function(k) { wx.removeStorageSync(k) })
          try {
            var info = wx.getStorageInfoSync()
            info.keys.forEach(function(k) {
              if (k.indexOf('chefs_') === 0 || k.indexOf('menuCategories_') === 0 || k.indexOf('menuDishes_') === 0) {
                wx.removeStorageSync(k)
              }
            })
          } catch (e) {}
          wx.redirectTo({ url: '/pages/owner/login' })
        }
      }
    })
  }
})
