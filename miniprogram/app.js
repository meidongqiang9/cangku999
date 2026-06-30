		const { init } = require('./utils/cloud')

		var PRIVACY_KEY = 'privacyAgreed'

		App({
		  onLaunch: function() {
		    init()
		  },

		  // 缓存扫码参数（应对warm start时onLoad不触发的问题）
		  onShow: function(options) {
		    this.cacheQrParams(options)
		  },

		  cacheQrParams: function(options) {
		    var shopId = ''
		    var tableNo = ''

		    if (options && options.query) {
		      shopId = options.query.shopId || ''
		      tableNo = options.query.tableNo || ''
		    }

		    // 从 enterOptions 补充（URL Link 来源）
		    if (!shopId || !tableNo) {
		      try {
		        var enterOpts = wx.getEnterOptionsSync()
		        if (enterOpts && enterOpts.query) {
		          shopId = shopId || enterOpts.query.shopId || ''
		          tableNo = tableNo || enterOpts.query.tableNo || ''
		        }
		        // scene参数兜底（小程序码/菊花码来源，scene在query内）
		        if ((!shopId || !tableNo) && enterOpts && enterOpts.query && enterOpts.query.scene) {
		          var scene = decodeURIComponent(enterOpts.query.scene)
		          if (scene.charAt(0) === 's') {
		            var tIdx = scene.indexOf('t', 1)
		            if (tIdx > 1) {
		              shopId = shopId || scene.substring(1, tIdx)
		              tableNo = tableNo || scene.substring(tIdx + 1)
		            }
		          }
		        }
		      } catch (e) {}
		    }

		    if (shopId && tableNo) {
		      wx.setStorageSync('qrScanParams', { shopId: shopId, tableNo: tableNo })

		      // 老板在老板端页面扫码 → 自动跳回首页，触发 index.js 读取缓存参数
		      try {
		        var pages = getCurrentPages()
		        if (pages.length > 0) {
		          var currentRoute = pages[pages.length - 1].route || ''
		          if (currentRoute.indexOf('pages/owner/') !== -1) {
		            wx.reLaunch({ url: '/pages/index/index' })
		          }
		        }
		      } catch (e) {}
		    }
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
