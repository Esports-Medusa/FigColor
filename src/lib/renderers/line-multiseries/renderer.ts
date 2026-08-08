import { createDeterministicRandom, type DeterministicRandom } from '@/lib/deterministic/random'
import { fnv1a32 } from '@/lib/deterministic/seed'
import { extractResolvedDataRoles } from '../dataRoles'
import type { ChartRenderer, PreviewRendererInput, PreviewRenderResult } from '../types'

const WIDTH = 360
const HEIGHT = 220
const MARGIN = { top: 20, right: 24, bottom: 42, left: 46 }
const PLOT_WIDTH = WIDTH - MARGIN.left - MARGIN.right
const PLOT_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom
const VALUE_MIN = 0
const VALUE_MAX = 100
const DEFAULT_COLORS = {
  axis: '#111827',
  grid: '#D1D5DB',
  text: '#6B7280',
  markerStroke: '#FFFFFF',
  referenceLine: '#6B7280',
  background: '#FFFFFF'
} as const

type CurveShape = 'increasing' | 'decreasing' | 'sigmoid' | 'peak' | 'mixed'

interface LineConfig {
  point_count: number
  curve_shape: CurveShape
  x_axis_label?: string
  y_axis_label?: string
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
    const dataRoles = extractResolvedDataRoles(input.colorRoles, input.resolvedColors, {
      collection: 'series',
      colorField: 'line'
    })
    if (!dataRoles.ok) {
      return invalidResult(
        dataRoles.code,
        dataRoles.message
      )
    }
    const seriesRoles = dataRoles.roles

    const config = readConfig(input.previewConfig)
    if (!config) {
      return invalidResult(
        'INVALID_LINE_CONFIG',
        'line_multiseries renderer requires point_count between 6 and 12 and a supported curve_shape.'
      )
    }

    const axisColor = readElementColor(input.resolvedColors, ['axis'], DEFAULT_COLORS.axis)
    const gridColor = readElementColor(input.resolvedColors, ['grid'], DEFAULT_COLORS.grid)
    const textColor = readElementColor(input.resolvedColors, ['text'], DEFAULT_COLORS.text)
    const markerStrokeColor = readElementColor(input.resolvedColors, ['marker_stroke'], DEFAULT_COLORS.markerStroke)
    const backgroundColor = readElementColor(input.resolvedColors, ['background'], DEFAULT_COLORS.background)
    const referenceLineColor = readElementColor(input.resolvedColors, ['reference_line'], DEFAULT_COLORS.referenceLine)

