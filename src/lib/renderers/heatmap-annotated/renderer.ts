import { createDeterministicRandom, type DeterministicRandom } from '@/lib/deterministic/random'
import type { ChartRenderer, PreviewRendererInput, PreviewRenderResult } from '../types'

const WIDTH = 360
const HEIGHT = 220
const MARGIN = { top: 24, right: 68, bottom: 38, left: 54 }
const PLOT_WIDTH = WIDTH - MARGIN.left - MARGIN.right
const PLOT_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom
const requiredElementColorPaths = [
  'color_roles.elements.text',
  'color_roles.elements.grid',
  'color_roles.elements.border',
  'color_roles.elements.background',
  'color_roles.elements.annotation_text'
] as const

type HeatmapPattern = 'two_clusters' | 'three_clusters' | 'gradient' | 'mixed'
type HeatmapScaleType = 'sequential' | 'diverging'

interface HeatmapConfig {
  rows: number
  columns: number
  cluster_rows: boolean
  cluster_columns: boolean
  show_row_labels: boolean
  show_column_labels: boolean
  show_values: boolean
  data_pattern: HeatmapPattern
}

interface ScaleStop {
  position: number
  hex: string
}

export const heatmapAnnotatedRenderer: ChartRenderer = {
  chartType: 'heatmap_annotated',
  templateId: 'heatmap_annotated_v1',
  templateVersion: 1,
  schemaVersion: 1,
  render(input: PreviewRendererInput): PreviewRenderResult {
    const config = readConfig(input.previewConfig)
    if (!config) {
      return invalidResult(
        'INVALID_HEATMAP_CONFIG',
        'heatmap_annotated renderer requires rows and columns between 4 and 8 plus supported display flags.'
      )
    }

    const scale = readScale(input.colorRoles, input.resolvedColors)
    if (!scale.ok) {
      return scale.result
    }

    const elementColors = readRequiredElementColors(input.resolvedColors)
    if (!elementColors.ok) {
      return elementColors.result
    }

    const textColor = elementColors.colors['color_roles.elements.text']
    const gridColor = elementColors.colors['color_roles.elements.grid']
    const borderColor = elementColors.colors['color_roles.elements.border']
    const backgroundColor = elementColors.colors['color_roles.elements.background']
    const annotationTextColor = elementColors.colors['color_roles.elements.annotation_text']

    const random = createDeterministicRandom(input.seed)
    const matrix = generateMatrix(config, random)
    const rowOrder = config.cluster_rows ? sortedIndicesByMean(matrix, 'row') : matrix.map((_, index) => index)
    const columnOrder = config.cluster_columns ? sortedIndicesByMean(matrix, 'column') : matrix[0].map((_, index) => index)
    const cellSize = Math.min(PLOT_WIDTH / config.columns, PLOT_HEIGHT / config.rows)
    const plotWidth = cellSize * config.columns
    const plotHeight = cellSize * config.rows
    const labelRows = rowOrder.map((rowIndex) => `R${rowIndex + 1}`)
    const labelColumns = columnOrder.map((columnIndex) => `C${columnIndex + 1}`)
    const legendId = `heatmap-scale-${input.seed}`

    const cellsMarkup = rowOrder.map((rowIndex, visibleRow) =>
      columnOrder.map((columnIndex, visibleColumn) => {
        const value = matrix[rowIndex][columnIndex]
        const normalized = normalizeValue(value)
        const fill = interpolateColorScale(normalized, scale.stops)
        const x = MARGIN.left + visibleColumn * cellSize
        const y = MARGIN.top + visibleRow * cellSize
        const annotation = config.show_values
          ? `<text class="heatmap-annotation" x="${round(x + cellSize / 2)}" y="${round(y + cellSize / 2 + 3)}" text-anchor="middle" fill="${annotationTextColor}" font-size="8">${formatValue(value)}</text>`
          : ''
        return `<g class="heatmap-cell" data-row-index="${rowIndex}" data-column-index="${columnIndex}" data-value="${round(value)}"><rect x="${round(x)}" y="${round(y)}" width="${round(cellSize)}" height="${round(cellSize)}" fill="${fill}" stroke="${gridColor}" stroke-width="0.6"/>${annotation}</g>`
      }).join('')
    ).join('')

    const rowLabels = config.show_row_labels
      ? labelRows.map((label, index) =>
          `<text class="heatmap-row-label" x="${MARGIN.left - 8}" y="${round(MARGIN.top + index * cellSize + cellSize / 2 + 3)}" text-anchor="end" fill="${textColor}" font-size="9">${escapeSvg(label)}</text>`
        ).join('')
      : ''
    const columnLabels = config.show_column_labels
      ? labelColumns.map((label, index) =>
          `<text class="heatmap-column-label" x="${round(MARGIN.left + index * cellSize + cellSize / 2)}" y="${MARGIN.top + plotHeight + 14}" text-anchor="middle" fill="${textColor}" font-size="9">${escapeSvg(label)}</text>`
        ).join('')
      : ''
    const legendMarkup = renderLegend(legendId, scale.stops, textColor, borderColor)

    return {
      ok: true,
      kind: 'svg',
      width: WIDTH,
      height: HEIGHT,
      markup: `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="Annotated heatmap preview"><defs><linearGradient id="${legendId}" x1="0%" y1="100%" x2="0%" y2="0%">${scale.stops.map((stop) => `<stop offset="${round(stop.position * 100)}%" stop-color="${stop.hex}"/>`).join('')}</linearGradient></defs><rect width="${WIDTH}" height="${HEIGHT}" fill="${backgroundColor}"/><g class="heatmap-matrix" data-pattern="${config.data_pattern}" data-row-order="${rowOrder.join(',')}" data-column-order="${columnOrder.join(',')}">${cellsMarkup}<rect x="${MARGIN.left}" y="${MARGIN.top}" width="${round(plotWidth)}" height="${round(plotHeight)}" fill="none" stroke="${borderColor}" stroke-width="1.2"/></g>${rowLabels}${columnLabels}${legendMarkup}</svg>`
    }
  }
}

