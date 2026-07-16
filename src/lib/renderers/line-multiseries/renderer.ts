import { createDeterministicRandom, type DeterministicRandom } from '@/lib/deterministic/random'
import type { ChartRenderer, PreviewRendererInput, PreviewRenderResult } from '../types'

const WIDTH = 360
const HEIGHT = 220
const MARGIN = { top: 20, right: 24, bottom: 42, left: 46 }
const PLOT_WIDTH = WIDTH - MARGIN.left - MARGIN.right
const PLOT_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom
const VALUE_MIN = 0
const VALUE_MAX = 100
const requiredElementColorPaths = [
  'color_roles.elements.axis',
  'color_roles.elements.grid',
  'color_roles.elements.text',
  'color_roles.elements.marker_stroke',
  'color_roles.elements.background'
] as const

type CurveShape = 'increasing' | 'decreasing' | 'sigmoid' | 'peak' | 'mixed'

interface LineSeriesRole {
  key: string
  label: string
  line: unknown
}

interface LineConfig {
  point_count: number
  curve_shape: CurveShape
}

interface GeneratedSeries {
  key: string
  label: string
  values: number[]
  shape: CurveShape
}

export const lineMultiseriesRenderer: ChartRenderer = {
  chartType: 'line_multiseries',
  templateId: 'line_multiseries_v1',
  templateVersion: 1,
  schemaVersion: 1,
  render(input: PreviewRendererInput): PreviewRenderResult {
    const seriesRoles = readSeries(input.colorRoles)
    if (seriesRoles.length < 2 || seriesRoles.length > 5) {
      return invalidResult(
        'INVALID_LINE_SERIES',
        'line_multiseries renderer requires 2 to 5 series color roles.'
      )
    }

    const config = readConfig(input.previewConfig)
    if (!config) {
      return invalidResult(
        'INVALID_LINE_CONFIG',
        'line_multiseries renderer requires point_count between 6 and 12 and a supported curve_shape.'
      )
    }

    const seriesColors = seriesRoles.map((_, index) => input.resolvedColors[`color_roles.series[${index}].line`])
    const missingSeriesColorIndex = seriesColors.findIndex((color) => !color)
    if (missingSeriesColorIndex >= 0) {
      return invalidResult(
        'MISSING_RESOLVED_COLOR',
        `Missing resolved color for color_roles.series[${missingSeriesColorIndex}].line.`
      )
    }

    const elementColors = readRequiredElementColors(input.resolvedColors)
    if (!elementColors.ok) {
      return elementColors.result
    }

    const axisColor = elementColors.colors['color_roles.elements.axis']
    const gridColor = elementColors.colors['color_roles.elements.grid']
    const textColor = elementColors.colors['color_roles.elements.text']
    const markerStrokeColor = elementColors.colors['color_roles.elements.marker_stroke']
    const backgroundColor = elementColors.colors['color_roles.elements.background']

    const random = createDeterministicRandom(input.seed)
    const generated = seriesRoles.map((series, index) =>
      generateSeries(series, config, index, random)
    )
    const xScale = (index: number) =>
      MARGIN.left + (index / Math.max(1, config.point_count - 1)) * PLOT_WIDTH
    const yScale = (value: number) =>
      MARGIN.top + PLOT_HEIGHT - ((value - VALUE_MIN) / (VALUE_MAX - VALUE_MIN)) * PLOT_HEIGHT
    const gridTicks = [0, 25, 50, 75, 100]

    const gridMarkup = gridTicks.map((tick) => {
      const y = round(yScale(tick))
      return `<g><line x1="${MARGIN.left}" y1="${y}" x2="${WIDTH - MARGIN.right}" y2="${y}" stroke="${gridColor}" stroke-width="1" opacity="0.62"/><text x="${MARGIN.left - 10}" y="${y + 4}" text-anchor="end" fill="${textColor}" font-size="10">${tick}</text></g>`
    }).join('')
    const xTickMarkup = createXTicks(config.point_count).map((index) => {
      const x = round(xScale(index))
      return `<text x="${x}" y="${HEIGHT - 18}" text-anchor="middle" fill="${textColor}" font-size="10">${index + 1}</text>`
    }).join('')
    const seriesMarkup = generated.map((series, seriesIndex) => {
      const points = series.values.map((value, pointIndex) => ({
        x: xScale(pointIndex),
        y: yScale(value),
        value
      }))
      const path = points.map((point, pointIndex) =>
        `${pointIndex === 0 ? 'M' : 'L'} ${round(point.x)} ${round(point.y)}`
      ).join(' ')
      const markerMarkup = points.map((point) =>
        `<circle cx="${round(point.x)}" cy="${round(point.y)}" r="2.6" fill="${seriesColors[seriesIndex]}" stroke="${markerStrokeColor}" stroke-width="1"/>`
      ).join('')
      const labelPoint = points[points.length - 1]

      return `<g class="line-series" data-series-key="${escapeSvg(series.key)}" data-shape="${series.shape}" data-values="${series.values.map(round).join(',')}" data-first-value="${round(series.values[0])}" data-last-value="${round(series.values[series.values.length - 1])}" data-min-value="${round(Math.min(...series.values))}" data-max-value="${round(Math.max(...series.values))}" data-mid-value="${round(series.values[Math.floor(series.values.length / 2)])}"><path d="${path}" fill="none" stroke="${seriesColors[seriesIndex]}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>${markerMarkup}<text x="${round(Math.min(WIDTH - MARGIN.right, labelPoint.x + 5))}" y="${round(labelPoint.y + 3)}" fill="${textColor}" font-size="9">${escapeSvg(series.label)}</text></g>`
    }).join('')

    return {
      ok: true,
      kind: 'svg',
      width: WIDTH,
      height: HEIGHT,
      markup: `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="Line chart preview"><rect width="${WIDTH}" height="${HEIGHT}" fill="${backgroundColor}"/>${gridMarkup}<line x1="${MARGIN.left}" y1="${MARGIN.top}" x2="${MARGIN.left}" y2="${MARGIN.top + PLOT_HEIGHT}" stroke="${axisColor}" stroke-width="1.5"/><line x1="${MARGIN.left}" y1="${MARGIN.top + PLOT_HEIGHT}" x2="${WIDTH - MARGIN.right}" y2="${MARGIN.top + PLOT_HEIGHT}" stroke="${axisColor}" stroke-width="1.5"/>${xTickMarkup}${seriesMarkup}</svg>`
    }
  }
}

