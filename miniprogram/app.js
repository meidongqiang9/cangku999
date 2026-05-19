const { init } = require('./utils/cloud')

App({
  onLaunch: function() {
    init()
  },
  globalData: {
    userInfo: null,
    currentSession: null
  }
})
