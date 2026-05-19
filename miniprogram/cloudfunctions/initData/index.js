// 云函数 - 初始化店铺测试数据
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event) => {
  const { action, shopName } = event

  try {
    if (action === 'initAll') {
      // 1. 创建测试店铺
      const shopRes = await db.collection('shops').add({
        data: {
          shopName: shopName || '食易特测试店铺',
          banners: [],
          homeTitle: '食易特 Eat',
          paymentType: 'personal',
          createdAt: Date.now()
        }
      })
      const shopId = shopRes._id

      // 2. 创建分类
      const categories = [
        { name: '凉菜', sort: 1 },
        { name: '热菜', sort: 2 },
        { name: '主食', sort: 3 },
        { name: '酒水', sort: 4 }
      ]
      const catMap = {}
      for (const cat of categories) {
        const res = await db.collection('categories').add({
          data: { shopId, name: cat.name, sort: cat.sort, createdAt: Date.now() }
        })
        catMap[cat.name] = res._id
      }

      // 3. 创建示例菜品
      const dishes = [
        { cat: '凉菜', name: '拍黄瓜', description: '爽脆清香', ingredients: '黄瓜、蒜末、醋、辣椒油', price: 12 },
        { cat: '凉菜', name: '皮蛋豆腐', description: '嫩滑爽口', ingredients: '皮蛋、嫩豆腐、酱油、香油', price: 15 },
        { cat: '凉菜', name: '凉拌木耳', description: '脆嫩可口', ingredients: '黑木耳、香菜、醋、芝麻', price: 14 },
        { cat: '热菜', name: '红烧排骨', description: '酱香浓郁', ingredients: '猪排骨、酱油、冰糖、八角', price: 48 },
        { cat: '热菜', name: '宫保鸡丁', description: '麻辣鲜香', ingredients: '鸡胸肉、花生、干辣椒', price: 32 },
        { cat: '热菜', name: '清蒸鲈鱼', description: '鲜嫩多汁', ingredients: '鲈鱼、姜丝、葱丝、豉油', price: 58 },
        { cat: '热菜', name: '蒜蓉西兰花', description: '清淡健康', ingredients: '西兰花、蒜蓉、蚝油', price: 22 },
        { cat: '主食', name: '米饭', description: '东北大米', ingredients: '大米、水', price: 2 },
        { cat: '主食', name: '扬州炒饭', description: '粒粒分明', ingredients: '米饭、鸡蛋、火腿、青豆', price: 18 },
        { cat: '主食', name: '手工水饺', description: '皮薄馅大', ingredients: '面粉、猪肉、白菜', price: 22 },
        { cat: '酒水', name: '可口可乐', description: '冰镇', ingredients: '碳酸水、糖浆', price: 5 },
        { cat: '酒水', name: '青岛啤酒', description: '经典醇厚', ingredients: '麦芽、啤酒花', price: 8 },
        { cat: '酒水', name: '鲜榨果汁', description: '当季水果', ingredients: '新鲜水果、蜂蜜', price: 16 }
      ]

      for (const dish of dishes) {
        await db.collection('dishes').add({
          data: {
            shopId,
            categoryId: catMap[dish.cat],
            name: dish.name,
            description: dish.description,
            ingredients: dish.ingredients,
            price: dish.price,
            image: '',
            available: true,
            createdAt: Date.now()
          }
        })
      }

      // 4. 创建示例餐桌
      const tables = ['A01', 'A02', 'B01', 'B02', 'C01', 'VIP1', 'VIP2']
      for (const name of tables) {
        await db.collection('tables').add({
          data: {
            shopId,
            name: name,
            status: 'free',
            qrcode: '',
            createdAt: Date.now()
          }
        })
      }

      return {
        code: 0,
        msg: '全部数据初始化成功',
        data: { shopId, categoryCount: categories.length, dishCount: dishes.length, tableCount: tables.length }
      }
    }

    return { code: -1, msg: '未知操作，请使用 action=initAll' }
  } catch (err) {
    return { code: -1, msg: err.message }
  }
}
