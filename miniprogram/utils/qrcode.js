/**
 * 食易特 — 本地 QR 码生成工具
 * 基于 wx.createOffscreenCanvas 纯客户端生成，零外部依赖
 */

// ── GF(256) 算术 ──────────────────────────────────────────
var EXP_TABLE = new Array(512)
var LOG_TABLE = new Array(256)
;(function initGF() {
  var x = 1
  for (var i = 0; i < 255; i++) {
    EXP_TABLE[i] = x
    LOG_TABLE[x] = i
    x <<= 1
    if (x & 256) x ^= 285 // 0x11D
  }
  for (var i = 255; i < 512; i++) {
    EXP_TABLE[i] = EXP_TABLE[i - 255]
  }
})()

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0
  return EXP_TABLE[LOG_TABLE[a] + LOG_TABLE[b]]
}

// ── Reed-Solomon 生成多项式（预计算版本1-10的生成多项式系数）──
var RS_GENERATORS = {}
function getRSGenerator(n) {
  if (RS_GENERATORS[n]) return RS_GENERATORS[n]
  var gen = [1]
  for (var i = 0; i < n; i++) {
    var next = new Array(gen.length + 1)
    for (var j = 0; j < gen.length; j++) {
      next[j] ^= gfMul(gen[j], EXP_TABLE[i])
      next[j + 1] = gen[j]
    }
    gen = next
  }
  RS_GENERATORS[n] = gen
  return gen
}

function rsEncode(data, ecCount) {
  var gen = getRSGenerator(ecCount)
  var res = new Array(data.length + ecCount)
  for (var i = 0; i < data.length; i++) res[i] = data[i]
  for (var i = data.length; i < res.length; i++) res[i] = 0
  for (var i = 0; i < data.length; i++) {
    var coef = res[i]
    if (coef !== 0) {
      for (var j = 1; j < gen.length; j++) {
        res[i + j] ^= gfMul(gen[j], coef)
      }
    }
  }
  for (var i = 0; i < data.length; i++) res[i] = data[i]
  return res
}

// ── QR 版本信息 ────────────────────────────────────────────
// [total codewords, EC codewords per block, group1 blocks, group1 data, group2 blocks, group2 data]
var EC_TABLE = {
  1:  [26,  7, 1, 26],       // version 1, EC L
  2:  [44,  10, 1, 44],
  3:  [70,  15, 1, 70],
  4:  [100, 20, 1, 100],
  5:  [134, 26, 1, 134],
  6:  [172, 36, 2, 86],
  7:  [196, 40, 2, 98],
  8:  [242, 48, 2, 121],
  9:  [292, 60, 2, 146],
  10: [346, 72, 2, 86, 2, 87]
}

// 各版本 byte-mode 最大数据容量 (EC L)
var BYTE_CAPACITY = {1:17, 2:32, 3:53, 4:78, 5:106, 6:134, 7:154, 8:192, 9:230, 10:271}

function getVersion(dataLen) {
  for (var v = 1; v <= 10; v++) {
    if (BYTE_CAPACITY[v] >= dataLen) return v
  }
  return 0 // 数据过长
}

// ── 数据编码（Byte 模式）───────────────────────────────────
function encodeData(text) {
  var bytes = []
  for (var i = 0; i < text.length; i++) {
    var code = text.charCodeAt(i)
    if (code < 0x80) {
      bytes.push(code)
    } else if (code < 0x800) {
      bytes.push(0xC0 | (code >> 6), 0x80 | (code & 0x3F))
    } else {
      bytes.push(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F))
    }
  }

  var version = getVersion(bytes.length)
  if (!version) return null

  var capacity = BYTE_CAPACITY[version]
  // 构建数据位流
  var bits = []
  function pushBits(val, len) {
    for (var i = len - 1; i >= 0; i--) bits.push((val >> i) & 1)
  }

  // 模式指示符：0100 (byte)
  pushBits(4, 4)
  // 字符计数指示符（版本1-9: 8位, 10+: 16位）
  if (version <= 9) {
    pushBits(bytes.length, 8)
  } else {
    pushBits(bytes.length, 16)
  }
  // 数据
  for (var i = 0; i < bytes.length; i++) {
    pushBits(bytes[i], 8)
  }
  // 终止符
  pushBits(0, Math.min(4, capacity * 8 - bits.length))
  // 填充至 8 的倍数
  while (bits.length % 8 !== 0) bits.push(0)
  // 填充字节 0xEC 和 0x11
  var padBytes = [0xEC, 0x11]
  var pi = 0
  while (bits.length < capacity * 8) {
    pushBits(padBytes[pi], 8)
    pi = (pi + 1) % 2
  }

  return { version: version, bits: bits }
}

