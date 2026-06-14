const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { action, shopId } = event

  if (!action) return { code: -1, msg: '缺少 action' }

  try {
    if (action === 'delete') {
      // 删除店铺及关联数据
      if (!shopId) return { code: -1, msg: '缺少 shopId' }
      const cols = ['sessions', 'orders', 'order_items']
      for (const c of cols) {
        const r = await db.collection(c).where({ shopId }).get()
        for (const d of r.data) { await db.collection(c).doc(d._id).remove() }
      }
      await db.collection('shops').doc(shopId).remove()
      return { code: 0, msg: '已删除' }
    }

    if (action === 'recharge') {
      const { shopId, amount } = event
      if (!shopId || !amount) return { code: -1, msg: '缺少参数' }
      const s = await db.collection('shops').doc(shopId).get()
      const shop = s.data || {}
      const newBalance = (shop.yuanbao || 0) + amount
      await db.collection('shops').doc(shopId).update({
        data: { yuanbao: Math.max(0, newBalance), frozen: newBalance <= 0 }
      })
      await db.collection('yuanbao_transactions').add({
        data: { shopId, amount, type: amount > 0 ? 'admin_recharge' : 'admin_deduct', description: '管理员' + (amount > 0 ? '充值' : '扣减') + ' ' + Math.abs(amount) + ' 元宝', balance: Math.max(0, newBalance), createdAt: Date.now() }
      })
      return { code: 0, msg: '操作成功', balance: Math.max(0, newBalance) }
    }

    if (action === 'toggleFreeze') {
      if (!shopId) return { code: -1, msg: '缺少 shopId' }
      const s = await db.collection('shops').doc(shopId).get()
      const frozen = !(s.data || {}).frozen
      await db.collection('shops').doc(shopId).update({ data: { frozen } })
      return { code: 0, msg: frozen ? '已冻结' : '已解冻' }
    }

    return { code: -1, msg: '未知 action' }
  } catch (e) {
    return { code: -1, msg: e.message || '操作失败' }
  }
}
