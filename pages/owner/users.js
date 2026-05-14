Page({
  data: {
    users: [],
    selectedUser: null,
    noticeText: ''
  },

  onLoad: function() {
    this.loadUsers()
  },

  loadUsers: function() {
    var users = wx.getStorageSync('ownerUsers') || []
    this.setData({ users: users })
  },

  selectUser: function(e) {
    var phone = e.currentTarget.dataset.phone
    var user = this.data.users.find(function(u) { return u.phone === phone })
    this.setData({ selectedUser: user, noticeText: '' })
  },

  sendToOne: function() {
    var that = this
    var text = that.data.noticeText
    if (!text) {
      wx.showToast({ title: '请输入通知内容', icon: 'none' })
      return
    }
    wx.setStorageSync('userNotice_' + that.data.selectedUser.phone, {
      text: text,
      time: Date.now()
    })
    wx.showToast({ title: '通知已发送', icon: 'success' })
    that.setData({ selectedUser: null, noticeText: '' })
  },

  sendToAll: function() {
    var that = this
    var text = that.data.noticeText
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