	const { init } = require('./utils/cloud')

	var PRIVACY_KEY = 'privacyAgreed'

	App({
	  onLaunch: function() {
	    init()
	  },
	  globalData: {
	    userInfo: null,
	    currentSession: null
	  },

	  // 检查是否已同意隐私政策
	  isPrivacyAgreed: function() {
	    return !!wx.getStorageSync(PRIVACY_KEY)
	  },

	  // 设置隐私政策同意状态
	  setPrivacyAgreed: function() {
	    wx.setStorageSync(PRIVACY_KEY, true)
	  },

	  // 弹出隐私政策授权弹窗（消费者端首次使用）
	  showPrivacyConsent: function(callback) {
	    var that = this
	    if (that.isPrivacyAgreed()) {
	      callback && callback(true)
	      return
	    }
	    wx.showModal({
	      title: '用户协议与隐私政策',
	      content: '欢迎使用食易特Eat！我们将依据《用户服务协议》及《隐私政策》处理您的个人信息。点击"同意"即表示您已阅读并同意上述协议和隐私政策。如不同意，您仍可匿名浏览菜单。',
	      confirmText: '同意',
	      cancelText: '查看隐私政策',
	      success: function(res) {
	        if (res.confirm) {
	          that.setPrivacyAgreed()
	          callback && callback(true)
	        } else if (res.cancel) {
	          wx.navigateTo({
	            url: '/pages/agreement/agreement/agreement?type=privacy',
	            success: function() {
	              callback && callback(false)
	            }
	          })
	        }
	      }
	    })
	  }
	})