export function interpolateColorScale(value: number, stops: readonly ScaleStop[]): string {
  const clamped = clamp(value, 0, 1)
  if (clamped <= stops[0].position) {
    return stops[0].hex
  }
  if (clamped >= stops[stops.length - 1].position) {
    return stops[stops.length - 1].hex
  }

  const upperIndex = stops.findIndex((stop) => stop.position >= clamped)
  const lower = stops[upperIndex - 1]
  const upper = stops[upperIndex]
  if (clamped === upper.position) {
    return upper.hex
  }

  const ratio = (clamped - lower.position) / (upper.position - lower.position)
  const lowerRgb = parseHex(lower.hex)
  const upperRgb = parseHex(upper.hex)
  return toHex([
    interpolateChannel(lowerRgb[0], upperRgb[0], ratio),
    interpolateChannel(lowerRgb[1], upperRgb[1], ratio),
    interpolateChannel(lowerRgb[2], upperRgb[2], ratio)
  ])
}

function generateMatrix(config: HeatmapConfig, random: DeterministicRandom): number[][] {
  return Array.from({ length: config.rows }, (_, row) =>
    Array.from({ length: config.columns }, (_, column) => {
      const rowNorm = config.rows === 1 ? 0 : row / (config.rows - 1)
      const columnNorm = config.columns === 1 ? 0 : column / (config.columns - 1)
      const noise = random.float(-0.08, 0.08)
      return round(clamp(patternValue(config.data_pattern, rowNorm, columnNorm, row, column, config) + noise, -1, 1))
    })
  )
}

