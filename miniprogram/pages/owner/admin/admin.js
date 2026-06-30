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
    rechargeType: 'recharge',
    showAnnounceModal: false,
    announceType: 'broadcast',
    announceShopId: '',
    announceShopName: '',
    announceContent: '',
    showAddModal: false,
    newPhone: '',
    newPassword: '',
    newShopName: ''
  },

  onLoad: function() {
    var user = wx.getStorageSync('ownerUser')
    if (!user || user.role !== 'admin') {
      wx.redirectTo({ url: '/pages/owner/login' })
      return
    }
    this.checkAdminAccess()
  },

  onShow: function() {
    this.checkAdminAccess()
  },

  checkAdminAccess: function() {
    var that = this
    try {
      var db = getDb()
      db.collection('config').doc('adminSwitch').get({
        success: function(res) {
          var enabled = res.data && res.data.enabled
          if (enabled !== false) {
            that.loadOwners()
          } else {
            wx.showModal({
              title: '功能维护中',
              content: '管理后台暂不可用，请联系客服',
              showCancel: false,
              success: function() {
                wx.redirectTo({ url: '/pages/owner/home' })
              }
            })
          }
        },
        fail: function() {
          that.loadOwners()
        }
      })
    } catch (e) {
      this.loadOwners()
    }
  },

  loadOwners: function() {
    var that = this
    // 先执行每日元宝扣减
    that.dailyDeduct(function() {
      that._loadOwners()
    })
  },

  dailyDeduct: function(callback) {
    wx.cloud.callFunction({
      name: 'adminOps',
      data: { action: 'dailyDeduct' },
      success: function() {},
      fail: function() {},
      complete: function() {
        if (callback) callback()
      }
    })
  },

  _loadOwners: function() {
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
      rechargeAmount: 0,
      rechargeType: 'recharge'
    })
  },

  showDeduct: function(e) {
    this.setData({
      showRechargeModal: true,
      rechargeShopId: e.currentTarget.dataset.shopid,
      rechargeShopName: e.currentTarget.dataset.shopname,
      rechargeAmount: 0,
      rechargeType: 'deduct'
    })
  },

  onRechargeAmountInput: function(e) {
    this.setData({ rechargeAmount: parseInt(e.detail.value) || 0 })
  },

  confirmRecharge: function() {
    var that = this
    var amount = that.data.rechargeAmount
    if (amount <= 0) {
      wx.showToast({ title: '请输入金额', icon: 'none' })
      return
    }
    var isDeduct = that.data.rechargeType === 'deduct'
    var change = isDeduct ? -amount : amount
    var shopId = that.data.rechargeShopId
    wx.cloud.callFunction({
      name: 'adminOps',
      data: { action: 'recharge', shopId: shopId, amount: change },
      success: function() {
        that.setData({ showRechargeModal: false })
        wx.showToast({ title: isDeduct ? '已扣减' : '已充值', icon: 'success' })
        that.loadOwners()
      },
      fail: function() { wx.showToast({ title: '操作失败', icon: 'none' }) }
    })
  },

  closeRechargeModal: function() {
    this.setData({ showRechargeModal: false })
  },

  toggleFreeze: function(e) {
    var that = this
    var shopId = e.currentTarget.dataset.shopid
    wx.cloud.callFunction({
      name: 'adminOps',
      data: { action: 'toggleFreeze', shopId: shopId },
      success: function() { wx.showToast({ title: '操作成功', icon: 'success' }); that.loadOwners() },
      fail: function() { wx.showToast({ title: '操作失败', icon: 'none' }) }
    })
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

  // 新增老板账号
  showAddOwner: function() {
    this.setData({ showAddModal: true, newPhone: '', newPassword: '', newShopName: '' })
  },

  closeAddModal: function() {
    this.setData({ showAddModal: false })
  },

  onNewPhoneInput: function(e) { this.setData({ newPhone: e.detail.value }) },
  onNewPasswordInput: function(e) { this.setData({ newPassword: e.detail.value }) },
  onNewShopNameInput: function(e) { this.setData({ newShopName: e.detail.value }) },

  confirmAddOwner: function() {
    var that = this
    var phone = that.data.newPhone.trim()
    var password = that.data.newPassword.trim()
    var shopName = that.data.newShopName.trim()
    if (!phone || !/^1\d{10}$/.test(phone)) { wx.showToast({ title: '请输入正确手机号', icon: 'none' }); return }
    if (!password || password.length < 6) { wx.showToast({ title: '密码至少6位', icon: 'none' }); return }
    if (!shopName) { wx.showToast({ title: '请输入店铺名称', icon: 'none' }); return }

    try {
      var db = getDb()
      var refCode = ''
      var chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
      for (var i = 0; i < 6; i++) refCode += chars.charAt(Math.floor(Math.random() * chars.length))

      db.collection('shops').add({
        data: {
          shopName: shopName, phone: phone, password: password,
          referralCode: refCode, referralCount: 0,
          yuanbao: 30, frozen: false, lastDeductionDate: '',
          createdAt: Date.now()
        },
        success: function(res) {
          var shopId = res._id
          try {
            db.collection('users').add({
              data: { phone: phone, password: password, shopName: shopName, role: 'owner', shopId: shopId, referralCode: refCode, createdAt: Date.now() }
            })
            db.collection('yuanbao_transactions').add({
              data: { shopId: shopId, amount: 30, type: 'initial', description: '管理员创建店铺赠送元宝', balance: 30, createdAt: Date.now() }
            })
          } catch (e) {}
          that.setData({ showAddModal: false })
          wx.showToast({ title: '账号已创建', icon: 'success' })
          that.loadOwners()
        },
        fail: function() { wx.showToast({ title: '创建失败', icon: 'none' }) }
      })
    } catch (e) { wx.showToast({ title: '创建失败', icon: 'none' }) }
  },

  // 删除老板账号
  deleteOwner: function(e) {
    var that = this
    var shopId = e.currentTarget.dataset.shopid
    var shopName = e.currentTarget.dataset.shopname
    wx.showModal({
      title: '确认删除',
      content: '确定删除「' + shopName + '」及其所有数据吗？此操作不可恢复。',
      confirmText: '确认删除',
      confirmColor: '#E74C3C',
      success: function(res) {
        if (res.confirm) {
          wx.cloud.callFunction({
            name: 'adminOps',
            data: { action: 'delete', shopId: shopId },
            success: function() {
              wx.showToast({ title: '已删除', icon: 'success' })
              that.loadOwners()
            },
            fail: function() { wx.showToast({ title: '删除失败', icon: 'none' }) }
          })
        }
      }
    })
  },

  goBack: function() {
    wx.removeStorageSync('ownerUser')
    wx.removeStorageSync('currentShopId')
    wx.redirectTo({ url: '/pages/owner/login' })
  }
})