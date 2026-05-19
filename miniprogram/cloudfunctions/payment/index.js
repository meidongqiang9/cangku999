// 云函数 - 微信支付
const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

// 将对象转为 XML 字符串
function objToXml(obj) {
  var xml = '<xml>\n'
  Object.keys(obj).forEach(function(key) {
    if (obj[key] != null && obj[key] !== '') {
      xml += '  <' + key + '>' + obj[key] + '</' + key + '>\n'
    }
  })
  xml += '</xml>'
  return xml
}

// 解析 XML 为对象
function xmlToObj(xml) {
  var obj = {}
  var regex = /<(\w+)><!\[CDATA\[(.*?)\]\]><\/\1>|<(\w+)>(.*?)<\/\3>/g
  var match
  while ((match = regex.exec(xml)) !== null) {
    var key = match[1] || match[3]
    var val = match[2] || match[4]
    obj[key] = val
  }
  return obj
}

// 生成随机字符串
function nonceStr(len) {
  len = len || 32
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  var str = ''
  for (var i = 0; i < len; i++) {
    str += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return str
}

// 生成微信支付签名 (MD5)
function sign(params, mchKey) {
  var keys = Object.keys(params).sort()
  var str = ''
  keys.forEach(function(key) {
    if (params[key] != null && params[key] !== '' && key !== 'sign') {
      str += key + '=' + params[key] + '&'
    }
  })
  str += 'key=' + mchKey
  return crypto.createHash('md5').update(str, 'utf8').digest('hex').toUpperCase()
}

// 发起 HTTPS 请求
function httpsRequest(url, data) {
  return new Promise(function(resolve, reject) {
    var https = require('https')
    var urlModule = require('url')
    var parsedUrl = urlModule.parse(url)

    var options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml',
        'Content-Length': Buffer.byteLength(data)
      }
    }

    var req = https.request(options, function(res) {
      var body = ''
      res.on('data', function(chunk) { body += chunk })
      res.on('end', function() { resolve(body) })
    })

    req.on('error', function(err) { reject(err) })
    req.write(data)
    req.end()
  })
}

// 获取店铺支付配置
async function getShopConfig(shopId) {
  try {
    var res = await db.collection('shops').doc(shopId).get()
    if (res.data) return res.data
  } catch (e) {}
  return null
}

exports.main = async (event, context) => {
  const { action, orderData, shopId } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    const tradeNo = 'ET' + Date.now() + Math.random().toString(36).substr(2, 6).toUpperCase()

    // 保存订单到数据库
    await db.collection('orders').add({
      data: {
        tradeNo: tradeNo,
        tableNo: orderData.tableNo,
        guestCount: orderData.guestCount,
        items: orderData.items,
        totalPrice: orderData.totalPrice,
        openid: openid,
        status: 'pending',
        shopId: shopId || '',
        createdAt: Date.now()
      }
    })

    // 尝试获取店铺支付配置
    var shopConfig = null
    if (shopId) {
      shopConfig = await getShopConfig(shopId)
    }

    // 判断是否配置了真实商户号
    var mchId = (shopConfig && shopConfig.mchId) || ''
    var mchKey = (shopConfig && shopConfig.mchKey) || ''

    if (mchId && mchKey && orderData.totalPrice > 0) {
      // === 真实微信支付流程 ===
      var totalFee = Math.round(parseFloat(orderData.totalPrice) * 100) // 金额：分

      var unifiedOrderParams = {
        appid: wxContext.APPID,
        mch_id: mchId,
        nonce_str: nonceStr(),
        body: (shopConfig && shopConfig.shopName || '食易特') + '-点餐',
        out_trade_no: tradeNo,
        total_fee: totalFee,
        spbill_create_ip: context.ENV === 'local' ? '127.0.0.1' : '0.0.0.0',
        notify_url: 'https://your-domain.com/payment/notify',
        trade_type: 'JSAPI',
        openid: openid
      }

      unifiedOrderParams.sign = sign(unifiedOrderParams, mchKey)

      var xmlData = objToXml(unifiedOrderParams)

      var responseXml = await httpsRequest('https://api.mch.weixin.qq.com/pay/unifiedorder', xmlData)
      var responseObj = xmlToObj(responseXml)

      if (responseObj.return_code === 'SUCCESS' && responseObj.result_code === 'SUCCESS') {
        var prepayId = responseObj.prepay_id

        // 生成小程序调起支付参数
        var payParams = {
          tradeNo: tradeNo,
          appId: wxContext.APPID,
          timeStamp: String(Math.floor(Date.now() / 1000)),
          nonceStr: nonceStr(),
          package: 'prepay_id=' + prepayId,
          signType: 'MD5'
        }

        payParams.paySign = sign(payParams, mchKey)

        return { code: 0, data: payParams }
      } else {
        // 真实支付失败，降级为模拟
        console.error('WeChat Pay error:', responseXml)
        return mockPayment(tradeNo)
      }
    } else {
      // === 模拟支付 ===
      return mockPayment(tradeNo)
    }
  } catch (err) {
    console.error('Payment error:', err)
    // 异常时返回模拟支付
    return mockPayment(event.tradeNo || '')
  }
}

function mockPayment(tradeNo) {
  var mockTradeNo = tradeNo || 'ET' + Date.now()
  var payParams = {
    tradeNo: mockTradeNo,
    timeStamp: String(Math.floor(Date.now() / 1000)),
    nonceStr: Math.random().toString(36).substring(2, 18),
    package: 'prepay_id=mock_' + Date.now(),
    signType: 'MD5',
    paySign: 'MOCK_SIGN_' + crypto.randomBytes(8).toString('hex')
  }
  return { code: 0, data: payParams, mock: true }
}
