const { getDb } = require('../../utils/cloud')
const { generateQRImage } = require('../../utils/qrcode')

Page({
  data: {
    tables: [],
    showInputModal: false,
    inputValue: '',
    showEditModal: false,
    editInputValue: '',
    editingTableId: '',
    showQRPopup: false,
    qrImage: '',
    qrTableName: '',
    qrTableId: '',
    watcher: null,
    refreshTimer: null
  },

  onLoad: function() {
    this.loadTables()
    this.startWatch()
  },

  onShow: function() {
    this.loadTables()
  },

  onUnload: function() {
    if (this.data.watcher) { this.data.watcher.close() }
    if (this.data.refreshTimer) { clearInterval(this.data.refreshTimer) }
  },

  startWatch: function() {
    var that = this
    var shopId = wx.getStorageSync('currentShopId') || ''
    if (!shopId) return
    try {
      var db = getDb()
      var watcher = db.collection('order_items')
        .where({ shopId: shopId, status: 'submitted' })
        .watch({
          onChange: function() { that.loadTables() },
          onError: function() {}
        })
      that.setData({ watcher: watcher })
    } catch (e) {}
    // 兜底：每 10 秒刷新一次
    var timer = setInterval(function() { that.loadTables() }, 10000)
    that.setData({ refreshTimer: timer })
  },

  loadTables: function() {
    var that = this
    var shopId = wx.getStorageSync('currentShopId') || ''
    try {
      var db = getDb()
      db.collection('tables')
        .where({ shopId: shopId })
        .get({
          success: function(res) {
            var tables = res.data || []
            if (tables.length === 0) {
              tables = wx.getStorageSync('tables') || []
            }
            tables = tables.map(function(t) {
              return {
                id: t._id || t.id,
                name: t.name,
                status: t.status || 'free',
                qrcode: t.qrcode || ''
              }
            })
            that.enrichTables(tables)
          },
          fail: function() {
            var tables = wx.getStorageSync('tables') || []
            that.enrichTables(tables)
          }
        })
    } catch (e) {
      var tables = wx.getStorageSync('tables') || []
      that.enrichTables(tables)
    }
  },

  enrichTables: function(tables) {
    var that = this
    var shopId = wx.getStorageSync('currentShopId') || ''

    // 优先从云端查询活跃会话和订单
    try {
      var db = getDb()
      // 查询所有活跃 sessions
      db.collection('sessions')
        .where({ shopId: shopId, status: 'active' })
        .get({
          success: function(sessionRes) {
            var activeSessions = sessionRes.data || []
            var occupiedTables = {}
            activeSessions.forEach(function(s) {
              if (s.tableName) {
                occupiedTables[s.tableName] = {
                  guestCount: s.guestCount || 0,
                  sessionId: s._id
                }
              }
            })

            // 查询未结账的 order_items 统计金额（已结账的不算占用）
            var itemQuery = { shopId: shopId }
            itemQuery.status = 'submitted'
            db.collection('order_items')
              .where(itemQuery)
              .get({
                success: function(itemRes) {
                  var items = itemRes.data || []
                  var tableStats = {}
                  items.forEach(function(item) {
                    if (item.tableName) {
                      if (!tableStats[item.tableName]) {
                        tableStats[item.tableName] = { total: 0, guestCount: 0 }
                      }
                      tableStats[item.tableName].total += (item.price || 0) * (item.quantity || 1)
                    }
                  })

                  // 合并云端数据
                  tables = tables.map(function(t) {
                    var cloudSession = occupiedTables[t.name]
                    var cloudStats = tableStats[t.name]
                    if (cloudSession || cloudStats) {
                      t.status = 'occupied'
                      t.statusText = '有客'
                      t.orders = (cloudStats ? cloudStats.total : 0).toFixed(2)
                      t.guestCount = cloudSession ? cloudSession.guestCount : (cloudStats ? cloudStats.guestCount : 0)
                    } else {
                      t.status = t.status || 'free'
                      t.statusText = '空闲'
                      t.orders = t.orders || 0
                      t.guestCount = t.guestCount || 0
                    }
                    return t
                  })

                  that.setData({ tables: tables })
                },
                fail: function() {
                  that.enrichFromLocal(tables)
                }
              })
          },
          fail: function() {
            that.enrichFromLocal(tables)
          }
        })
    } catch (e) {
      that.enrichFromLocal(tables)
    }
  },

  enrichFromLocal: function(tables) {
    var orders = wx.getStorageSync('allOrders') || []

    tables = tables.map(function(t) {
      var tableOrders = orders.filter(function(o) {
        return o.tableNo === t.name && !o.cleared && o.status !== 'paid'
      })

      if (tableOrders.length > 0) {
        t.status = 'occupied'
        t.statusText = '有客'
        var total = 0
        var guestCount = 0
        tableOrders.forEach(function(o) {
          if (o.items) {
            o.items.forEach(function(item) {
              total += item.price * item.quantity
            })
          }
          guestCount = o.guestCount || 0
        })
        t.orders = total.toFixed(2)
        t.guestCount = guestCount
      } else {
        t.status = 'free'
        t.statusText = '空闲'
        t.orders = 0
        t.guestCount = 0
      }
      return t
    })

    this.setData({ tables: tables })
  },

  stopProp: function() {},

  // ====== 添加餐桌 ======
  addTable: function() {
    this.setData({
      showInputModal: true,
      inputValue: ''
    })
  },

  onInputValueChange: function(e) {
    this.setData({ inputValue: e.detail.value })
  },

  closeInputModal: function() {
    this.setData({ showInputModal: false, inputValue: '' })
  },

  confirmInput: function() {
    var that = this
    var value = that.data.inputValue.trim()
    var shopId = wx.getStorageSync('currentShopId') || ''

    if (!value) {
      wx.showToast({ title: '请输入桌号', icon: 'none' })
      return
    }

    if (that.data.tables.find(function(t) { return t.name === value })) {
      wx.showToast({ title: '桌号已存在', icon: 'none' })
      return
    }

    wx.showLoading({ title: '添加中...' })

    var saveTable = function(qrcodeUrl) {
      try {
        var db = getDb()
        db.collection('tables').add({
          data: {
            shopId: shopId,
            name: value,
            status: 'free',
            qrcode: qrcodeUrl || '',
            createdAt: Date.now()
          },
          success: function(res) {
            var newTable = {
              id: res._id,
              name: value,
              status: 'free',
              statusText: '空闲',
              qrcode: qrcodeUrl || '',
              orders: 0,
              guestCount: 0
            }
            var tables = that.data.tables.concat([newTable])
            wx.setStorageSync('tables', tables)
            that.setData({ tables: tables, showInputModal: false, inputValue: '' })
            wx.hideLoading()
            wx.showToast({ title: '添加成功', icon: 'success' })
          },
          fail: function() {
            var newTable = {
              id: 'T' + Date.now(),
              name: value,
              status: 'free',
              statusText: '空闲',
              qrcode: qrcodeUrl || '',
              orders: 0,
              guestCount: 0
            }
            var tables = that.data.tables.concat([newTable])
            wx.setStorageSync('tables', tables)
            that.setData({ tables: tables, showInputModal: false, inputValue: '' })
            wx.hideLoading()
            wx.showToast({ title: '添加成功(本地)', icon: 'success' })
          }
        })
      } catch (e) {
        var newTable = {
          id: 'T' + Date.now(),
          name: value,
          status: 'free',
          statusText: '空闲',
          qrcode: qrcodeUrl || '',
          orders: 0,
          guestCount: 0
        }
        var tables = that.data.tables.concat([newTable])
        wx.setStorageSync('tables', tables)
        that.setData({ tables: tables, showInputModal: false, inputValue: '' })
        wx.hideLoading()
        wx.showToast({ title: '添加成功(本地)', icon: 'success' })
      }
    }

    // 生成二维码
    that.generateQRCode(value, shopId, function(qrcodeUrl) {
      saveTable(qrcodeUrl)
    })
  },

  // ====== 生成二维码（优先 URL Link + 本地品牌 QR） ======
  generateQRCode: function(tableName, shopId, callback) {
    var that = this
    var queryString = 'shopId=' + shopId + '&tableNo=' + tableName
    var scene = 's' + shopId + 't' + tableName

    wx.cloud.callFunction({
      name: 'generateMiniCode',
      data: {
        path: 'pages/index/index',
        scene: scene.length <= 32 ? scene : '',
        queryString: queryString
      },
      success: function(res) {
        var result = res.result || {}
        if (result.code === 0 && result.type === 'link' && result.url) {
          // URL Link → 嵌入本地品牌 QR 码（需小程序过审）
          that.generateLocalQRWithData(result.url, tableName, shopId, callback)
        } else if (result.code === 0 && result.type === 'image' && result.fileID) {
          // 微信菊花码图片（降级，无品牌但能扫码打开，需小程序过审）
          callback(result.fileID)
        } else {
          // 全部不可用 → 本地品牌 QR（文本模式，需小程序内手动扫码）
          that.generateLocalQR(tableName, shopId, callback)
        }
      },
      fail: function() {
        that.generateLocalQR(tableName, shopId, callback)
      }
    })
  },

  // 用指定数据生成带品牌的本地 QR 码
  generateLocalQRWithData: function(data, tableName, shopId, callback) {
    var that = this
    generateQRImage(data, that, function(tempPath) {
      if (!tempPath) { callback(''); return }
      var cloudPath = 'qrcodes/' + shopId + '/' + tableName + '_' + Date.now() + '.png'
      wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: tempPath,
        success: function(uploadRes) { callback(uploadRes.fileID) },
        fail: function() { callback(tempPath) }
      })
    })
  },

  // 本地 QR 码降级（云函数不可用时）
  generateLocalQR: function(tableName, shopId, callback) {
    var that = this
    var data = '食易特·餐桌' + tableName + ' 请打开小程序后扫码 shopId=' + shopId + '&tableNo=' + tableName

    generateQRImage(data, that, function(tempPath) {
      if (!tempPath) { callback(''); return }

      // 上传到云存储
      var cloudPath = 'qrcodes/' + shopId + '/' + tableName + '_' + Date.now() + '.png'
      wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: tempPath,
        success: function(uploadRes) {
          callback(uploadRes.fileID)
        },
        fail: function() {
          callback(tempPath) // 云存储失败时用本地临时路径
        }
      })
    })
  },

  // ====== 编辑餐桌 ======
  editTable: function(e) {
    var id = e.currentTarget.dataset.id
    var name = e.currentTarget.dataset.name
    this.setData({
      showEditModal: true,
      editInputValue: name,
      editingTableId: id
    })
  },

  onEditInputChange: function(e) {
    this.setData({ editInputValue: e.detail.value })
  },

  closeEditModal: function() {
    this.setData({ showEditModal: false, editInputValue: '', editingTableId: '' })
  },

  confirmEdit: function() {
    var that = this
    var newName = that.data.editInputValue.trim()
    var id = that.data.editingTableId
    var shopId = wx.getStorageSync('currentShopId') || ''

    if (!newName) {
      wx.showToast({ title: '请输入桌号', icon: 'none' })
      return
    }

    // 检查重复
    if (that.data.tables.find(function(t) { return t.name === newName && t.id !== id })) {
      wx.showToast({ title: '桌号已存在', icon: 'none' })
      return
    }

    var oldTable = that.data.tables.find(function(t) { return t.id === id })
    var oldName = oldTable ? oldTable.name : ''

    // 更新云数据库
    try {
      var db = getDb()
      var updateData = { name: newName }
      db.collection('tables').doc(id).update({
        data: updateData,
        success: function() {
          // 如果名称变了，重新生成二维码
          if (newName !== oldName) {
            that.generateQRCode(newName, shopId, function(qrcodeUrl) {
              if (qrcodeUrl) {
                db.collection('tables').doc(id).update({ data: { qrcode: qrcodeUrl } })
              }
              // 更新本地
              var tables = that.data.tables.map(function(t) {
                if (t.id === id) { t.name = newName; if (qrcodeUrl) t.qrcode = qrcodeUrl }
                return t
              })
              wx.setStorageSync('tables', tables)
              that.setData({ tables: tables, showEditModal: false, editInputValue: '', editingTableId: '' })
              wx.showToast({ title: '修改成功', icon: 'success' })
            })
          } else {
            var tables = that.data.tables.map(function(t) {
              if (t.id === id) t.name = newName
              return t
            })
            wx.setStorageSync('tables', tables)
            that.setData({ tables: tables, showEditModal: false, editInputValue: '', editingTableId: '' })
            wx.showToast({ title: '修改成功', icon: 'success' })
          }
        },
        fail: function() {
          that.updateTableLocal(id, newName, oldName, shopId)
        }
      })
    } catch (e) {
      that.updateTableLocal(id, newName, oldName, shopId)
    }
  },

  updateTableLocal: function(id, newName, oldName, shopId) {
    var that = this
    if (newName !== oldName) {
      that.generateQRCode(newName, shopId, function(qrcodeUrl) {
        var tables = that.data.tables.map(function(t) {
          if (t.id === id) { t.name = newName; if (qrcodeUrl) t.qrcode = qrcodeUrl }
          return t
        })
        wx.setStorageSync('tables', tables)
        that.setData({ tables: tables, showEditModal: false, editInputValue: '', editingTableId: '' })
        wx.showToast({ title: '修改成功(本地)', icon: 'success' })
      })
    } else {
      var tables = that.data.tables.map(function(t) {
        if (t.id === id) t.name = newName
        return t
      })
      wx.setStorageSync('tables', tables)
      that.setData({ tables: tables, showEditModal: false, editInputValue: '', editingTableId: '' })
      wx.showToast({ title: '修改成功(本地)', icon: 'success' })
    }
  },

  // ====== 删除餐桌 ======
  deleteTable: function(e) {
    var id = e.currentTarget.dataset.id
    var name = e.currentTarget.dataset.name
    var that = this

    // 检查是否被占用
    var table = that.data.tables.find(function(t) { return t.id === id })
    if (table && table.status === 'occupied') {
      wx.showToast({ title: '餐桌正在使用，无法删除', icon: 'none' })
      return
    }

    wx.showModal({
      title: '确认删除',
      content: '确定要删除餐桌「' + name + '」吗？',
      success: function(res) {
        if (res.confirm) {
          // 删除云数据库
          try {
            var db = getDb()
            db.collection('tables').doc(id).remove()
          } catch (err) {}

          // 更新本地
          var tables = that.data.tables.filter(function(t) { return t.id !== id })
          wx.setStorageSync('tables', tables)
          that.setData({ tables: tables })
          wx.showToast({ title: '已删除', icon: 'success' })
        }
      }
    })
  },

  // ====== 查看/生成二维码 ======
  viewQRCode: function(e) {
    var id = e.currentTarget.dataset.id
    var qrcode = e.currentTarget.dataset.qrcode
    var name = e.currentTarget.dataset.name

    if (qrcode) {
      this.setData({
        showQRPopup: true,
        qrImage: qrcode,
        qrTableName: name,
        qrTableId: id
      })
    } else {
      // 还没有二维码，先生成一个
      var that = this
      var shopId = wx.getStorageSync('currentShopId') || ''
      this.setData({
        showQRPopup: true,
        qrImage: '',
        qrTableName: name,
        qrTableId: id
      })
      this.generateQRCode(name, shopId, function(qrcodeUrl) {
        if (qrcodeUrl) {
          // 保存到数据库
          try {
            var db = getDb()
            db.collection('tables').doc(id).update({ data: { qrcode: qrcodeUrl } })
          } catch (err) {}
          // 更新本地
          var tables = that.data.tables.map(function(t) {
            if (t.id === id) t.qrcode = qrcodeUrl
            return t
          })
          wx.setStorageSync('tables', tables)
          that.setData({ qrImage: qrcodeUrl, tables: tables })
        }
      })
    }
  },

  closeQRPopup: function() {
    this.setData({ showQRPopup: false, qrImage: '', qrTableName: '', qrTableId: '' })
  },

  regenerateQR: function() {
    var that = this
    var id = that.data.qrTableId
    var name = that.data.qrTableName
    var shopId = wx.getStorageSync('currentShopId') || ''

    that.setData({ qrImage: '' })
    that.generateQRCode(name, shopId, function(qrcodeUrl) {
      if (qrcodeUrl) {
        try {
          var db = getDb()
          db.collection('tables').doc(id).update({ data: { qrcode: qrcodeUrl } })
        } catch (err) {}
        var tables = that.data.tables.map(function(t) {
          if (t.id === id) t.qrcode = qrcodeUrl
          return t
        })
        wx.setStorageSync('tables', tables)
        that.setData({ qrImage: qrcodeUrl, tables: tables })
        wx.showToast({ title: '二维码已更新', icon: 'success' })
      }
    })
  },

  viewTableDetail: function(e) {
    var id = e.currentTarget.dataset.id
    var table = this.data.tables.find(function(t) { return t.id === id })
    if (table) {
      wx.setStorageSync('currentTableDetail', table)
      wx.navigateTo({ url: '/pages/owner/tableDetail/tableDetail' })
    }
  }
})
