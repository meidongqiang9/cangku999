const { getDb } = require('../../utils/cloud')

Page({
  data: {
    users: [],
    selectedUser: null,
    noticeText: ''
  },

  onLoad: function() {
    this.loadUsers()
  },

  onShow: function() {
    this.loadUsers()
  },

  loadUsers: function() {
    var that = this
    var shopId = wx.getStorageSync('currentShopId') || ''
    // 先从本地加载
    var localUsers = wx.getStorageSync('ownerUsers') || []

    try {
      var db = getDb()
      var query = { role: 'owner' }
      if (shopId) query.shopId = shopId
      db.collection('users')
        .where(query)
        .get({
          success: function(res) {
            var cloudUsers = (res.data || []).map(function(u) {
              return {
                id: u._id,
                phone: u.phone || '',
                shopName: u.shopName || '',
                role: u.role || 'owner',
                canUse: u.canUse !== false,
                createdAt: u.createdAt
              }
            })

            // 合并云端和本地用户（去重）
            var merged = cloudUsers.slice()
            localUsers.forEach(function(local) {
              if (!merged.some(function(m) { return m.phone === local.phone })) {
                merged.push(local)
              }
            })

            // 同步到本地
            wx.setStorageSync('ownerUsers', merged)
            that.setData({ users: merged })
          },
          fail: function() {
            that.setData({ users: localUsers })
          }
        })
    } catch (e) {
      that.setData({ users: localUsers })
    }
  },

  selectUser: function(e) {
    var phone = e.currentTarget.dataset.phone
    var user = this.data.users.find(function(u) { return u.phone === phone })
    this.setData({ selectedUser: user, noticeText: '' })
  },

  sendToOne: function() {
    var that = this
    var text = that.data.noticeText.trim()
    if (!text) {
      wx.showToast({ title: '请输入通知内容', icon: 'none' })
      return
    }
    if (!that.data.selectedUser) return

    wx.setStorageSync('userNotice_' + that.data.selectedUser.phone, {
      text: text,
      time: Date.now()
    })
    wx.showToast({ title: '通知已发送', icon: 'success' })
    that.setData({ selectedUser: null, noticeText: '' })
  },

  sendToAll: function() {
    var that = this
    var text = that.data.noticeText.trim()
    if (!text) {
      wx.showToast({ title: '请输入通知内容', icon: 'none' })
      return
    }
    wx.setStorageSync('globalNotice', {
      text: text,
      time: Date.now()
    })
    wx.showToast({ title: '通知已群发', icon: 'success' })
    that.setData({ noticeText: '' })
  },

  onNoticeInput: function(e) {
    this.setData({ noticeText: e.detail.value })
  },

  closeNotice: function() {
    this.setData({ selectedUser: null, noticeText: '' })
  }
})