// ── 矩阵构建 ───────────────────────────────────────────────
function buildMatrix(version, dataBits) {
  var size = 17 + version * 4
  var matrix = new Array(size)
  for (var i = 0; i < size; i++) {
    matrix[i] = new Array(size)
    for (var j = 0; j < size; j++) matrix[i][j] = -1
  }

  // Finder patterns（三个角）
  function placeFinder(r, c) {
    for (var i = -1; i <= 7; i++) {
      for (var j = -1; j <= 7; j++) {
        var rr = r + i, cc = c + j
        if (rr >= 0 && rr < size && cc >= 0 && cc < size) {
          var inFinder = i >= 0 && i <= 6 && j >= 0 && j <= 6
          var inBorder = !inFinder
          matrix[rr][cc] = inFinder ? ((i === 0 || i === 6 || j === 0 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4)) ? 1 : 0) : 0
        }
      }
    }
  }
  placeFinder(0, 0)
  placeFinder(0, size - 7)
  placeFinder(size - 7, 0)

  // Timing patterns
  for (var i = 8; i < size - 8; i++) {
    matrix[6][i] = matrix[i][6] = (i % 2 === 0) ? 1 : 0
  }

  // Alignment patterns（版本2+）
  if (version >= 2) {
    var aligns = []
    var interval = (version <= 6) ? (version * 4 + 16) : 28
    var steps = Math.floor(size / interval)
    for (var i = 0; i <= steps; i++) {
      for (var j = 0; j <= steps; j++) {
        var r = 6 + i * Math.floor((size - 13) / steps)
        var c = 6 + j * Math.floor((size - 13) / steps)
        if (matrix[r][c] === -1) {
          for (var dr = -2; dr <= 2; dr++) {
            for (var dc = -2; dc <= 2; dc++) {
              var rr = r + dr, cc = c + dc
              if (rr >= 0 && rr < size && cc >= 0 && cc < size && matrix[rr][cc] === -1) {
                matrix[rr][cc] = (Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0)) ? 1 : 0
              }
            }
          }
        }
      }
    }
  }

  // Reserve format info areas（暂填0）
  for (var i = 0; i < 9; i++) {
    if (matrix[i][8] === -1) matrix[i][8] = 0
    if (matrix[8][i] === -1) matrix[8][i] = 0
  }
  for (var i = 0; i < 8; i++) {
    if (matrix[size - 1 - i][8] === -1) matrix[size - 1 - i][8] = 0
    if (matrix[8][size - 1 - i] === -1) matrix[8][size - 1 - i] = 0
  }
  // Dark module
  matrix[size - 8][8] = 1

  return matrix
}

// ── 掩码评估 & 应用 ────────────────────────────────────────
function applyMask(matrix, maskPattern) {
  var size = matrix.length
  var masked = new Array(size)
  for (var i = 0; i < size; i++) {
    masked[i] = matrix[i].slice()
  }

  function maskCondition(r, c) {
    switch (maskPattern) {
      case 0: return (r + c) % 2 === 0
      case 1: return r % 2 === 0
      case 2: return c % 3 === 0
      case 3: return (r + c) % 3 === 0
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0
      case 5: return ((r * c) % 2) + ((r * c) % 3) === 0
      case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0
      case 7: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
    }
    return false
  }

  for (var r = 0; r < size; r++) {
    for (var c = 0; c < size; c++) {
      if (masked[r][c] >= 0 && maskCondition(r, c)) {
        masked[r][c] ^= 1
      }
    }
  }
  return masked
}

function evaluateMask(matrix) {
  var size = matrix.length
  var score = 0
  // 相邻同色模块罚分
  for (var r = 0; r < size; r++) {
    var run = 1
    for (var c = 1; c < size; c++) {
      if (matrix[r][c] === matrix[r][c - 1]) { run++ } else { if (run >= 5) score += 3 + (run - 5); run = 1 }
    }
    if (run >= 5) score += 3 + (run - 5)
  }
  for (var c = 0; c < size; c++) {
    var run = 1
    for (var r = 1; r < size; r++) {
      if (matrix[r][c] === matrix[r - 1][c]) { run++ } else { if (run >= 5) score += 3 + (run - 5); run = 1 }
    }
    if (run >= 5) score += 3 + (run - 5)
  }
  // 2x2 同色块
  for (var r = 0; r < size - 1; r++) {
    for (var c = 0; c < size - 1; c++) {
      if (matrix[r][c] === matrix[r+1][c] && matrix[r][c] === matrix[r][c+1] && matrix[r][c] === matrix[r+1][c+1]) score += 3
    }
  }
  return score
}

