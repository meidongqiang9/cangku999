const { getDb } = require('../../utils/cloud')

// 生成6位推荐码（排除易混淆字符 0/O/1/I/L）
function generateReferralCode() {
  var chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  var code = ''
  for (var i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

// 处理推荐关系：记录推荐人 + 增加推荐计数
function processReferral(db, referrerCode, newShopId, newPhone, callback) {
  if (!referrerCode) { callback(); return }
  referrerCode = referrerCode.toUpperCase().trim()
  db.collection('shops').where({ referralCode: referrerCode }).get({
    success: function(res) {
      if (res.data && res.data.length > 0) {
        var referrer = res.data[0]
        // 记录推荐关系
        db.collection('referrals').add({
          data: {
            referrerShopId: referrer._id,
            referredShopId: newShopId,
            referredPhone: newPhone || '',
            createdAt: Date.now()
          }
        })
        // 增加推荐人的推荐计数 + 元宝返利
        var newCount = (referrer.referralCount || 0) + 1
        var newYuanbao = (referrer.yuanbao || 0) + 10
        db.collection('shops').doc(referrer._id).update({
          data: { referralCount: newCount, yuanbao: newYuanbao }
        })
        // 记录元宝交易
        try {
          db.collection('yuanbao_transactions').add({
            data: {
              shopId: referrer._id,
              amount: 10,
              type: 'referral_bonus',
              description: '推荐奖励：新店铺注册',
              balance: newYuanbao,
              relatedShopId: newShopId,
              createdAt: Date.now()
            }
          })
        } catch (e) {}
      }
      callback()
    },
    fail: function() { callback() }
  })
}

// 清除所有店铺缓存（切换账号时调用）
function clearShopCache() {
  var keys = [
    'ownerUser', 'currentShopId', 'shopConfig', 'shopBanners',
    'homeTitle', 'shopName', 'menuCategories', 'menuDishes',
    'tables', 'allOrders', 'currentTable', 'currentSession',
    'currentTableDetail', 'currentChef', 'needRefreshOrder'
  ]
  keys.forEach(function(k) { wx.removeStorageSync(k) })
  // 清除带 shopId 后缀的缓存
  try {
    var info = wx.getStorageInfoSync()
    info.keys.forEach(function(k) {
      if (k.indexOf('chefs_') === 0 || k.indexOf('tables_') === 0 || k.indexOf('menuCategories_') === 0 || k.indexOf('menuDishes_') === 0) {
        wx.removeStorageSync(k)
      }
    })
  } catch (e) {}
}

Page({
  data: {
    isLogin: true,
    phone: '',
    password: '',
    showPassword: false,
    shopName: '',
    realName: '',
    referralCode: '',
    submitting: false,
    hasAgreed: false,
    showWechatAgreeModal: false,
    wechatAgreed: false
  },

  onLoad: function() {
    var user = wx.getStorageSync('ownerUser')
    if (user) {
      wx.redirectTo({ url: '/pages/owner/home' })
    }
  },

  // —— 协议与隐私政策 ——
  toggleAgree: function() {
    this.setData({ hasAgreed: !this.data.hasAgreed })
  },

  showAgreement: function() {
    wx.navigateTo({ url: '/pages/agreement/agreement/agreement?type=service' })
  },

  showPrivacy: function() {
    wx.navigateTo({ url: '/pages/agreement/agreement/agreement?type=privacy' })
  },

  onPhoneInput: function(e) {
    this.setData({ phone: e.detail.value })
  },

  onPasswordInput: function(e) {
    this.setData({ password: e.detail.value })
  },

  onShopNameInput: function(e) {
    this.setData({ shopName: e.detail.value })
  },

  onRealNameInput: function(e) {
    this.setData({ realName: e.detail.value })
  },

  onReferralCodeInput: function(e) {
    this.setData({ referralCode: (e.detail.value || '').toUpperCase() })
  },

  togglePassword: function() {
    this.setData({ showPassword: !this.data.showPassword })
  },

  toggleMode: function() {
    this.setData({
      isLogin: !this.data.isLogin,
      phone: '',
      password: '',
      shopName: '',
      realName: '',
      referralCode: ''
    })
  },

  submit: function() {
    if (this.data.submitting) return

    var phone = this.data.phone.trim()
    var password = this.data.password.trim()

    if (!phone) {
      wx.showToast({ title: '请输入手机号', icon: 'none' })
      return
    }
    if (!/^1\d{10}$/.test(phone)) {
      wx.showToast({ title: '手机号格式不正确', icon: 'none' })
      return
    }
    if (!password) {
      wx.showToast({ title: '请输入密码', icon: 'none' })
      return
    }
    if (password.length < 6) {
      wx.showToast({ title: '密码至少6位', icon: 'none' })
      return
    }

    this.setData({ submitting: true })

    if (this.data.isLogin) {
      this.doLogin(phone, password)
    } else {
      this.doRegister(phone, password)
    }
  },

  doLogin: function(phone, password) {
    var that = this
    clearShopCache()
    var users = wx.getStorageSync('ownerUsers') || []

    var found = users.find(function(u) {
      return u.phone === phone && u.password === password
    })

    // 管理账号
    if (!found && phone === '13889195545' && password === 'M@dq616699') {
      found = {
        id: 'admin_' + Date.now(),
        phone: '13889195545',
        shopName: '食易特餐厅',
        role: 'admin',
        canUse: true
      }
    }

    // 本地找不到时，从云端 shops 验证（密码在注册时写入 shops）
    if (!found) {
      try {
        var db = getDb()
        db.collection('shops').where({ phone: phone }).get({
          success: function(res) {
            if (res.data && res.data.length > 0 && res.data[0].password === password) {
              var s = res.data[0]
              that.restoreLoginFromCloud({
                _id: s._id, phone: phone, shopName: s.shopName || '',
                shopId: s._id, referralCode: s.referralCode || '', createdAt: s.createdAt
              }, phone, password)
              return
            }
            that.setData({ submitting: false })
            wx.showToast({ title: '账号或密码错误', icon: 'none' })
          },
          fail: function() {
            that.setData({ submitting: false })
            wx.showToast({ title: '账号或密码错误', icon: 'none' })
          }
        })
      } catch (e) {
        that.setData({ submitting: false })
        wx.showToast({ title: '账号或密码错误', icon: 'none' })
      }
      return
    }

    that.doLoginComplete(found)
  },

  doLoginComplete: function(found) {
    var that = this
    found.loginAt = Date.now()

    if (found.role === 'admin') {
      wx.setStorageSync('ownerUser', found)
      that.setData({ submitting: false })
      wx.showToast({ title: '管理员登录成功', icon: 'success' })
      setTimeout(function() {
        wx.redirectTo({ url: '/pages/owner/admin/admin' })
      }, 600)
      return
    }

    var shopId = found.shopId || ''
    if (!shopId) {
      this.ensureShopId(found, function(updatedUser) {
        wx.setStorageSync('ownerUser', updatedUser)
        wx.setStorageSync('currentShopId', updatedUser.shopId || '')
        if (found.phone === '13889195545') {
          var users = wx.getStorageSync('ownerUsers') || []
          var idx = users.findIndex(function(u) { return u.phone === '13889195545' && u.shopName === '食易特餐厅' })
          if (idx >= 0) { users[idx] = updatedUser }
          else { users.push(updatedUser) }
          wx.setStorageSync('ownerUsers', users)
        }
        that.finishLogin()
      })
    } else {
      wx.setStorageSync('ownerUser', found)
      wx.setStorageSync('currentShopId', shopId)
      this.finishLogin()
    }
  },

  restoreLoginFromCloud: function(cloudUser, phone, password) {
    var restored = {
      id: cloudUser._id || ('owner_' + Date.now()),
      phone: phone,
      password: password,
      shopName: cloudUser.shopName || '',
      role: 'owner',
      canUse: true,
      shopId: cloudUser.shopId || '',
      referralCode: cloudUser.referralCode || '',
      createdAt: cloudUser.createdAt || Date.now(),
      loginAt: Date.now()
    }
    var localUsers = wx.getStorageSync('ownerUsers') || []
    var idx = localUsers.findIndex(function(u) { return u.phone === phone })
    if (idx >= 0) { localUsers[idx] = restored }
    else { localUsers.push(restored) }
    wx.setStorageSync('ownerUsers', localUsers)
    this.doLoginComplete(restored)
  },

  tryShopsLogin: function(db, phone, password) {
    var that = this
    db.collection('shops').where({ phone: phone }).get({
      success: function(res) {
        if (res.data && res.data.length > 0 && res.data[0].password === password) {
          var s = res.data[0]
          that.restoreLoginFromCloud({
            _id: s._id, phone: phone, shopName: s.shopName || '',
            shopId: s._id, referralCode: s.referralCode || '', createdAt: s.createdAt
          }, phone, password)
          return
        }
        that.setData({ submitting: false })
        wx.showToast({ title: '账号或密码错误', icon: 'none' })
      },
      fail: function() {
        that.setData({ submitting: false })
        wx.showToast({ title: '账号或密码错误', icon: 'none' })
      }
    })
  },

  // 兼容旧账号：无 shopId 时自动创建或找回 shop 文档
  ensureShopId: function(user, callback) {
    var shopName = user.shopName || '我的店铺'
    var phone = user.phone || ''

    try {
      var db = getDb()
      // 按手机号+店铺名精确匹配，防止跨租户数据泄露
      db.collection('users').where({ phone: phone, shopName: shopName, role: 'owner' }).get({
        success: function(res) {
          if (res.data && res.data.length > 0 && res.data[0].shopId) {
            user.shopId = res.data[0].shopId
            callback(user)
          } else {
            // 无精确匹配则创建新店铺，绝不复用他人店铺
            createNewShop(db, user, callback)
          }
        },
        fail: function() { callback(user) }
      })
    } catch (e) { callback(user) }

    function createNewShop(db, user, callback) {
      var shopName = user.shopName || '我的店铺'
      var phone = user.phone || ''
      db.collection('shops').add({
        data: { shopName: shopName, phone: phone, createdAt: Date.now() },
        success: function(addRes) {
          user.shopId = addRes._id
          db.collection('users').add({
            data: { phone: phone, shopName: shopName, role: 'owner', shopId: addRes._id, createdAt: Date.now() }
          })
          callback(user)
        },
        fail: function() { callback(user) }
      })
    }
  },

  finishLogin: function() {
    this.setData({ submitting: false })

    wx.cloud.callFunction({
      name: 'login',
      success: function() {},
      fail: function() {}
    })

    wx.showToast({ title: '登录成功', icon: 'success' })
    setTimeout(function() {
      wx.redirectTo({ url: '/pages/owner/home' })
    }, 600)
  },

  doRegister: function(phone, password) {
    var that = this
    clearShopCache()
    var shopName = that.data.shopName.trim()

    if (!shopName) {
      wx.showToast({ title: '请输入店铺名称', icon: 'none' })
      that.setData({ submitting: false })
      return
    }

    var users = wx.getStorageSync('ownerUsers') || []

    if (users.some(function(u) { return u.phone === phone })) {
      wx.showToast({ title: '该手机号已注册', icon: 'none' })
      that.setData({ submitting: false })
      return
    }

    // 先创建 shop 文档获取 shopId
    that.setData({ submitting: true })
    var shopId = ''
    var userId = 'owner_' + Date.now()

    var doCreateUser = function(shopId, refCode) {
      var newUser = {
        id: userId,
        phone: phone,
        password: password,
        shopName: shopName,
        realName: that.data.realName.trim(),
        role: 'owner',
        canUse: true,
        shopId: shopId,
        referralCode: refCode,
        createdAt: Date.now()
      }

      users.push(newUser)
      wx.setStorageSync('ownerUsers', users)
      wx.setStorageSync('ownerUser', newUser)
      wx.setStorageSync('currentShopId', shopId)

      // 同步用户到云端（含密码，本地丢失时云端可验证）
      try {
        var db = getDb()
        var saveOk = false
        db.collection('users').add({
          data: {
            phone: phone,
            password: password,
            shopName: shopName,
            role: 'owner',
            shopId: shopId,
            referralCode: refCode,
            createdAt: Date.now()
          },
          success: function() { saveOk = true },
          fail: function(err) { wx.showToast({ title: '云端同步失败: ' + (err.errMsg || '未知'), icon: 'none', duration: 3000 }) }
        })
        if (shopId) {
          db.collection('shops').doc(shopId).update({
            data: { phone: phone, password: password },
            fail: function(err) { wx.showToast({ title: 'shops同步失败', icon: 'none' }) }
          })
        }
      } catch (e) {
        wx.showToast({ title: '云端未初始化', icon: 'none' })
      }

      // 处理推荐关系
      var inputRefCode = that.data.referralCode.trim()
      if (inputRefCode) {
        try {
          processReferral(getDb(), inputRefCode, shopId, phone, function() {})
        } catch (e) {}
      }

      that.setData({ submitting: false })
      wx.showToast({ title: '注册成功', icon: 'success' })
      setTimeout(function() {
        wx.redirectTo({ url: '/pages/owner/home' })
      }, 600)
    }

    // 尝试在云数据库创建 shop 文档
    try {
      var refCode = generateReferralCode()
      var db = getDb()
      var inputRefCode = that.data.referralCode.trim()
      db.collection('shops').add({
        data: {
          shopName: shopName,
          phone: phone,
          password: password,
          referralCode: refCode,
          referralCodeUsed: inputRefCode || '',
          referredBy: '',
          referralCount: 0,
          yuanbao: 30,
          frozen: false,
          lastDeductionDate: '',
          createdAt: Date.now()
        },
        success: function(res) {
          shopId = res._id
          // 记录初始元宝
          try {
            db.collection('yuanbao_transactions').add({
              data: {
                shopId: shopId,
                amount: 30,
                type: 'initial',
                description: '新店注册赠送元宝',
                balance: 30,
                createdAt: Date.now()
              }
            })
          } catch (e) {}
          doCreateUser(shopId, refCode)
        },
        fail: function() {
          doCreateUser(shopId, refCode)
        }
      })
    } catch (e) {
      doCreateUser(shopId, refCode)
    }
  },

  // —— 微信登录协议弹窗 ——
  onWechatLogin: function() {
    this.setData({ showWechatAgreeModal: true, wechatAgreed: false })
  },

  toggleWechatAgree: function() {
    this.setData({ wechatAgreed: !this.data.wechatAgreed })
  },

  closeWechatAgreeModal: function() {
    this.setData({ showWechatAgreeModal: false, wechatAgreed: false })
  },

  confirmWechatLogin: function() {
    if (!this.data.wechatAgreed) {
      wx.showToast({ title: '请先阅读并同意协议', icon: 'none' })
      return
    }
    this.setData({ showWechatAgreeModal: false, wechatAgreed: false })
    // 同时同步表单中的 hasAgreed
    this.setData({ hasAgreed: true })
    this.doWechatLogin()
  },

  doWechatLogin: function() {
    var that = this
    clearShopCache()
    wx.getUserProfile({
      desc: '用于完善用户资料',
      success: function(profileRes) {
        var userInfo = profileRes.userInfo
        wx.login({
          success: function(loginRes) {
            if (loginRes.code) {
              wx.cloud.callFunction({
                name: 'login',
                data: { code: loginRes.code },
                success: function(cfRes) {
                  var result = cfRes.result || {}
                  var openid = result.openid || ('wx_' + Date.now())
                  that.finishWechatLogin(openid, userInfo)
                },
                fail: function() {
                  // 云函数不可用时降级：用时间戳生成临时 openid
                  that.finishWechatLogin('wx_' + Date.now(), userInfo)
                }
              })
            } else {
              wx.showToast({ title: '微信登录失败，请重试', icon: 'none' })
            }
          },
          fail: function() {
            wx.showToast({ title: '微信登录失败', icon: 'none' })
          }
        })
      },
      fail: function() {
        wx.showToast({ title: '已取消授权', icon: 'none' })
      }
    })
  },

  finishWechatLogin: function(openid, userInfo) {
    var that = this
    var db
    try { db = getDb() } catch (e) {}

    // 先查询该微信用户是否已注册
    if (db) {
      db.collection('users').where({ openid: openid, role: 'owner' }).get({
        success: function(res) {
          if (res.data && res.data.length > 0) {
            // 老用户回归：复用 shopId + 推荐码，仅更新头像昵称
            var existing = res.data[0]
            var user = {
              id: existing._id || ('wx_' + openid.substring(0, 12)),
              openid: openid,
              phone: existing.phone || '',
              shopName: existing.shopName || (userInfo.nickName + '的店铺'),
              avatarUrl: userInfo.avatarUrl,
              nickname: userInfo.nickName,
              role: 'owner',
              canUse: true,
              shopId: existing.shopId || '',
              referralCode: existing.referralCode || '',
              loginAt: Date.now()
            }
            // 更新头像昵称
            db.collection('users').doc(existing._id).update({
              data: {
                nickname: userInfo.nickName,
                avatarUrl: userInfo.avatarUrl,
                updatedAt: Date.now()
              }
            })
            that.saveWechatUser(user)
          } else {
            // 新用户：创建店铺和推荐码
            that.createNewWechatUser(openid, userInfo, db)
          }
        },
        fail: function() {
          that.createNewWechatUser(openid, userInfo, db)
        }
      })
    } else {
      that.createNewWechatUser(openid, userInfo, null)
    }
  },

  createNewWechatUser: function(openid, userInfo, db) {
    var that = this
    var shopName = userInfo.nickName + '的店铺'
    var refCode = generateReferralCode()

    var user = {
      id: 'wx_' + openid.substring(0, 12),
      openid: openid,
      phone: '',
      shopName: shopName,
      avatarUrl: userInfo.avatarUrl,
      nickname: userInfo.nickName,
      role: 'owner',
      canUse: true,
      referralCode: refCode,
      loginAt: Date.now()
    }

    if (db) {
      var inputRefCode = that.data.referralCode.trim()
      db.collection('shops').add({
        data: {
          shopName: shopName,
          phone: '',
          referralCode: refCode,
          referralCodeUsed: inputRefCode || '',
          referredBy: '',
          referralCount: 0,
          yuanbao: 30,
          frozen: false,
          lastDeductionDate: '',
          createdAt: Date.now()
        },
        success: function(addRes) {
          user.shopId = addRes._id
          // 记录初始元宝
          try {
            db.collection('yuanbao_transactions').add({
              data: {
                shopId: addRes._id,
                amount: 30,
                type: 'initial',
                description: '新店注册赠送元宝',
                balance: 30,
                createdAt: Date.now()
              }
            })
          } catch (e) {}
          if (inputRefCode) {
            processReferral(db, inputRefCode, addRes._id, '', function() {})
          }
          that.saveWechatUser(user)
        },
        fail: function() {
          that.saveWechatUser(user)
        }
      })
    } else {
      that.saveWechatUser(user)
    }
  },

  saveWechatUser: function(user) {
    wx.setStorageSync('ownerUser', user)
    wx.setStorageSync('currentShopId', user.shopId || '')

    // 同步到云端：有 openid 且已有 _id 则更新，否则新增
    // 注意：新增逻辑仅作为兜底，正常流程已在 createNewWechatUser 中执行
    try {
      var db = getDb()
      var openid = user.openid || ''
      if (openid) {
        db.collection('users').where({ openid: openid, role: 'owner' }).get({
          success: function(res) {
            if (res.data && res.data.length > 0) {
              // 已有记录，更新
              db.collection('users').doc(res.data[0]._id).update({
                data: {
                  nickname: user.nickname,
                  avatarUrl: user.avatarUrl,
                  shopName: user.shopName,
                  shopId: user.shopId || '',
                  updatedAt: Date.now()
                }
              })
            } else {
              // 新记录
              db.collection('users').add({
                data: {
                  openid: openid,
                  phone: user.phone || '',
                  shopName: user.shopName,
                  role: 'owner',
                  shopId: user.shopId || '',
                  referralCode: user.referralCode || '',
                  nickname: user.nickname,
                  avatarUrl: user.avatarUrl,
                  createdAt: Date.now()
                }
              })
            }
          },
          fail: function() {
            // 查询失败时尝试新增
            db.collection('users').add({
              data: {
                openid: openid,
                phone: user.phone || '',
                shopName: user.shopName,
                role: 'owner',
                shopId: user.shopId || '',
                referralCode: user.referralCode || '',
                nickname: user.nickname,
                avatarUrl: user.avatarUrl,
                createdAt: Date.now()
              }
            })
          }
        })
      }
    } catch (e) {}

    wx.showToast({ title: '登录成功', icon: 'success' })
    setTimeout(function() {
      wx.redirectTo({ url: '/pages/owner/home' })
    }, 600)
  }
})
