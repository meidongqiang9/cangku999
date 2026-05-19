/**
 * 诊断脚本 - 检查订单数据流程
 * 在微信开发者工具的控制台中运行此脚本
 */
function diagnoseOrderData() {
  console.log('===== 开始诊断 =====')
  
  // 1. 检查 currentTable
  var currentTable = wx.getStorageSync('currentTable')
  console.log('1. currentTable:', currentTable)
  
  // 2. 检查所有订单
  var allOrders = wx.getStorageSync('allOrders') || []
  console.log('2. 总订单数:', allOrders.length)
  
  // 3. 按桌号分组显示
  var ordersByTable = {}
  allOrders.forEach(function(order, idx) {
    var key = String(order.tableNo)
    if (!ordersByTable[key]) {
      ordersByTable[key] = []
    }
    ordersByTable[key].push({
      index: idx,
      itemsCount: (order.items || []).length,
      createdAt: order.createdAt,
      fromOwner: order.fromOwner
    })
  })
  
  console.log('3. 各桌订单分布:', ordersByTable)
  
  // 4. 检查当前桌的订单
  if (currentTable) {
    var tableNo = String(currentTable.tableNo)
    var tableOrders = allOrders.filter(function(o) {
      return String(o.tableNo) === tableNo
    })
    console.log('4. 当前桌(' + tableNo + ')的订单数:', tableOrders.length)
    tableOrders.forEach(function(o, i) {
      console.log('  订单' + i + ':', {
        items: o.items,
        createdAt: o.createdAt,
        fromOwner: o.fromOwner
      })
    })
  }
  
  // 5. 测试添加订单
  console.log('5. 测试添加订单...')
  var testOrder = {
    tableNo: currentTable ? currentTable.tableNo : 'test',
    items: [{ id: 'test_' + Date.now(), name: '测试', price: 10, quantity: 1 }],
    createdAt: Date.now(),
    fromOwner: false,
    status: 'pending'
  }
  
  allOrders.push(testOrder)
  wx.setStorageSync('allOrders', allOrders)
  
  var verifyOrders = wx.getStorageSync('allOrders') || []
  console.log('   添加后订单总数:', verifyOrders.length)
  console.log('   添加成功:', verifyOrders.length === allOrders.length)
  
  console.log('===== 诊断完成 =====')
}

// 导出到全局，方便调用
wx.diagnoseOrderData = diagnoseOrderData

console.log('诊断脚本已加载，请在控制台运行 wx.diagnoseOrderData()')
