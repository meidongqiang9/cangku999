// 云开发初始化
let db = null

function init() {
  if (!wx.cloud) {
    console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    return
  }
  wx.cloud.init({
    env: 'cloud1-d9gxni5yk09a9703f'
  })
  db = wx.cloud.database()
}

function getDb() {
  if (!db) {
    if (wx.cloud) {
      db = wx.cloud.database()
    } else {
      throw new Error('云开发未初始化')
    }
  }
  return db
}

function getSafeShopId() {
  var id = wx.getStorageSync('currentShopId')
  return (id != null && id !== '') ? id : null
}

module.exports = { init, getDb, getSafeShopId }
