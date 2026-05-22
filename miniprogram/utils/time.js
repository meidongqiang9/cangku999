// 时间格式化 — 统一使用阿拉伯数字 + 斜杠
// 格式: YYYY/MM/DD HH:mm:ss

function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

// 完整日期时间: 2026/05/22 14:08:35
function formatDateTime(timestamp) {
  var d = new Date(timestamp || Date.now())
  return d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate()) +
         ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
}

// 日期: 2026/05/22
function formatDate(timestamp) {
  var d = new Date(timestamp || Date.now())
  return d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate())
}

// 时分: 14:08
function formatTime(timestamp) {
  var d = new Date(timestamp || Date.now())
  return pad(d.getHours()) + ':' + pad(d.getMinutes())
}

// 时分秒: 14:08:35
function formatTimeSec(timestamp) {
  var d = new Date(timestamp || Date.now())
  return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
}

// 判断是否同一天
function isSameDay(t1, t2) {
  var d1 = new Date(t1)
  var d2 = new Date(t2 || Date.now())
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate()
}

// 判断是否同月
function isSameMonth(t1, t2) {
  var d1 = new Date(t1)
  var d2 = new Date(t2 || Date.now())
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth()
}

// 判断是否同年
function isSameYear(t1, t2) {
  return new Date(t1).getFullYear() === new Date(t2 || Date.now()).getFullYear()
}

// 获取当天零点时间戳
function todayStart() {
  var d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

// 获取当月首日零点时间戳
function monthStart() {
  var d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime()
}

// 获取当年首日零点时间戳
function yearStart() {
  return new Date(new Date().getFullYear(), 0, 1).getTime()
}

module.exports = {
  formatDateTime, formatDate, formatTime, formatTimeSec,
  isSameDay, isSameMonth, isSameYear,
  todayStart, monthStart, yearStart
}