function patternValue(
  pattern: HeatmapPattern,
  rowNorm: number,
  columnNorm: number,
  row: number,
  column: number,
  config: HeatmapConfig
): number {
  if (pattern === 'two_clusters') {
    const rowHalf = row < config.rows / 2
    const columnHalf = column < config.columns / 2
    return rowHalf === columnHalf ? 0.72 : -0.58
  }
  if (pattern === 'three_clusters') {
    const rowBand = Math.min(2, Math.floor(rowNorm * 3))
    const columnBand = Math.min(2, Math.floor(columnNorm * 3))
    return rowBand === columnBand ? 0.78 - rowBand * 0.18 : -0.62 + Math.abs(rowBand - columnBand) * 0.14
  }
  if (pattern === 'gradient') {
    return -0.85 + (rowNorm * 0.48 + columnNorm * 0.52) * 1.7
  }

  const block = row < config.rows / 2 && column < config.columns / 2 ? 0.5 : -0.3
  const gradient = -0.25 + (rowNorm * 0.35 + columnNorm * 0.65) * 0.8
  return block + gradient
}

function readConfig(previewConfig: unknown): HeatmapConfig | null {
  if (!isRecord(previewConfig)) {
    return null
  }
  if (
    Number.isInteger(previewConfig.rows) &&
    Number(previewConfig.rows) >= 4 &&
    Number(previewConfig.rows) <= 8 &&
    Number.isInteger(previewConfig.columns) &&
    Number(previewConfig.columns) >= 4 &&
    Number(previewConfig.columns) <= 8 &&
    typeof previewConfig.cluster_rows === 'boolean' &&
    typeof previewConfig.cluster_columns === 'boolean' &&
    typeof previewConfig.show_row_labels === 'boolean' &&
    typeof previewConfig.show_column_labels === 'boolean' &&
    typeof previewConfig.show_values === 'boolean' &&
    isPattern(previewConfig.data_pattern)
  ) {
    return {
      rows: Number(previewConfig.rows),
      columns: Number(previewConfig.columns),
      cluster_rows: previewConfig.cluster_rows,
      cluster_columns: previewConfig.cluster_columns,
      show_row_labels: previewConfig.show_row_labels,
      show_column_labels: previewConfig.show_column_labels,
      show_values: previewConfig.show_values,
      data_pattern: previewConfig.data_pattern
    }
  }
  return null
}

function readScale(colorRoles: unknown, resolvedColors: Record<string, string>):
  | { ok: true; stops: ScaleStop[]; scaleType: HeatmapScaleType }
  | { ok: false; result: PreviewRenderResult } {
  if (!isRecord(colorRoles) || !isRecord(colorRoles.scale)) {
    return { ok: false, result: invalidResult('INVALID_HEATMAP_SCALE', 'Heatmap scale role must be an object.') }
  }
  const scale = colorRoles.scale
  if (scale.type !== 'sequential' && scale.type !== 'diverging') {
    return { ok: false, result: invalidResult('INVALID_HEATMAP_SCALE', 'Heatmap scale type must be sequential or diverging.') }
  }
  if (!Array.isArray(scale.stops)) {
    return { ok: false, result: invalidResult('INVALID_HEATMAP_SCALE', 'Heatmap scale stops must be an array.') }
  }
  if ((scale.type === 'sequential' && scale.stops.length < 2) || (scale.type === 'diverging' && scale.stops.length < 3)) {
    return { ok: false, result: invalidResult('INVALID_HEATMAP_SCALE', 'Heatmap scale has too few stops.') }
  }

  const stops: ScaleStop[] = []
  for (let index = 0; index < scale.stops.length; index += 1) {
    const stop = scale.stops[index]
    if (!isRecord(stop) || typeof stop.position !== 'number' || !Number.isFinite(stop.position) || stop.position < 0 || stop.position > 1) {
      return { ok: false, result: invalidResult('INVALID_HEATMAP_SCALE', 'Heatmap scale stop positions must be finite values in [0, 1].') }
    }
    if (index > 0 && stop.position <= stops[index - 1].position) {
      return { ok: false, result: invalidResult('INVALID_HEATMAP_SCALE', 'Heatmap scale stop positions must be strictly increasing.') }
    }
    const path = `color_roles.scale.stops[${index}].color`
    const hex = resolvedColors[path]
    if (!hex) {
      return { ok: false, result: invalidResult('MISSING_RESOLVED_COLOR', `Missing resolved color for ${path}.`) }
    }
    if (!isHexColor(hex)) {
      return { ok: false, result: invalidResult('INVALID_HEATMAP_SCALE', `Resolved heatmap scale color is not a valid hex color at ${path}.`) }
    }
    stops.push({ position: stop.position, hex: normalizeHex(hex) })
  }

  return { ok: true, stops, scaleType: scale.type }
}

