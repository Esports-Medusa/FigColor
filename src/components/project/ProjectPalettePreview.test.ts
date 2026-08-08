import { createPaletteChartPreviewModel, selectPalettePreviewCase } from '@/components/palettes/PaletteChartPreview.logic'
import { resolveProjectPalettePreview } from './ProjectPalettePreview.logic'
import type { ChartType, PalettePreviewCase, RawPaletteDTO } from '@/types/palette'
import type { ProjectPalette } from '@/types/project'

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

const colors = [
  { id: 'blue', hex: '#2458A6', rgb: [36, 88, 166], label: 'Blue', order: 0 },
  { id: 'orange', hex: '#D55E00', rgb: [213, 94, 0], label: 'Orange', order: 1 },
  { id: 'green', hex: '#009E73', rgb: [0, 158, 115], label: 'Green', order: 2 }
]
const theme = (token: string) => ({ source: 'theme', token })
const color = (colorId: string) => ({ source: 'palette', color_id: colorId })

function previewCase(chartType: ChartType): PalettePreviewCase {
  const common = {
    id: `preview-${chartType}`,
    palette_id: 'base-palette',
    chart_type: chartType,
    template_id: `${chartType}_v1`,
    template_version: 1,
    schema_version: 1,
    seed_strategy: 'stable_id' as const,
    seed_value: null,
    is_primary: true,
    status: 'published' as const
  }
  if (chartType === 'bar_error') return {
    ...common,
    color_roles: {
      groups: colors.map((item, index) => ({ key: `g${index}`, label: item.label, fill: color(item.id) })),
      elements: { axis: theme('foreground'), grid: theme('grid'), text: theme('foreground'), error_bar: theme('foreground'), background: theme('background') }
    },
    preview_config: { orientation: 'vertical', sample_size: 24, error_type: 'sem', data_pattern: 'mixed' }
  }
  if (chartType === 'heatmap_annotated') return {
    ...common,
    color_roles: {
      scale: { type: 'sequential', stops: [{ position: 0, label: 'Low', color: color('blue') }, { position: 1, label: 'High', color: color('orange') }] },
      annotations: [],
      elements: { text: theme('foreground'), border: theme('grid'), grid: theme('grid'), background: theme('background'), annotation_text: theme('foreground') }
    },
    preview_config: { rows: 6, columns: 6, cluster_rows: false, cluster_columns: false, show_row_labels: true, show_column_labels: true, show_values: false, data_pattern: 'mixed' }
  }
  if (chartType === 'scatter_grouped') return {
    ...common,
    color_roles: {
      groups: colors.map((item, index) => ({ key: `g${index}`, label: item.label, color: color(item.id) })),
      elements: { axis: theme('foreground'), muted_foreground: theme('muted_foreground'), grid: theme('grid'), background: theme('background') }
    },
    preview_config: { point_count: 18, data_pattern: 'clusters', point_size: 'medium', point_opacity: 0.8 }
  }
  return {
    ...common,
    color_roles: {
      groups: colors.map((item, index) => ({ key: `g${index}`, label: item.label, fill: color(item.id) })),
      elements: { outline: theme('foreground'), median: theme('foreground'), axis: theme('foreground'), grid: theme('grid'), background: theme('background') }
    },
    preview_config: { sample_count: 32, distribution_shape: 'mixed', bandwidth: 'medium', show_summary: true }
  }
}

function projectPalette(chartType: ChartType): ProjectPalette {
  const primary = previewCase(chartType)
  const previewPalette = {
    id: 'base-palette',
    slug: 'base-palette',
    name: 'Base Palette',
    colors,
    color_count: colors.length,
    type: 'categorical',
    chart_types: [chartType],
    chart_applicability: [{ chart_type: chartType, suitability: 'best_fit', source: 'curated' }],
    journal_style: [],
    discipline: [],
    use_case: [],
    avoid_case: [],
    tags: [],
    status: 'published',
    source_type: 'curated',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    primary_preview_case: primary
  } as RawPaletteDTO
  return {
    id: 'project-relationship',
    projectId: 'project-1',
    name: 'Project Palette',
    basePaletteId: 'base-palette',
    isDefault: false,
    roles: [],
    previewPalette,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z'
  }
}

for (const chartType of ['bar_error', 'heatmap_annotated', 'scatter_grouped', 'violin_distribution'] as const) {
  const canonical = resolveProjectPalettePreview(projectPalette(chartType))
  expect(canonical?.id === 'base-palette', `${chartType} should resolve the base palette identity`)
  const selected = canonical ? selectPalettePreviewCase(canonical, undefined, false, true) : null
  expect(selected?.id === `preview-${chartType}`, `${chartType} should select the canonical published primary case`)
  expect(canonical ? createPaletteChartPreviewModel(canonical, selected).state === 'svg' : false, `${chartType} should render through the shared SVG pipeline`)
}

const missing = projectPalette('bar_error')
missing.previewPalette = undefined
missing.roles = []
expect(resolveProjectPalettePreview(missing) === null, 'missing base data should not crash')

const privateDefault = projectPalette('bar_error')
privateDefault.basePaletteId = undefined
privateDefault.previewPalette = undefined
privateDefault.isDefault = true
privateDefault.roles = [{
  id: 'role-1', paletteId: privateDefault.id, key: 'control', label: 'Control',
  color: '#2458A6', roleType: 'semantic', order: 0,
  createdAt: privateDefault.createdAt, updatedAt: privateDefault.updatedAt
}]
const fallback = resolveProjectPalettePreview(privateDefault)
expect(fallback?.id === privateDefault.id, 'private default should keep project identity for fallback')
expect(fallback ? createPaletteChartPreviewModel(fallback, null).state !== 'svg' : false, 'private default without a case should fall back safely')