function generateSeries(
  role: LineSeriesRole,
  config: LineConfig,
  seriesIndex: number,
  random: DeterministicRandom
): GeneratedSeries {
  const shape = config.curve_shape === 'mixed'
    ? (['increasing', 'decreasing', 'sigmoid', 'peak'][seriesIndex % 4] as CurveShape)
    : config.curve_shape
  const offset = random.float(-5, 5) + (seriesIndex - 1) * 4
  const amplitude = random.float(58, 74)
  const baseline = random.float(12, 20)
  const values = Array.from({ length: config.point_count }, (_, pointIndex) => {
    const x = pointIndex / Math.max(1, config.point_count - 1)
    const normalized = curveValue(shape, x)
    const noise = random.float(-3, 3)
    return round(clamp(baseline + normalized * amplitude + offset + noise, 4, 96))
  })

  return {
    key: role.key,
    label: role.label,
    values,
    shape
  }
}

function curveValue(shape: CurveShape, x: number): number {
  if (shape === 'increasing') {
    return 0.12 + 0.78 * x
  }
  if (shape === 'decreasing') {
    return 0.9 - 0.76 * x
  }
  if (shape === 'sigmoid') {
    return 1 / (1 + Math.exp(-8 * (x - 0.5)))
  }
  if (shape === 'peak') {
    return 0.18 + 0.76 * Math.max(0, 1 - Math.abs(x - 0.5) * 2)
  }
  return x
}

function readSeries(colorRoles: unknown): LineSeriesRole[] {
  if (!isRecord(colorRoles) || !Array.isArray(colorRoles.series)) {
    return []
  }

  return colorRoles.series.filter(isSeriesRole)
}

function isSeriesRole(value: unknown): value is LineSeriesRole {
  return isRecord(value) &&
    typeof value.key === 'string' &&
    typeof value.label === 'string' &&
    Object.prototype.hasOwnProperty.call(value, 'line')
}

function readConfig(previewConfig: unknown): LineConfig | null {
  if (!isRecord(previewConfig)) {
    return null
  }
  if (
    Number.isInteger(previewConfig.point_count) &&
    Number(previewConfig.point_count) >= 6 &&
    Number(previewConfig.point_count) <= 12 &&
    isCurveShape(previewConfig.curve_shape)
  ) {
    return {
      point_count: Number(previewConfig.point_count),
      curve_shape: previewConfig.curve_shape
    }
  }
  return null
}

function isCurveShape(value: unknown): value is CurveShape {
  return value === 'increasing' ||
    value === 'decreasing' ||
    value === 'sigmoid' ||
    value === 'peak' ||
    value === 'mixed'
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

function createXTicks(pointCount: number): number[] {
  const middle = Math.floor((pointCount - 1) / 2)
  const last = pointCount - 1
  return middle === 0 || middle === last ? [0, last] : [0, middle, last]
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