function readRequiredElementColors(resolvedColors: Record<string, string>):
  | { ok: true; colors: Record<typeof requiredElementColorPaths[number], string> }
  | { ok: false; result: PreviewRenderResult } {
  const missingPath = requiredElementColorPaths.find((path) => !resolvedColors[path])
  if (missingPath) {
    return {
      ok: false,
      result: invalidResult('MISSING_RESOLVED_COLOR', `Missing resolved color for ${missingPath}.`)
    }
  }

  return {
    ok: true,
    colors: Object.fromEntries(
      requiredElementColorPaths.map((path) => [path, resolvedColors[path]])
    ) as Record<typeof requiredElementColorPaths[number], string>
  }
}

function sortedIndicesByMean(matrix: number[][], axis: 'row' | 'column'): number[] {
  const count = axis === 'row' ? matrix.length : matrix[0].length
  return Array.from({ length: count }, (_, index) => index)
    .map((index) => ({
      index,
      mean: axis === 'row'
        ? mean(matrix[index])
        : mean(matrix.map((row) => row[index]))
    }))
    .sort((left, right) => left.mean === right.mean ? left.index - right.index : left.mean - right.mean)
    .map((entry) => entry.index)
}

function renderLegend(legendId: string, stops: readonly ScaleStop[], textColor: string, borderColor: string): string {
  const x = WIDTH - 42
  const y = MARGIN.top
  const height = 92
  const width = 10
  const minLabel = 'min'
  const maxLabel = 'max'
  const middle = stops.find((stop) => Math.abs(stop.position - 0.5) < 0.001)
  const midpoint = middle
    ? `<line x1="${x - 3}" y1="${round(y + height / 2)}" x2="${x + width + 3}" y2="${round(y + height / 2)}" stroke="${borderColor}" stroke-width="1"/>`
    : ''
  return `<g class="heatmap-legend"><rect x="${x}" y="${y}" width="${width}" height="${height}" fill="url(#${legendId})" stroke="${borderColor}" stroke-width="1"/>${midpoint}<text x="${x + width + 6}" y="${y + 7}" fill="${textColor}" font-size="9">${maxLabel}</text><text x="${x + width + 6}" y="${y + height}" fill="${textColor}" font-size="9">${minLabel}</text></g>`
}

function isPattern(value: unknown): value is HeatmapPattern {
  return value === 'two_clusters' || value === 'three_clusters' || value === 'gradient' || value === 'mixed'
}

function normalizeValue(value: number): number {
  return (clamp(value, -1, 1) + 1) / 2
}

function parseHex(hex: string): [number, number, number] {
  const normalized = normalizeHex(hex).slice(1)
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16)
  ]
}

function toHex(rgb: [number, number, number]): string {
  return `#${rgb.map((channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

function interpolateChannel(left: number, right: number, ratio: number): number {
  return left + (right - left) * ratio
}

function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value)
}

function normalizeHex(hex: string): string {
  return hex.toUpperCase()
}

function formatValue(value: number): string {
  return value.toFixed(1)
}

function invalidResult(code: string, message: string): PreviewRenderResult {
  return {
    ok: false,
    kind: 'invalid',
    code,
    message
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function escapeSvg(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
