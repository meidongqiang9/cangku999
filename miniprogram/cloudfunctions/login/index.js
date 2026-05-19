// 云函数 - 登录（获取 openid）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { code } = event

  try {
    // 查找现有用户
    var userRes = await db.collection('users').where({ openid: openid }).get()
    var user

    if (userRes.data.length > 0) {
      // 已存在，更新时间
      user = userRes.data[0]
      await db.collection('users').doc(user._id).update({
        data: { updatedAt: Date.now() }
      })
      user.updatedAt = Date.now()
    } else {
      // 新用户，创建记录
      var newUser = {
        openid: openid,
        role: 'consumer',
        nickname: '',
        avatarUrl: '',
        createdAt: Date.now()
      }
      var addRes = await db.collection('users').add({ data: newUser })
      user = newUser
      user._id = addRes._id
    }

    return {
      code: 0,
      openid: openid,
      user: user
    }
  } catch (err) {
    // 数据库操作失败时至少返回 openid
    return {
      code: 0,
      openid: openid,
      msg: 'openid returned, user lookup failed: ' + err.message
    }
  }
}
