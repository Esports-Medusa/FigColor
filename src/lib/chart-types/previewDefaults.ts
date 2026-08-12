import { getChartTemplateDefinition, validatePreviewCaseAgainstRegistry } from './registry'
import type { ChartType } from '@/types/palette'

export interface PreviewDefaults {
  chart_type: ChartType
  template_id: string
  template_version: number
  schema_version: number
  color_roles: Record<string, unknown>
  preview_config: Record<string, unknown>
  seed_strategy: 'fixed'
  seed_value: number
}

export type PreviewDefaultsFailureCode =
  | 'UNSUPPORTED_CHART_TYPE'
  | 'DEFAULT_TEMPLATE_UNAVAILABLE'
  | 'INSUFFICIENT_COLORS'
  | 'GENERATED_DEFAULT_INVALID'

export type PreviewDefaultsResult =
  | { ok: true; value: PreviewDefaults }
  | { ok: false; code: PreviewDefaultsFailureCode; message: string }

export const DEFAULT_PREVIEW_TEMPLATE_IDS: Readonly<Record<ChartType, string>> = {
  bar_error: 'bar_error_v1',
  boxplot_jitter: 'boxplot_jitter_v1',
  line_multiseries: 'line_multiseries_v1',
  heatmap_annotated: 'heatmap_annotated_v1',
  scatter_grouped: 'scatter_grouped_v1',
  violin_distribution: 'violin_distribution_v1'
}

const MINIMUM_COLORS: Readonly<Record<ChartType, number>> = {
  bar_error: 1,
  boxplot_jitter: 1,
  line_multiseries: 1,
  heatmap_annotated: 2,
  scatter_grouped: 1,
  violin_distribution: 1
}

export function createPreviewDefaults(
  chartType: ChartType | string,
  colorIds: readonly string[],
  seedValue: number
): PreviewDefaultsResult {
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_PREVIEW_TEMPLATE_IDS, chartType)) {
    return { ok: false, code: 'UNSUPPORTED_CHART_TYPE', message: `Unsupported chart type: ${chartType}.` }
  }
  if (!Number.isInteger(seedValue) || seedValue < -2147483648 || seedValue > 2147483647) {
    return { ok: false, code: 'GENERATED_DEFAULT_INVALID', message: 'Draft Preview seed must be a signed 32-bit integer.' }
  }
  const typedChartType = chartType as ChartType
  const templateId = DEFAULT_PREVIEW_TEMPLATE_IDS[typedChartType]
  const template = getChartTemplateDefinition(typedChartType, templateId)
  if (!template) {
    return { ok: false, code: 'DEFAULT_TEMPLATE_UNAVAILABLE', message: `Default template is unavailable for ${typedChartType}.` }
  }
  const minimum = MINIMUM_COLORS[typedChartType]
  if (colorIds.length < minimum) {
    return { ok: false, code: 'INSUFFICIENT_COLORS', message: `${typedChartType} requires at least ${minimum} Draft color${minimum === 1 ? '' : 's'}.` }
  }

  const defaults = chartDefaults(typedChartType, colorIds)
  const value: PreviewDefaults = {
    chart_type: typedChartType,
    template_id: template.id,
    template_version: template.templateVersion,
    schema_version: template.schemaVersion,
    color_roles: defaults.roles,
    preview_config: defaults.config,
    seed_strategy: 'fixed',
    seed_value: seedValue
  }
  if (!validatePreviewCaseAgainstRegistry(value).valid) {
    return { ok: false, code: 'GENERATED_DEFAULT_INVALID', message: `Generated defaults failed registry validation for ${typedChartType}.` }
  }
  return { ok: true, value }
}

function chartDefaults(chartType: ChartType, colorIds: readonly string[]) {
  const firstFive = colorIds.slice(0, 5)
  switch (chartType) {
    case 'bar_error':
      return grouped(firstFive, 'fill', ['axis', 'grid', 'text', 'error_bar', 'background'], { orientation: 'vertical', sample_size: 24, error_type: 'sem', data_pattern: 'mixed' })
    case 'boxplot_jitter':
      return grouped(firstFive, 'color', ['axis', 'grid', 'text', 'jitter_point', 'median_line', 'background'], { jitter_density: 'medium', show_outliers: true, y_axis_label: 'Value' })
    case 'line_multiseries':
      return series(firstFive, { point_count: 8, curve_shape: 'mixed', x_axis_label: 'Time', y_axis_label: 'Response' })
    case 'heatmap_annotated':
      return heatmap(colorIds)
    case 'scatter_grouped':
      return grouped(firstFive, 'color', ['axis', 'muted_foreground', 'grid', 'background'], { point_count: 18, data_pattern: 'clusters', point_size: 'medium', point_opacity: 0.78 })
    case 'violin_distribution':
      return grouped(firstFive, 'fill', ['outline', 'median', 'axis', 'grid', 'background'], { sample_count: 32, distribution_shape: 'mixed', bandwidth: 'medium', show_summary: true })
  }
}

function grouped(colorIds: readonly string[], field: string, elements: string[], config: Record<string, unknown>) {
  return {
    roles: {
      groups: colorIds.map((colorId, index) => named(`group_${index + 1}`, `Group ${index + 1}`, field, colorId)),
      elements: defaultElements(elements)
    },
    config
  }
}

function series(colorIds: readonly string[], config: Record<string, unknown>) {
  return {
    roles: {
      series: colorIds.map((colorId, index) => named(`series_${index + 1}`, `Series ${index + 1}`, 'line', colorId)),
      elements: defaultElements(['axis', 'grid', 'text', 'marker_stroke', 'background'])
    },
    config
  }
}

function heatmap(colorIds: readonly string[]) {
  const usable = colorIds.length >= 3 ? colorIds.slice(0, 3) : colorIds.slice(0, 2)
  return {
    roles: {
      scale: {
        type: colorIds.length >= 3 ? 'diverging' : 'sequential',
        stops: usable.map((colorId, index) => ({
          position: index / (usable.length - 1),
          label: index === 0 ? 'Low' : index === usable.length - 1 ? 'High' : 'Mid',
          color: paletteRef(colorId)
        }))
      },
      annotations: [],
      elements: defaultElements(['text', 'grid', 'border', 'background', 'annotation_text'])
    },
    config: { rows: 6, columns: 6, cluster_rows: false, cluster_columns: false, show_row_labels: true, show_column_labels: true, show_values: false, data_pattern: 'mixed' }
  }
}

function named(key: string, label: string, field: string, colorId: string) {
  return { key, label, [field]: paletteRef(colorId) }
}

function paletteRef(colorId: string) {
  return { source: 'palette', color_id: colorId }
}

function defaultElements(keys: string[]) {
  return Object.fromEntries(keys.map((key) => [key, {
    source: 'theme',
    token: key === 'background' ? 'background' : key === 'grid' ? 'grid' : 'foreground'
  }]))
}