// ── 格式信息编码 ───────────────────────────────────────────
function formatInfo(eclIndex, maskPattern) {
  var data = (eclIndex << 3) | maskPattern // ECL: L=1 (01)
  var bch = data << 10
  var gen = 0x537 // 10100110111
  for (var i = 14; i >= 10; i--) {
    if (bch & (1 << i)) bch ^= gen << (i - 10)
  }
  var fmt = ((data << 10) | (bch & 0x3FF)) ^ 0x5412
  return fmt
}

function placeFormat(matrix, fmt) {
  var size = matrix.length
  for (var i = 0; i < 15; i++) {
    var bit = (fmt >> i) & 1
    // 左上角横向
    if (i < 6) matrix[i][8] = bit
    else if (i < 8) matrix[i + 1][8] = bit
    else if (i < 9) matrix[8][14 - i] = bit
    else matrix[8][14 - i] = bit

    // 左上角纵向
    if (i < 8) matrix[8][size - 1 - i] = bit
    else matrix[8][15 - i] = bit

    // 左下角 + 右上角
    if (i < 7) matrix[size - 1 - i][8] = bit
    if (i < 8) matrix[8][i] = bit
  }
}

// ── 主生成函数 ─────────────────────────────────────────────
function generateQRData(text) {
  var encoded = encodeData(text)
  if (!encoded) return null

  var version = encoded.version
  var ecInfo = EC_TABLE[version]
  var totalCodewords = ecInfo[0]
  var ecPerBlock = ecInfo[1]
  var g1Blocks = ecInfo[2]
  var g1Data = ecInfo[3]
  var g2Blocks = ecInfo[4] || 0
  var g2Data = ecInfo[5] || 0

  // 位流转字节
  var dataBytes = []
  for (var i = 0; i < encoded.bits.length; i += 8) {
    var b = 0
    for (var j = 0; j < 8; j++) b = (b << 1) | (encoded.bits[i + j] || 0)
    dataBytes.push(b)
  }
  // 补齐到 totalCodewords
  while (dataBytes.length < totalCodewords) dataBytes.push(0)

  // 分块
  var blocks = []
  var offset = 0
  for (var b = 0; b < g1Blocks; b++) {
    var block = rsEncode(dataBytes.slice(offset, offset + g1Data), ecPerBlock)
    blocks.push(block)
    offset += g1Data
  }
  for (var b = 0; b < g2Blocks; b++) {
    var block = rsEncode(dataBytes.slice(offset, offset + g2Data), ecPerBlock)
    blocks.push(block)
    offset += g2Data
  }

  // 交织
  var allData = []
  for (var i = 0; i < Math.max(g1Data, g2Data); i++) {
    for (var b = 0; b < blocks.length; b++) {
      if (i < (b < g1Blocks ? g1Data : g2Data)) allData.push(blocks[b][i])
    }
  }
  for (var i = 0; i < ecPerBlock; i++) {
    for (var b = 0; b < blocks.length; b++) {
      allData.push(blocks[b][(b < g1Blocks ? g1Data : g2Data) + i])
    }
  }

  // 位流
  var allBits = []
  for (var i = 0; i < allData.length; i++) {
    for (var j = 7; j >= 0; j--) allBits.push((allData[i] >> j) & 1)
  }

  // 构建矩阵并放置数据
  var matrix = buildMatrix(version)
  var size = matrix.length

  // 逐列从右下向左上放置
  var bitIdx = 0
  var upward = true
  for (var c = size - 1; c >= 0; c -= 2) {
    if (c === 6) c = 5 // 跳过垂直 timing 列
    var cols = (c > 6) ? [c, c - 1] : [c, c - 1]
    var range = upward
      ? (function() { var arr = []; for (var r = size - 1; r >= 0; r--) arr.push(r); return arr })()
      : (function() { var arr = []; for (var r = 0; r < size; r++) arr.push(r); return arr })()
    upward = !upward
    for (var ri = 0; ri < size; ri++) {
      var r = range[ri]
      for (var ci = 0; ci < cols.length; ci++) {
        var cc = cols[ci]
        if (cc >= 0 && cc < size && matrix[r][cc] === -1) {
          matrix[r][cc] = (bitIdx < allBits.length) ? allBits[bitIdx] : 0
          bitIdx++
        }
      }
    }
  }

  // 选择最优掩码
  var bestMask = 0
  var bestScore = Infinity
  var bestMatrix = null
  for (var m = 0; m < 8; m++) {
    var masked = applyMask(matrix, m)
    var score = evaluateMask(masked)
    if (score < bestScore) { bestScore = score; bestMask = m; bestMatrix = masked }
  }

  // 放置格式信息
  placeFormat(bestMatrix, formatInfo(1, bestMask)) // ECL L = 1

  return { matrix: bestMatrix, size: size }
}

