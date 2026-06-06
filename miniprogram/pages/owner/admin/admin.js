const { getDb } = require('../../../utils/cloud')
const { formatDateTime } = require('../../../utils/time')

Page({
  data: {
    owners: [],
    totalOwners: 0,
    totalYuanbao: 0,
    frozenCount: 0,
    searchKeyword: '',
    showRechargeModal: false,
    rechargeShopId: '',
    rechargeShopName: '',
    rechargeAmount: 0,
    showAnnounceModal: false,
    announceType: 'broadcast',
    announceShopId: '',
    announceShopName: '',
    announceContent: ''
  },

  onLoad: function() {
    var user = wx.getStorageSync('ownerUser')
    if (!user || user.role !== 'admin') {
      wx.redirectTo({ url: '/pages/owner/login' })
      return
    }
    this.loadOwners()
  },

  onShow: function() {
    this.loadOwners()
  },

  loadOwners: function() {
    var that = this
    try {
      var db = getDb()
      db.collection('shops').get({
        success: function(res) {
          var shops = res.data || []
          var totalYuanbao = 0
          var frozenCount = 0
          var owners = shops.map(function(s) {
            totalYuanbao += s.yuanbao || 0
            if (s.frozen) frozenCount++
            return {
              _id: s._id,
              shopName: s.shopName || '',
              phone: s.phone || '',
              yuanbao: s.yuanbao || 0,
              frozen: s.frozen || false,
              referralCode: s.referralCode || '',
              referralCount: s.referralCount || 0,
              createdAt: s.createdAt,
              createdTime: formatDateTime(s.createdAt)
            }
          })

          var keyword = that.data.searchKeyword.toLowerCase()
          if (keyword) {
            owners = owners.filter(function(o) {
              return (o.shopName || '').toLowerCase().indexOf(keyword) !== -1 ||
                     (o.phone || '').indexOf(keyword) !== -1
            })
          }

          owners.sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0) })

          that.setData({
            owners: owners,
            totalOwners: shops.length,
            totalYuanbao: totalYuanbao,
            frozenCount: frozenCount
          })
        },
        fail: function() {}
      })
    } catch (e) {}
  },

  onSearchInput: function(e) {
    this.setData({ searchKeyword: e.detail.value })
    this.loadOwners()
  },

  viewOwnerDetail: function(e) {
    var shopId = e.currentTarget.dataset.shopid
    if (shopId) {
      wx.navigateTo({
        url: '/pages/owner/admin/ownerDetail/ownerDetail?shopId=' + shopId
      })
    }
  },

  showRecharge: function(e) {
    this.setData({
      showRechargeModal: true,
      rechargeShopId: e.currentTarget.dataset.shopid,
      rechargeShopName: e.currentTarget.dataset.shopname,
      rechargeAmount: 0
    })
  },

  onRechargeAmountInput: function(e) {
    this.setData({ rechargeAmount: parseInt(e.detail.value) || 0 })
  },

  confirmRecharge: function() {
    var that = this
    var amount = that.data.rechargeAmount
    if (amount <= 0) {
      wx.showToast({ title: '请输入充值金额', icon: 'none' })
      return
    }
    var shopId = that.data.rechargeShopId
    try {
      var db = getDb()
      db.collection('shops').doc(shopId).get({
        success: function(res) {
          var shop = res.data || {}
          var newBalance = (shop.yuanbao || 0) + amount
          var updates = { yuanbao: newBalance }
          if (newBalance > 0) updates.frozen = false

          db.collection('shops').doc(shopId).update({ data: updates })

          try {
            db.collection('yuanbao_transactions').add({
              data: {
                shopId: shopId,
                amount: amount,
                type: 'admin_recharge',
                description: '管理员充值 ' + amount + ' 元宝',
                balance: newBalance,
                createdAt: Date.now()
              }
            })
          } catch (e) {}

          that.setData({ showRechargeModal: false })
          wx.showToast({ title: '充值成功', icon: 'success' })
          that.loadOwners()
        }
      })
    } catch (e) {}
  },

  closeRechargeModal: function() {
    this.setData({ showRechargeModal: false })
  },

  toggleFreeze: function(e) {
    var shopId = e.currentTarget.dataset.shopid
    var isFrozen = e.currentTarget.dataset.frozen === true || String(e.currentTarget.dataset.frozen) === 'true'
    try {
      var db = getDb()
      var updates = isFrozen ? { frozen: false } : { frozen: true }
      db.collection('shops').doc(shopId).update({ data: updates })
      wx.showToast({ title: isFrozen ? '已解冻' : '已冻结', icon: 'success' })
      this.loadOwners()
    } catch (err) {}
  },

  showBroadcast: function() {
    this.setData({
      showAnnounceModal: true,
      announceType: 'broadcast',
      announceShopId: '',
      announceShopName: '',
      announceContent: ''
    })
  },

  showIndividualAnnounce: function(e) {
    this.setData({
      showAnnounceModal: true,
      announceType: 'individual',
      announceShopId: e.currentTarget.dataset.shopid,
      announceShopName: e.currentTarget.dataset.shopname,
      announceContent: ''
    })
  },

  onAnnounceContentInput: function(e) {
    this.setData({ announceContent: e.detail.value })
  },

  confirmAnnounce: function() {
    var that = this
    var content = that.data.announceContent.trim()
    if (!content) {
      wx.showToast({ title: '请输入通知内容', icon: 'none' })
      return
    }
    try {
      var db = getDb()
      db.collection('announcements').add({
        data: {
          title: '系统通知',
          content: content,
          shopId: that.data.announceType === 'broadcast' ? null : that.data.announceShopId,
          type: that.data.announceType,
          createdAt: Date.now()
        }
      })
      that.setData({ showAnnounceModal: false })
      wx.showToast({ title: '通知已发送', icon: 'success' })
    } catch (e) {}
  },

  closeAnnounceModal: function() {
    this.setData({ showAnnounceModal: false })
  },

  goBack: function() {
    wx.removeStorageSync('ownerUser')
    wx.removeStorageSync('currentShopId')
    wx.redirectTo({ url: '/pages/owner/login' })
  }
})