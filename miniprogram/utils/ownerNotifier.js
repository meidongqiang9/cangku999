const { getDb } = require('./cloud')

var pollTimer = null
var isChecking = false
var audioCtx = null
var startedAt = 0

function startOwnerNotifier(page, options) {
  stopOwnerNotifier()
  options = options || {}

  var shopId = wx.getStorageSync('currentShopId') || ''
  if (!shopId) return

  startedAt = Date.now()
  ensureStorage(shopId)
  checkNotifications()
  pollTimer = setInterval(checkNotifications, options.interval || 8000)
}

function stopOwnerNotifier() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  startedAt = 0
}

function checkNotifications() {
  if (isChecking) return
  var shopId = wx.getStorageSync('currentShopId') || ''
  if (!shopId) return

  isChecking = true
  try {
    var db = getDb()
    db.collection('orders')
      .where({ shopId: shopId, status: 'pending' })
      .limit(50)
      .get({
        success: function(res) {
          isChecking = false
          handleOrders(res.data || [], shopId)
        },
        fail: function() {
          isChecking = false
        }
      })
  } catch (e) {
    isChecking = false
  }
}

function handleOrders(orders, shopId) {
  if (!orders.length) return

  orders.sort(function(a, b) { return (a.createdAt || 0) - (b.createdAt || 0) })
  var notified = getNotifiedMap(shopId)
  var next = null

  for (var i = 0; i < orders.length; i++) {
    var order = orders[i]
    if (order.checkoutRequested && (order.checkoutRequestedAt || 0) >= startedAt) {
      var checkoutId = 'checkout:' + (order.tableName || order.tableNo || '') + ':' + (order.checkoutRequestedAt || order.updatedAt || '')
      if (checkoutId && !notified[checkoutId]) {
        next = buildCheckoutNotice(order, checkoutId, orders)
        break
      }
    }

    if (!order.fromOwner && (order.createdAt || 0) >= startedAt) {
      var orderId = 'order:' + (order._id || order.createdAt || '')
      if (orderId && !notified[orderId]) {
        next = buildOrderNotice(order, orderId)
        break
      }
    }
  }

  if (!next) return

  notified[next.id] = Date.now()
  saveNotifiedMap(shopId, notified)
  remind(next)
}

function buildOrderNotice(order, id) {
  return {
    id: id,
    type: 'order',
    tableName: order.tableName || order.tableNo || '',
    totalPrice: order.totalPrice || 0,
    itemCount: countItems(order.items || [])
  }
}

function buildCheckoutNotice(order, id, orders) {
  var tableName = order.tableName || order.tableNo || ''
  var totalPrice = 0
  var itemCount = 0
  orders.forEach(function(item) {
    var itemTable = item.tableName || item.tableNo || ''
    if (itemTable !== tableName || item.status !== 'pending') return
    totalPrice += item.totalPrice || 0
    itemCount += countItems(item.items || [])
  })
  return {
    id: id,
    type: 'checkout',
    tableName: tableName,
    totalPrice: totalPrice || order.totalPrice || 0,
    itemCount: itemCount || countItems(order.items || [])
  }
}

function remind(item) {
  playAlert()

  wx.showModal({
    title: item.type === 'checkout' ? '结账请求' : '新订单',
    content: buildContent(item),
    confirmText: '查看',
    cancelText: '忽略',
    success: function(res) {
      if (res.confirm) {
        wx.navigateTo({ url: '/pages/owner/orders' })
      }
    }
  })
}

function buildContent(item) {
  var tableName = item.tableName || ''
  var amount = formatAmount(item.totalPrice)
  if (item.type === 'checkout') {
    return tableName + ' 请求结账 ' + amount + '元'
  }
  var countText = item.itemCount ? '共' + item.itemCount + '件' : ''
  return tableName + ' 有新订单' + countText + ' 共' + amount + '元'
}

function playAlert() {
  try {
    wx.vibrateLong()
    setTimeout(function() { wx.vibrateShort({ type: 'heavy' }) }, 500)
  } catch (e) {}

  try {
    if (!audioCtx && wx.createInnerAudioContext) {
      audioCtx = wx.createInnerAudioContext()
      audioCtx.src = '/audio/notify.wav'
      audioCtx.obeyMuteSwitch = false
    }
    if (audioCtx) {
      audioCtx.stop()
      audioCtx.play()
    }
  } catch (e) {}
}

function countItems(items) {
  var count = 0
  items.forEach(function(item) {
    count += item.quantity || 1
  })
  return count
}

function ensureStorage(shopId) {
  var key = storageKey(shopId)
  var data = wx.getStorageSync(key)
  if (!data) wx.setStorageSync(key, {})
}

function getNotifiedMap(shopId) {
  return wx.getStorageSync(storageKey(shopId)) || {}
}

function saveNotifiedMap(shopId, map) {
  var keys = Object.keys(map).sort(function(a, b) { return map[b] - map[a] })
  var slim = {}
  keys.slice(0, 100).forEach(function(k) { slim[k] = map[k] })
  wx.setStorageSync(storageKey(shopId), slim)
}

function storageKey(shopId) {
  return 'ownerNotified_' + shopId
}

function formatAmount(value) {
  var num = parseFloat(value || 0)
  if (isNaN(num)) num = 0
  return num.toFixed(2)
}

module.exports = {
  startOwnerNotifier: startOwnerNotifier,
  stopOwnerNotifier: stopOwnerNotifier,
  checkNotifications: checkNotifications
}
