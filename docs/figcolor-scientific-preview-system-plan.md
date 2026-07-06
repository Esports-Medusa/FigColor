# FigColor 原创科研图缩略图系统 - Phase 1 开发计划

## 1. Phase 1 范围

Phase 1 实现 **4 个 chart_family** 的原创缩略图，替代期刊截图封面。

| chart_family | template_id | 用途 | 核心功能色 |
|--------------|-------------|------|------------|
| `heatmap_annotated` | `heatmap_annotated_v1` | annotated heatmap / expression matrix | heatmap_low/mid/high, annotation_group_1/2 |
| `bar_error` | `bar_error_v1` | control/treatment bar + error bars | control, treatment, error_bar, significance |
| `boxplot_jitter` | `boxplot_jitter_v1` | group comparison / clinical stats | group_1/2/3, jitter_point, median_line |
| `line_multiseries` | `line_multiseries_v1` | time series / dose response | line_1/2/3, confidence_band_1/2 |

---

## 2. 核心设计

### 2.1 chart_types vs chart_family

| 字段 | 用途 | 特点 |
|------|------|------|
| `chart_types` | 用户筛选，palette 推荐用于哪些图表类型 | 可多选，继续作为 filter |
| `chart_family` | preview/template/rendering | Phase 1 只允许一个，作为缩略图模板决定字段 |

### 2.2 设计原则

- **统一外层**：id / slug / name / status / discipline / chart_family / tags（产品层）
- **分型 roles**：functional_roles 结构取决于 chart_family
- **统一导出色**：exported_core_colors 是桥接角色系统和 UI 的桥梁

### 2.3 类型定义

```typescript
// src/lib/palette/schema.ts
type ChartFamily = 'heatmap_annotated' | 'bar_error' | 'boxplot_jitter' | 'line_multiseries'

interface ExportedCoreColor {
  role: string
  label: string
  hex: string
}

interface PreviewTemplate {
  template_id: string
  renderer: 'svg' | 'canvas'
  mock_data_strategy: 'deterministic_seed_from_slug'
}

interface CopyBlocks {
  r?: Record<string, string>
  python?: Record<string, string>
  json?: Record<string, unknown>
}

interface BasePaletteSchema {
  id: string
  slug: string
  name: string
  status: 'draft' | 'published' | 'archived'
  discipline: string[]
  chart_family: ChartFamily
  chart_types?: string[]
  tags: string[]
  colors?: PaletteColor[]
  exported_core_colors?: ExportedCoreColor[]
  preview_template?: PreviewTemplate
  copy_blocks?: CopyBlocks
  created_at: string
  updated_at: string
  published_at?: string
}
```

### 2.4 Functional Roles 结构（discriminated union，按 chart_family 分型）

```typescript
// heatmap_annotated
interface HeatmapAnnotatedRoles {
  heatmap_scale: {
    type: 'diverging_3'
    roles: { low: string; mid: string; high: string }
    domain: [number, number, number]
  }
  annotation: {
    type: 'categorical'
    roles: Record<string, string>
    labels: Record<string, string>
  }
}

// bar_error
interface BarErrorRoles {
  groups: {
    control: { hex: string; label: string }
    treatment: { hex: string; label: string }
  }
  statistics: {
    error_bar: { hex: string }
    significance?: { hex: string }
  }
}

// boxplot_jitter
interface BoxplotJitterRoles {
  groups: {
    group_1: { hex: string; label: string }
    group_2: { hex: string; label: string }
    group_3?: { hex: string; label: string }
  }
  overlays: {
    jitter_point: { hex: string }
    median_line: { hex: string }
  }
}

// line_multiseries
interface LineMultiseriesRoles {
  series: {
    line_1: { hex: string; label: string }
    line_2: { hex: string; label: string }
    line_3?: { hex: string; label: string }
  }
  uncertainty: {
    confidence_band_1: { hex: string }
    confidence_band_2?: { hex: string }
  }
}

// discriminated union - chart_family 决定 functional_roles 类型
type FigColorPalette = 
  | (BasePaletteSchema & { chart_family: 'heatmap_annotated'; functional_roles: HeatmapAnnotatedRoles })
  | (BasePaletteSchema & { chart_family: 'bar_error'; functional_roles: BarErrorRoles })
  | (BasePaletteSchema & { chart_family: 'boxplot_jitter'; functional_roles: BoxplotJitterRoles })
  | (BasePaletteSchema & { chart_family: 'line_multiseries'; functional_roles: LineMultiseriesRoles })
```

---

## 3. 接入现有系统

### 3.1 数据层

