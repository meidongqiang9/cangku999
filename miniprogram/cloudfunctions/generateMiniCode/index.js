// 生成微信小程序码 / URL Link
// 优先 urllink.generate（可嵌入本地 QR 保留品牌），降级 wxacode
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const { path, queryString, scene } = event

  if (!path) return { code: -1, msg: '缺少页面路径' }

  // 优先：生成 URL Link（可嵌入本地 QR 码，保留品牌）
  try {
    const urlLinkRes = await cloud.openapi.urllink.generate({
      path: path,
      query: queryString || '',
      expireType: 0  // 永久有效
    })
    if (urlLinkRes.errcode === 0 && urlLinkRes.url_link) {
      return { code: 0, type: 'link', url: urlLinkRes.url_link }
    }
    console.log('urllink failed:', JSON.stringify(urlLinkRes))
  } catch (e) {
    console.log('urllink error:', e.errMsg || e.message)
  }

  // 降级：生成小程序码图片（wxacode）
  var buffer = null

  if (scene && scene.length <= 32) {
    try {
      const res = await cloud.openapi.wxacode.getUnlimited({
        page: path,
        scene: scene,
        width: 430,
        checkPath: false
      })
      if (res.errCode === 0 && res.buffer) {
        buffer = res.buffer
      }
    } catch (e) {
      console.log('getUnlimited failed:', e.errMsg || e.message)
    }
  }

  if (!buffer && queryString) {
    try {
      const res = await cloud.openapi.wxacode.get({
        path: path + '?' + queryString,
        width: 430
      })
      if (res.errCode === 0 && res.buffer) {
        buffer = res.buffer
      }
    } catch (e) {
      console.log('get failed:', e.errMsg || e.message)
    }
  }

  if (buffer) {
    const cloudPath = 'minicodes/' + Date.now() + '.png'
    const uploadRes = await cloud.uploadFile({
      cloudPath: cloudPath,
      fileContent: buffer
    })
    return { code: 0, type: 'image', fileID: uploadRes.fileID }
  }

  return {
    code: -1,
    msg: '生成失败（需提交审核后可用），请使用本地方案',
    fallback: true
  }
}