    const generated = seriesRoles.map((series, index) =>
      generateSeries(
        series,
        config,
        index,
        createDeterministicRandom(fnv1a32(`${input.seed}\u001fline\u001f${series.key}`))
      )
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
    const axisLabelMarkup = [
      config.x_axis_label ? `<text x="${round(MARGIN.left + PLOT_WIDTH / 2)}" y="${HEIGHT - 4}" text-anchor="middle" fill="${textColor}" font-size="9">${escapeSvg(config.x_axis_label)}</text>` : '',
      config.y_axis_label ? `<text x="14" y="${round(MARGIN.top + PLOT_HEIGHT / 2)}" text-anchor="middle" fill="${textColor}" font-size="9" transform="rotate(-90 14 ${round(MARGIN.top + PLOT_HEIGHT / 2)})">${escapeSvg(config.y_axis_label)}</text>` : ''
    ].join('')
    const referenceLineMarkup = input.resolvedColors['color_roles.elements.reference_line']
      ? `<line class="reference-line" x1="${MARGIN.left}" y1="${round(yScale(50))}" x2="${WIDTH - MARGIN.right}" y2="${round(yScale(50))}" stroke="${referenceLineColor}" stroke-width="1" stroke-dasharray="4 3" opacity="0.72"/>`
      : ''
    const seriesMarkup = generated.map((series, seriesIndex) => {
      const points = series.values.map((value, pointIndex) => ({
        x: xScale(pointIndex),
        y: yScale(value),
        value
      }))
      const path = points.map((point, pointIndex) =>
        `${pointIndex === 0 ? 'M' : 'L'} ${round(point.x)} ${round(point.y)}`
      ).join(' ')
      const bandColor = input.resolvedColors[`color_roles.series[${seriesIndex}].confidence_band`]
      const bandMarkup = bandColor ? renderConfidenceBand(points, bandColor) : ''
      const markerColor = input.resolvedColors[`color_roles.series[${seriesIndex}].marker`]
      const markerMarkup = markerColor
        ? points.map((point) =>
            `<circle class="line-marker" cx="${round(point.x)}" cy="${round(point.y)}" r="2.6" fill="${markerColor}" stroke="${markerStrokeColor}" stroke-width="1"/>`
          ).join('')
        : ''
      return `<g class="line-series" data-series-key="${escapeSvg(series.key)}" data-shape="${series.shape}" data-values="${series.values.map(round).join(',')}" data-first-value="${round(series.values[0])}" data-last-value="${round(series.values[series.values.length - 1])}" data-min-value="${round(Math.min(...series.values))}" data-max-value="${round(Math.max(...series.values))}" data-mid-value="${round(series.values[Math.floor(series.values.length / 2)])}">${bandMarkup}<path class="line-data-mark" d="${path}" fill="none" stroke="${seriesRoles[seriesIndex].color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>${markerMarkup}</g>`
    }).join('')
    const legendCellWidth = PLOT_WIDTH / seriesRoles.length
    const legendMarkup = seriesRoles.map((series, index) => {
      const centerX = MARGIN.left + legendCellWidth * index + legendCellWidth / 2
      const label = escapeSvg(fitLabel(series.label, legendCellWidth))
      return `<g class="line-legend-item"><line x1="${round(centerX - 10)}" y1="10" x2="${round(centerX - 2)}" y2="10" stroke="${series.color}" stroke-width="2"/><text x="${round(centerX + 1)}" y="13" text-anchor="start" fill="${textColor}" font-size="7.5">${label}</text></g>`
    }).join('')

    return {
      ok: true,
      kind: 'svg',
      width: WIDTH,
      height: HEIGHT,
      markup: `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="Line chart preview"><rect width="${WIDTH}" height="${HEIGHT}" fill="${backgroundColor}"/>${legendMarkup}${gridMarkup}${referenceLineMarkup}<line x1="${MARGIN.left}" y1="${MARGIN.top}" x2="${MARGIN.left}" y2="${MARGIN.top + PLOT_HEIGHT}" stroke="${axisColor}" stroke-width="1.5"/><line x1="${MARGIN.left}" y1="${MARGIN.top + PLOT_HEIGHT}" x2="${WIDTH - MARGIN.right}" y2="${MARGIN.top + PLOT_HEIGHT}" stroke="${axisColor}" stroke-width="1.5"/>${xTickMarkup}${axisLabelMarkup}${seriesMarkup}</svg>`
    }
  }
}

function generateSeries(
  role: { key: string; label: string },
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
      curve_shape: previewConfig.curve_shape,
      x_axis_label: typeof previewConfig.x_axis_label === 'string' ? previewConfig.x_axis_label : undefined,
      y_axis_label: typeof previewConfig.y_axis_label === 'string' ? previewConfig.y_axis_label : undefined
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

function readElementColor(resolvedColors: Record<string, string>, keys: readonly string[], fallback: string): string {
  return keys.map((key) => resolvedColors[`color_roles.elements.${key}`]).find(Boolean) ?? fallback
}

function createXTicks(pointCount: number): number[] {
  const middle = Math.floor((pointCount - 1) / 2)
  const last = pointCount - 1
  return middle === 0 || middle === last ? [0, last] : [0, middle, last]
}

function fitLabel(label: string, width: number): string {
  const maxCharacters = Math.min(18, Math.max(4, Math.floor((width - 13) / 4.3)))
  return label.length <= maxCharacters ? label : `${label.slice(0, maxCharacters - 1)}…`
}

function renderConfidenceBand(points: Array<{ x: number; y: number }>, color: string): string {
  const upper = points.map((point, index) => ({
    x: point.x,
    y: point.y - (5 + (index % 2) * 1.2)
  }))
  const lower = [...points].reverse().map((point, index) => ({
    x: point.x,
    y: point.y + (5 + (index % 2) * 1.2)
  }))
  const path = [...upper, ...lower].map((point, index) =>
    `${index === 0 ? 'M' : 'L'} ${round(point.x)} ${round(point.y)}`
  ).join(' ')
  return `<path class="confidence-band" d="${path} Z" fill="${color}" opacity="0.16"/>`
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
