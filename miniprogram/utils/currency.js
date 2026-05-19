// 金额格式化 - 统一使用「米」
function formatPrice(price) {
  return Number(price).toFixed(2) + '米'
}

function parsePrice(str) {
  var num = parseFloat(str)
  if (isNaN(num)) return 0
  return Math.round(num * 100) / 100
}

module.exports = { formatPrice, parsePrice }
