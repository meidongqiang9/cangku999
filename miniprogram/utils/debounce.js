// 防抖 & 节流工具
function debounce(fn, delay) {
  delay = delay || 300
  var timer = null
  return function() {
    var context = this
    var args = arguments
    if (timer) clearTimeout(timer)
    timer = setTimeout(function() {
      fn.apply(context, args)
    }, delay)
  }
}

function throttle(fn, interval) {
  interval = interval || 300
  var last = 0
  return function() {
    var now = Date.now()
    if (now - last >= interval) {
      last = now
      fn.apply(this, arguments)
    }
  }
}

module.exports = { debounce, throttle }