- [ ] 保留 `colors` 字段（标注为 legacy fallback）
- [ ] 新增 `functional_roles` 字段（类型安全）
- [ ] 新增 `exported_core_colors` 字段
- [ ] 新增 `preview_template` 字段
- [ ] 新增 `copy_blocks` 字段
- [ ] **Fallback 逻辑**：无新字段时，exported_core_colors 回退到 colors

### 3.2 Palette Card

- [ ] 用 `PaletteChartPreview` 替代期刊截图封面
- [ ] 根据 `palette.chart_family` 选择模板
- [ ] 底部色条优先读取 `exported_core_colors`，无则 fallback 到 `colors`

### 3.3 Palette Detail Page

- [ ] Hero 区显示大号原创 preview（720 x 420）
- [ ] 新增 Functional Roles 展示区域
- [ ] 新增 Copy Blocks 区域（R / Python / JSON tabs）

### 3.4 Browse Palettes

- [ ] `chart_types` 继续作为用户筛选字段
- [ ] `chart_family` 暂不作为主筛选项，只作为 preview_template/rendering 字段
- [ ] 后续如有需要再增加 chart_family advanced filter
- [ ] discipline / tags 筛选逻辑不变

### 3.5 Add/Edit Palette

- [ ] 添加 `chart_family` 选择
- [ ] Phase 1 可先支持 JSON editor 或简化表单录入 functional_roles
- [ ] 完整可视化 roles editor 放到 Phase 1.5
- [ ] 选择 chart_family 后自动设置 `preview_template.template_id`
- [ ] 根据 functional_roles 自动生成 `exported_core_colors`
- [ ] 根据 functional_roles 自动生成 `copy_blocks` 默认值

### 3.6 Paper Project

- [ ] 添加 palette 流程保持不变
- [ ] 项目内展示 `exported_core_colors`

---

## 4. 文件结构

```
src/
  components/palettes/
    PaletteChartPreview.vue              # 统一入口
    previews/
      HeatmapAnnotatedPreview.vue       # 新增
      BarErrorPreview.vue                # 新增
      BoxplotJitterPreview.vue           # 新增
      LineMultiseriesPreview.vue         # 新增
  lib/palette/
    schema.ts                           # 类型定义
    previewMockData.ts                  # 确定性 mock data generators
    exportCoreColors.ts                 # exported_core_colors 生成
    functionalRoles.ts                  # roles 生成
    copyBlocks.ts                        # R/Python/JSON 代码生成
```

---

## 5. Phase 1 Steps

### 推荐顺序

建议按以下顺序实现：

1. **Step 1 + Step 4**（先完成 schema 和 Palette Card fallback）
2. **Step 3**（再实现 4 个 preview component）
3. 剩余步骤按需推进

### 实现清单

- [ ] **Step 1**: 定义 `ChartFamily`、`FunctionalRoles`、各子类型、`ExportedCoreColor` 等
- [ ] **Step 2**: 扩展 `PaletteChartPreview.vue` 分发逻辑
- [ ] **Step 3**: 实现 4 个 Preview Component + mock data generators
- [ ] **Step 4**: 接入 Palette Card，添加 fallback
- [ ] **Step 5**: 接入 Palette Detail Page（Hero + Functional Roles + Copy Blocks）
- [ ] **Step 6**: 更新 Add/Edit Palette，按第 3.5 节要求支持 chart_family、functional_roles、自动生成 preview_template / exported_core_colors / copy_blocks
- [ ] **Step 7**: 验证旧 palette fallback 不报错
- [ ] **Step 8**: 按第 7 节验收 Checklist 验证

---

## 6. 数据库迁移

```sql
-- migrations/012_add_preview_fields.sql
ALTER TABLE palettes 
ADD COLUMN functional_roles JSONB,
ADD COLUMN exported_core_colors JSONB,
ADD COLUMN preview_template JSONB,
ADD COLUMN copy_blocks JSONB;
```

---

## 7. 验收 Checklist

| # | 验收项 |
|---|--------|
| 1 | Palette Card 不再依赖期刊截图 |
| 2 | 4 个 chart_family 可生成原创 preview |
| 3 | 同一 slug 每次生成相同 preview |
| 4 | exported_core_colors 能被 card 统一读取 |
| 5 | 旧 palette 无新字段时不报错 |
| 6 | Detail page 展示 functional roles |
| 7 | Detail page 展示 copy_blocks |
| 8 | Add/Edit Palette 支持 chart_family + 动态 roles 表单 |
| 9 | Browse Palettes 筛选不受影响 |
| 10 | Paper Project 添加 palette 不受影响 |

---

*Phase 1 完成后评估 Phase 2（scatter_grouped, volcano, survival_km, umap_cluster 等）*