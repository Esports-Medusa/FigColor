# FigColor 首页 UI 优化实施计划

## 目标
将 FigColor 首页打造成更现代、更具 AI/SaaS 产品气质的界面，同时保持科研配色工具的专业风格。

## 设计方向
- **主色调**: 蓝色 (#0066cc) 配合柔和渐变
- **风格**: 专业、干净、现代
- **元素**: gradient background / soft glow / rounded cards / subtle shadow

---

## 实施步骤

### 1. 修改 `src/App.vue` - 顶部导航
- 在 nav-links 中添加 "My Projects" 链接，指向 `/projects`
- 导航顺序: `Palettes | My Projects | Chart Types`

### 2. 修改 `src/styles/global.css` - 全局样式增强
- 添加 CSS 变量: 渐变色、柔和阴影、圆角等
- 更新 `.card` 组件样式: 更大圆角、更柔和阴影
- 添加 `.btn` 变体: 渐变按钮样式

### 3. 修改 `src/views/HomeView.vue` - 首页重构
**Hero 区域**:
- 标题: "Design publication-ready scientific figures with consistent color."
- 副标题: "Explore curated color palettes for papers, presentations, and reproducible code."
- Primary CTA: "Browse Palettes" 按钮
- Secondary CTA: "View Chart Types" 按钮
- 背景: 柔和渐变 + soft glow 效果

**功能卡片 (quick-links)**:
- 删除: Paper Projects / Chart Type Guide / Copy Code for Python/R/CSS
- 仅保留: 简洁的 Hero + CTA

**Featured Palettes 区域**:
- 保留现有逻辑
- 可优化 section 标题样式

### 4. 修改 `src/components/PaletteCard.vue` - 卡片视觉优化
- 保持现有结构不变
- 优化圆角 (20px+)
- 更柔和的阴影
- 提升整体现代感

---

## 修改文件清单
1. `src/App.vue` - 顶部导航
2. `src/styles/global.css` - 全局样式
3. `src/views/HomeView.vue` - 首页 Hero 和功能区
4. `src/components/PaletteCard.vue` - 卡片视觉

## 路由确认
- `/` → HomeView
- `/palettes` → PalettesView
- `/projects` → ProjectsView (My Projects 链接目标)
- `/chart-types` → ChartTypesView