// 金额格式化 - 统一使用「¥」
function formatPrice(price) {
  return '¥' + Number(price).toFixed(2)
}

function parsePrice(str) {
  var num = parseFloat(str)
  if (isNaN(num)) return 0
  return Math.round(num * 100) / 100
}

module.exports = { formatPrice, parsePrice }
