const { getDb } = require('../../../../utils/cloud')
const { formatDateTime } = require('../../../../utils/time')

Page({
  data: {
    shopId: '',
    shopInfo: null,
    transactions: [],
    referrals: []
  },

  onLoad: function(options) {
    var shopId = options.shopId || ''
    if (!shopId) {
      wx.navigateBack()
      return
    }
    this.setData({ shopId: shopId })
    this.loadData()
    this.loadTransactions()
    this.loadReferrals()
  },

  loadData: function() {
    var that = this
    try {
      var db = getDb()
      db.collection('shops').doc(that.data.shopId).get({
        success: function(res) {
          var shop = res.data || {}
          that.setData({
            shopInfo: {
              shopName: shop.shopName || '',
              phone: shop.phone || '未绑定',
              yuanbao: shop.yuanbao || 0,
              frozen: shop.frozen || false,
              referralCode: shop.referralCode || '',
              referralCount: shop.referralCount || 0,
              createdAt: formatDateTime(shop.createdAt)
            }
          })
        }
      })
    } catch (e) {}
  },

  loadTransactions: function() {
    var that = this
    try {
      var db = getDb()
      db.collection('yuanbao_transactions')
        .where({ shopId: that.data.shopId })
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get({
          success: function(res) {
            var transactions = (res.data || []).map(function(t) {
              var typeLabel = ''
              if (t.type === 'initial') typeLabel = '初始赠送'
              else if (t.type === 'referral_bonus') typeLabel = '推荐奖励'
              else if (t.type === 'daily_deduction') typeLabel = '每日扣费'
              else if (t.type === 'admin_recharge') typeLabel = '管理员充值'
              else typeLabel = t.type
              return {
                type: typeLabel,
                amount: t.amount,
                description: t.description || '',
                balance: t.balance,
                time: formatDateTime(t.createdAt),
                isPositive: t.amount > 0
              }
            })
            that.setData({ transactions: transactions })
          }
        })
    } catch (e) {}
  },

  loadReferrals: function() {
    var that = this
    try {
      var db = getDb()
      db.collection('referrals')
        .where({ referrerShopId: that.data.shopId })
        .get({
          success: function(res) {
            var referrals = (res.data || []).map(function(r) {
              return {
                referredPhone: r.referredPhone || '未知',
                bonus: r.bonus || 10,
                time: formatDateTime(r.createdAt)
              }
            })
            that.setData({ referrals: referrals })
          }
        })
    } catch (e) {}
  },

  goBack: function() {
    wx.navigateBack()
  }
})