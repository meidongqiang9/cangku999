const express = require('express')
const axios = require('axios')
const crypto = require('crypto')
const xml2js = require('xml2js')
const cors = require('cors')

const app = express()
app.use(cors())
app.use(express.json())

// 模拟数据库
const shops = {}
const orders = {}

// 微信支付类
class WechatPay {
  constructor(shopConfig) {
    this.mchId = shopConfig.mchId
    this.mchKey = shopConfig.mchKey
    this.appId = shopConfig.subAppId || shopConfig.appId
  }

  generateNonceStr() {
    return crypto.randomBytes(16).toString('hex')
  }

  generateSign(params) {
    const key = this.mchKey
    const sorted = Object.keys(params).sort()
    const arr = sorted.map(k => k + '=' + params[k])
    const str = arr.join('&') + '&key=' + key
    return crypto.createHash('md5').update(str).digest('hex').toUpperCase()
  }

  async createUnifiedOrder(orderInfo) {
    const url = 'https://api.mch.weixin.qq.com/pay/unifiedorder'
    const nonceStr = this.generateNonceStr()
    const timeStamp = String(Math.floor(Date.now() / 1000))
    
    const params = {
      appid: this.appId,
      mch_id: this.mchId,
      nonce_str: nonceStr,
      body: orderInfo.body,
      out_trade_no: orderInfo.tradeNo,
      total_fee: orderInfo.totalFee,
      spbill_create_ip: orderInfo.spbillCreateIp || '127.0.0.1',
      notify_url: orderInfo.notifyUrl,
      trade_type: 'JSAPI',
      openid: orderInfo.openid
    }
    
    params.sign = this.generateSign(params)
    
    const builder = new xml2js.Builder({ rootName: 'xml', headless: true })
    const xml = builder.buildObject(params)
    
    try {
      const res = await axios.post(url, xml, {
        headers: { 'Content-Type': 'text/xml' }
      })
      const parser = new xml2js.Parser()
      const result = await parser.parseStringPromise(res.data)
      
      if (result.xml && result.xml.return_code[0] === 'SUCCESS') {
        return { success: true, prepay_id: result.xml.prepay_id[0] }
      }
      return { success: false, errMsg: result.xml?.return_msg?.[0] || '下单失败' }
    } catch (err) {
      return { success: false, errMsg: err.message }
    }
  }

  getJsApiParams(prepayId) {
    const nonceStr = this.generateNonceStr()
    const timeStamp = String(Math.floor(Date.now() / 1000))
    
    const params = {
      appId: this.appId,
      nonceStr: nonceStr,
      package: 'prepay_id=' + prepayId,
      signType: 'MD5',
      timeStamp: timeStamp
    }
    params.paySign = this.generateSign(params)
    
    return { ...params, timeStamp }
  }
}

// 生成商户订单号
function genTradeNo() {
  return 'T' + Date.now() + Math.random().toString(36).substr(2, 6).toUpperCase()
}

// 注册店铺
app.post('/api/shop/register', (req, res) => {
  const { shopId, shopName, mchId, mchKey, subAppId, bankName, bankAccount, bankNameFull } = req.body
  
  if (!shopId || !mchId || !mchKey) {
    return res.json({ code: -1, msg: '缺少必要参数' })
  }
  
  shops[shopId] = {
    shopId, shopName, mchId, mchKey, subAppId,
    bankName, bankAccount, bankNameFull,
    createdAt: Date.now()
  }
  
  res.json({ code: 0, msg: '注册成功', shopId })
})

// 获取店铺信息
app.get('/api/shop/:shopId', (req, res) => {
  const shop = shops[req.params.shopId]
  if (!shop) {
    return res.json({ code: -1, msg: '店铺不存在' })
  }
  res.json({ code: 0, data: { shopId, shopName: shop.shopName } })
})

// 创建订单
app.post('/api/order/create', async (req, res) => {
  const { shopId, tableNo, guestCount, items, totalPrice, openid } = req.body
  
  const shop = shops[shopId]
  if (!shop) {
    return res.json({ code: -1, msg: '店铺不存在' })
  }
  
  const tradeNo = genTradeNo()
  const order = {
    shopId, tradeNo, tableNo, guestCount, items, totalPrice,
    openid, status: 'pending', createdAt: Date.now()
  }
  
  orders[tradeNo] = order
  
  res.json({ code: 0, data: { tradeNo, totalPrice } })
})

// 发起支付
app.post('/api/payment/prepare', async (req, res) => {
  const { shopId, tradeNo, openid, notifyUrl } = req.body
  
  const shop = shops[shopId]
  if (!shop) {
    return res.json({ code: -1, msg: '店铺不存在' })
  }
  
  const order = orders[tradeNo]
  if (!order) {
    return res.json({ code: -1, msg: '订单不存在' })
  }
  
  const pay = new WechatPay(shop)
  const result = await pay.createUnifiedOrder({
    body: '餐饮订单-' + order.tableNo + '桌',
    tradeNo: tradeNo,
    totalFee: Math.round(order.totalPrice * 100),
    openid: openid,
    notifyUrl: notifyUrl
  })
  
  if (result.success) {
    const jsApiParams = pay.getJsApiParams(result.prepay_id)
    res.json({ code: 0, data: jsApiParams })
  } else {
    res.json({ code: -1, msg: result.errMsg })
  }
})

// 支付回调
app.post('/api/payment/notify', async (req, res) => {
  const builder = new xml2js.Builder()
  const xml = builder.buildObject({ return_code: 'SUCCESS' })
  res.send(xml)
})

// 查询订单
app.get('/api/order/:tradeNo', (req, res) => {
  const order = orders[req.params.tradeNo]
  if (!order) {
    return res.json({ code: -1, msg: '订单不存在' })
  }
  res.json({ code: 0, data: order })
})

// 更新订单状态
app.post('/api/order/update', (req, res) => {
  const { tradeNo, status } = req.body
  if (orders[tradeNo]) {
    orders[tradeNo].status = status
  }
  res.json({ code: 0 })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log('服务器运行在 http://localhost:' + PORT)
})