// ── Canvas 绘制（圆形模块 + 中心品牌）───────────────────────
function drawQRCode(canvas, matrix, moduleSize, padding) {
  moduleSize = moduleSize || 4
  padding = padding || moduleSize * 4
  var ctx = canvas.getContext('2d')
  var size = matrix.length
  var total = size * moduleSize + padding * 2

  canvas.width = total
  canvas.height = total

  // 白色背景
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, total, total)

  // 圆形半径
  var radius = moduleSize / 2 * 0.88

  // 判断是否为 finder pattern 区域（三个角的定位图案）
  function isFinder(r, c) {
    // 左上角
    if (r < 9 && c < 9) return true
    // 右上角
    if (r < 9 && c >= size - 9) return true
    // 左下角
    if (r >= size - 9 && c < 9) return true
    return false
  }

  // 判断是否为 alignment pattern 区域（小定位图案）
  function isAlignment(r, c) {
    // 对齐图案是 5x5 的方块，简单判断：周围 3 格内全是对齐模块
    var count = 0
    for (var dr = -3; dr <= 3; dr++) {
      for (var dc = -3; dc <= 3; dc++) {
        var rr = r + dr, cc = c + dc
        if (rr >= 0 && rr < size && cc >= 0 && cc < size && matrix[rr][cc] === 1) {
          count++
        }
      }
    }
    // 高密度黑色模块区域（alignment pattern 中间有黑块）
    return count >= 20 && matrix[r][c] === 1
  }

  // 绘制黑色模块
  ctx.fillStyle = '#000000'
  for (var r = 0; r < size; r++) {
    for (var c = 0; c < size; c++) {
      if (matrix[r][c]) {
        var cx = padding + c * moduleSize + moduleSize / 2
        var cy = padding + r * moduleSize + moduleSize / 2

        // Finder 和 Alignment 区域用方形，其余用圆形
        if (isFinder(r, c) || isAlignment(r, c)) {
          ctx.fillRect(padding + c * moduleSize, padding + r * moduleSize, moduleSize, moduleSize)
        } else {
          ctx.beginPath()
          ctx.arc(cx, cy, radius, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }
  }

  // ── 中心品牌区域 ──
  var center = total / 2
  var logoRadius = total * 0.12  // 中心圆半径约占 24%

  // 白色圆底
  ctx.fillStyle = '#FFFFFF'
  ctx.beginPath()
  ctx.arc(center, center, logoRadius + 4, 0, Math.PI * 2)
  ctx.fill()

  // 细边框
  ctx.strokeStyle = '#E8784A'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(center, center, logoRadius + 4, 0, Math.PI * 2)
  ctx.stroke()

  // 品牌文字 "食易特" — 三个字水平排列，间距加大
  ctx.fillStyle = '#E8784A'
  var charSize = Math.round(logoRadius * 0.72)
  ctx.font = 'bold ' + charSize + 'px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  var charGap = logoRadius * 0.65  // 字间距
  ctx.fillText('食', center - charGap, center - logoRadius * 0.2)
  ctx.fillText('易', center, center - logoRadius * 0.2)
  ctx.fillText('特', center + charGap, center - logoRadius * 0.2)

  // 第二行 "Eat"
  ctx.fillStyle = '#8B7355'
  ctx.font = Math.round(logoRadius * 0.4) + 'px sans-serif'
  ctx.fillText('Eat', center, center + logoRadius * 0.5)

  return { width: total, height: total }
}

// ── 对外接口：生成 QR 码图片路径 ────────────────────────────
// pageCtx: Page 实例（用于 createSelectorQuery）
function generateQRImage(text, pageCtx, callback) {
  var qrData = generateQRData(text)
  if (!qrData) {
    callback('')
    return
  }

  try {
    pageCtx.createSelectorQuery()
      .select('#qrCanvas')
      .fields({ node: true, size: true })
      .exec(function(res) {
        if (!res || !res[0] || !res[0].node) {
          callback('')
          return
        }

        var canvas = res[0].node
        drawQRCode(canvas, qrData.matrix, 4, 16)

        wx.canvasToTempFilePath({
          canvas: canvas,
          success: function(outRes) {
            callback(outRes.tempFilePath)
          },
          fail: function() {
            callback('')
          }
        })
      })
  } catch (e) {
    callback('')
  }
}

module.exports = { generateQRImage }
