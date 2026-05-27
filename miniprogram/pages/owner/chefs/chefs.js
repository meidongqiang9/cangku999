const { getDb } = require('../../../utils/cloud')
const { generateQRImage } = require('../../../utils/qrcode')

Page({
  data: {
    chefs: [],
    showInputModal: false,
    inputName: '',
    inputPosition: '',
    showQRPopup: false,
    qrImage: '',
    qrChefName: '',
    qrChefId: ''
  },

  onLoad: function() {
    this.loadChefs()
  },

  onShow: function() {
    this.loadChefs()
  },

  loadChefs: function() {
    var that = this
    var shopId = wx.getStorageSync('currentShopId') || ''
    try {
      var db = getDb()
      db.collection('chefs')
        .where({ shopId: shopId })
        .orderBy('createdAt', 'asc')
        .get({
          success: function(res) {
            var chefs = (res.data || []).map(function(c) {
              return {
                id: c._id,
                name: c.name,
                position: c.position || '',
                qrcode: c.qrcode || ''
              }
            })
            if (chefs.length === 0) {
              chefs = wx.getStorageSync('chefs_' + shopId) || []
            } else {
              wx.setStorageSync('chefs_' + shopId, chefs)
            }
            that.setData({ chefs: chefs })
          },
          fail: function() {
            var chefs = wx.getStorageSync('chefs_' + shopId) || []
            that.setData({ chefs: chefs })
          }
        })
    } catch (e) {
      var chefs = wx.getStorageSync('chefs_' + shopId) || []
      that.setData({ chefs: chefs })
    }
  },

  // ====== 添加厨师 ======
  addChef: function() {
    this.setData({
      showInputModal: true,
      inputName: '',
      inputPosition: ''
    })
  },

  onNameInput: function(e) {
    this.setData({ inputName: e.detail.value })
  },

  onPositionInput: function(e) {
    this.setData({ inputPosition: e.detail.value })
  },

  closeInputModal: function() {
    this.setData({ showInputModal: false, inputName: '', inputPosition: '' })
  },

  confirmInput: function() {
    var that = this
    var name = that.data.inputName.trim()
    var position = that.data.inputPosition.trim() || '厨师'
    var shopId = wx.getStorageSync('currentShopId') || ''

    if (!name) {
      wx.showToast({ title: '请输入姓名', icon: 'none' })
      return
    }

    wx.showLoading({ title: '添加中...' })

    // 先保存厨师获取 _id，再用真实 ID 生成二维码
    try {
      var db = getDb()
      db.collection('chefs').add({
        data: {
          shopId: shopId,
          name: name,
          position: position,
          createdAt: Date.now()
        },
        success: function(res) {
          var chefId = res._id
          that.generateChefQR(name, position, chefId, shopId, function(qrcodeUrl) {
            // 回写二维码 URL
            if (qrcodeUrl) {
              try {
                db.collection('chefs').doc(chefId).update({ data: { qrcode: qrcodeUrl } })
              } catch (e) {}
            }
            var newChef = {
              id: chefId,
              name: name,
              position: position,
              qrcode: qrcodeUrl || ''
            }
            var chefs = that.data.chefs.concat([newChef])
            wx.setStorageSync('chefs_' + shopId, chefs)
            that.setData({ chefs: chefs, showInputModal: false, inputName: '', inputPosition: '' })
            wx.hideLoading()
            wx.showToast({ title: '添加成功', icon: 'success' })
          })
        },
        fail: function() {
          wx.hideLoading()
          that.saveChefLocal(name, position, '', shopId)
        }
      })
    } catch (e) {
      wx.hideLoading()
      that.saveChefLocal(name, position, '', shopId)
    }
  },

  saveChefLocal: function(name, position, qrcodeUrl, shopId) {
    var newChef = {
      id: 'chef_' + Date.now(),
      name: name,
      position: position,
      qrcode: qrcodeUrl || ''
    }
    var chefs = this.data.chefs.concat([newChef])
    wx.setStorageSync('chefs_' + shopId, chefs)
    this.setData({ chefs: chefs, showInputModal: false, inputName: '', inputPosition: '' })
    wx.hideLoading()
    wx.showToast({ title: '添加成功(本地)', icon: 'success' })
  },

  // ====== 生成厨师二维码（优先 URL Link + 本地品牌 QR） ======
  generateChefQR: function(name, position, chefId, shopId, callback) {
    var that = this
    if (!chefId) {
      that.generateLocalChefQR(name, position, chefId, shopId, callback)
      return
    }

    var queryString = 'chefId=' + chefId + '&shopId=' + shopId + '&chefName=' + encodeURIComponent(name)

    wx.cloud.callFunction({
      name: 'generateMiniCode',
      data: {
        path: 'pages/index/index',
        queryString: queryString
      },
      success: function(res) {
        var result = res.result || {}
        if (result.code === 0 && result.type === 'link' && result.url) {
          // URL Link → 嵌入本地品牌 QR 码（需小程序过审）
          that.generateLocalChefQRWithUrl(result.url, name, position, chefId, shopId, callback)
        } else if (result.code === 0 && result.type === 'image' && result.fileID) {
          // 微信菊花码图片（降级，无品牌但能扫码打开，需小程序过审）
          callback(result.fileID)
        } else {
          // 全部不可用 → 本地品牌 QR（文本模式，需小程序内手动扫码）
          that.generateLocalChefQR(name, position, chefId, shopId, callback)
        }
      },
      fail: function() {
        that.generateLocalChefQR(name, position, chefId, shopId, callback)
      }
    })
  },

  // 本地 QR 码降级（云函数不可用时）
  generateLocalChefQR: function(name, position, chefId, shopId, callback) {
    var that = this
    var data = '食易特·厨师' + name + ' 请打开小程序后扫码 chefId=' + chefId + '&shopId=' + shopId + '&chefName=' + encodeURIComponent(name)

    generateQRImage(data, that, function(tempPath) {
      if (!tempPath) { callback(''); return }

      // 上传到云存储
      var cloudPath = 'qrcodes/' + shopId + '/chef_' + Date.now() + '.png'
      wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: tempPath,
        success: function(uploadRes) {
          callback(uploadRes.fileID)
        },
        fail: function() {
          callback(tempPath)
        }
      })
    })
  },

  // 用 URL Link 生成带品牌的本地 QR 码
  generateLocalChefQRWithUrl: function(url, name, position, chefId, shopId, callback) {
    var that = this
    generateQRImage(url, that, function(tempPath) {
      if (!tempPath) { callback(''); return }

      var cloudPath = 'qrcodes/' + shopId + '/chef_' + Date.now() + '.png'
      wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: tempPath,
        success: function(uploadRes) { callback(uploadRes.fileID) },
        fail: function() { callback(tempPath) }
      })
    })
  },

  // ====== 查看二维码 ======
  viewChefQR: function(e) {
    var id = e.currentTarget.dataset.id
    var qrcode = e.currentTarget.dataset.qrcode
    var name = e.currentTarget.dataset.name

    if (qrcode) {
      this.setData({
        showQRPopup: true,
        qrImage: qrcode,
        qrChefName: name,
        qrChefId: id
      })
    } else {
      // 补充生成
      var that = this
      var shopId = wx.getStorageSync('currentShopId') || ''
      var chef = that.data.chefs.find(function(c) { return c.id === id })
      var position = chef ? chef.position : ''
      this.setData({ showQRPopup: true, qrImage: '', qrChefName: name, qrChefId: id })
      this.generateChefQR(name, position, id, shopId, function(qrcodeUrl) {
        if (qrcodeUrl) {
          try {
            var db = getDb()
            db.collection('chefs').doc(id).update({ data: { qrcode: qrcodeUrl } })
          } catch (err) {}
          var chefs = that.data.chefs.map(function(c) {
            if (c.id === id) c.qrcode = qrcodeUrl
            return c
          })
          wx.setStorageSync('chefs_' + shopId, chefs)
          that.setData({ qrImage: qrcodeUrl, chefs: chefs })
        }
      })
    }
  },

  closeQRPopup: function() {
    this.setData({ showQRPopup: false, qrImage: '', qrChefName: '', qrChefId: '' })
  },

  regenerateQR: function() {
    var that = this
    var id = that.data.qrChefId
    var name = that.data.qrChefName
    var shopId = wx.getStorageSync('currentShopId') || ''
    var chef = that.data.chefs.find(function(c) { return c.id === id })
    var position = chef ? chef.position : ''

    that.setData({ qrImage: '' })
    that.generateChefQR(name, position, id, shopId, function(qrcodeUrl) {
      if (qrcodeUrl) {
        try {
          var db = getDb()
          db.collection('chefs').doc(id).update({ data: { qrcode: qrcodeUrl } })
        } catch (err) {}
        var chefs = that.data.chefs.map(function(c) {
          if (c.id === id) c.qrcode = qrcodeUrl
          return c
        })
        wx.setStorageSync('chefs_' + shopId, chefs)
        that.setData({ qrImage: qrcodeUrl, chefs: chefs })
        wx.showToast({ title: '二维码已更新', icon: 'success' })
      }
    })
  },

  // ====== 删除厨师 ======
  deleteChef: function(e) {
    var id = e.currentTarget.dataset.id
    var name = e.currentTarget.dataset.name
    var that = this
    var shopId = wx.getStorageSync('currentShopId') || ''

    wx.showModal({
      title: '确认删除',
      content: '确定要删除厨师「' + name + '」吗？',
      success: function(res) {
        if (res.confirm) {
          try {
            var db = getDb()
            db.collection('chefs').doc(id).remove()
          } catch (err) {}
          var chefs = that.data.chefs.filter(function(c) { return c.id !== id })
          wx.setStorageSync('chefs_' + shopId, chefs)
          that.setData({ chefs: chefs })
          wx.showToast({ title: '已删除', icon: 'success' })
        }
      }
    })
  }
})
