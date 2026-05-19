// 角色认证与权限校验
const { getDb } = require('./cloud')

const TOKEN_KEY = 'user_token'
const USER_KEY = 'user_info'

function getToken() {
  return wx.getStorageSync(TOKEN_KEY) || ''
}

function setToken(token) {
  return wx.setStorageSync(TOKEN_KEY, token)
}

function clearToken() {
  return wx.removeStorageSync(TOKEN_KEY)
}

function getUser() {
  return wx.getStorageSync(USER_KEY) || null
}

function setUser(user) {
  return wx.setStorageSync(USER_KEY, user)
}

function clearUser() {
  return wx.removeStorageSync(USER_KEY)
}

function isLoggedIn() {
  return !!getToken()
}

function getRole() {
  var user = getUser()
  return user ? user.role : 'consumer'
}

function checkRole(requiredRole) {
  var user = getUser()
  if (!user || user.role !== requiredRole) {
    wx.showModal({
      title: '无权限',
      content: '您没有访问此功能的权限',
      showCancel: false,
      success: function() {
        wx.redirectTo({ url: '/pages/index/index' })
      }
    })
    return false
  }
  return true
}

// 微信一键登录
function wechatLogin() {
  return new Promise(function(resolve, reject) {
    wx.getUserProfile({
      desc: '用于完善用户资料',
      success: function(profileRes) {
        var userInfo = profileRes.userInfo
        wx.login({
          success: function(loginRes) {
            if (loginRes.code) {
              var db = getDb()
              var openid = ''
              // 实际应通过云函数换取 openid
              wx.cloud.callFunction({
                name: 'login',
                data: { code: loginRes.code },
                success: function(cfRes) {
                  openid = cfRes.result.openid
                  // 查找或创建用户
                  db.collection('users').where({ openid: openid }).get({
                    success: function(queryRes) {
                      var user
                      if (queryRes.data.length > 0) {
                        user = queryRes.data[0]
                        db.collection('users').doc(user._id).update({
                          data: {
                            nickname: userInfo.nickName,
                            avatarUrl: userInfo.avatarUrl,
                            updatedAt: Date.now()
                          }
                        })
                        user.nickname = userInfo.nickName
                        user.avatarUrl = userInfo.avatarUrl
                      } else {
                        user = {
                          openid: openid,
                          role: 'consumer',
                          nickname: userInfo.nickName,
                          avatarUrl: userInfo.avatarUrl,
                          createdAt: Date.now()
                        }
                      }
                      setUser(user)
                      resolve(user)
                    },
                    fail: reject
                  })
                },
                fail: reject
              })
            } else {
              reject(new Error('wx.login 失败'))
            }
          },
          fail: reject
        })
      },
      fail: function(err) {
        // 用户拒绝授权，使用匿名模式
        reject(err)
      }
    })
  })
}

function logout() {
  clearToken()
  clearUser()
}

module.exports = { getToken, setToken, clearToken, getUser, setUser, clearUser, isLoggedIn, getRole, checkRole, wechatLogin, logout }
