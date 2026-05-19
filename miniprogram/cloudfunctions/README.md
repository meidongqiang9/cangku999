<!-- 云端点餐小程序 2.0 -->
<!-- Cloud Functions 配置说明 -->
<!-- 
1. 在微信开发者工具中，点击"云开发"按钮
2. 创建云开发环境
3. 在 cloudfunctions 目录右键上传并部署：云端安装依赖
 -->

<!-- 
数据库集合设计：
- categories: 菜品分类 (id, name, sort)
- menu_items: 菜品 (id, categoryId, name, description, price, image, available, featured)
- orders: 订单 (id, tableNo, guestCount, items, totalPrice, status, createdAt, paidAt)
- banners: 首页轮播图 (id, image, link, show, sort)
- users: 用户 (id, openid, nickName, avatarUrl, phone, createdAt)
-->