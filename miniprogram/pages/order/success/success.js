Page({
  data: {},

  onLoad: function() {},

  goHome: function() {
    wx.reLaunch({ url: '/pages/index/index' })
  }
})
