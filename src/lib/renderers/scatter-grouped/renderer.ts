import { createDeterministicRandom } from '@/lib/deterministic/random'
import { fnv1a32 } from '@/lib/deterministic/seed'
import { extractResolvedDataRoles } from '../dataRoles'
import type { ChartRenderer, PreviewRendererInput, PreviewRenderResult } from '../types'

const WIDTH = 360
const HEIGHT = 220
const MARGIN = { top: 18, right: 24, bottom: 38, left: 42 }
const PLOT_WIDTH = WIDTH - MARGIN.left - MARGIN.right
const PLOT_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom
const requiredElements = ['axis', 'muted_foreground', 'grid', 'background'] as const
const shapes = ['circle', 'square', 'diamond', 'triangle'] as const

interface ScatterConfig {
  point_count: number
  data_pattern: 'clusters' | 'positive' | 'negative' | 'mixed'
  point_size: 'small' | 'medium' | 'large'
  point_opacity?: number
}

export const scatterGroupedRenderer: ChartRenderer = {
  chartType: 'scatter_grouped',
  templateId: 'scatter_grouped_v1',
  templateVersion: 1,
  schemaVersion: 1,
  render(input: PreviewRendererInput): PreviewRenderResult {
    const dataRoles = extractResolvedDataRoles(input.colorRoles, input.resolvedColors, {
      collection: 'groups',
      colorField: 'color'
    })
    const config = readConfig(input.previewConfig)
    if (!dataRoles.ok) return invalid(dataRoles.code, dataRoles.message)
    if (!config) return invalid('INVALID_SCATTER_CONFIG', 'scatter_grouped renderer received invalid preview configuration.')
    const groups = dataRoles.roles
    const elements = readElements(input.resolvedColors)
    if (!elements.ok) return elements.result

    const axis = elements.colors['color_roles.elements.axis']
    const text = elements.colors['color_roles.elements.muted_foreground']
    const grid = elements.colors['color_roles.elements.grid']
    const background = elements.colors['color_roles.elements.background']
    const radius = config.point_size === 'small' ? 2.5 : config.point_size === 'large' ? 3.8 : 3.1
    const opacity = config.point_opacity ?? 0.72
    const ticks = [0.2, 0.4, 0.6, 0.8]
    const gridMarkup = ticks.map((tick) => {
      const x = round(MARGIN.left + tick * PLOT_WIDTH)
      const y = round(MARGIN.top + tick * PLOT_HEIGHT)
      return `<line x1="${x}" y1="${MARGIN.top}" x2="${x}" y2="${HEIGHT - MARGIN.bottom}" stroke="${grid}" stroke-width="1" opacity="0.55"/><line x1="${MARGIN.left}" y1="${y}" x2="${WIDTH - MARGIN.right}" y2="${y}" stroke="${grid}" stroke-width="1" opacity="0.55"/>`
    }).join('')

    const marks = groups.map((group, groupIndex) => {
      const random = createDeterministicRandom(fnv1a32(`${input.seed}\u001fscatter\u001f${groupIndex}\u001f${group.key}`))
      const points = Array.from({ length: config.point_count }, () => generatePoint(random, groupIndex, groups.length, config.data_pattern))
      return `<g class="scatter-group" data-group="${escapeSvg(group.key)}">${points.map((point) => {
        const x = MARGIN.left + point.x * PLOT_WIDTH
        const y = MARGIN.top + (1 - point.y) * PLOT_HEIGHT
        return shapeMarkup(shapes[groupIndex % shapes.length], x, y, radius, group.color, opacity)
      }).join('')}</g>`
    }).join('')

    const legendCellWidth = PLOT_WIDTH / groups.length
    const legend = groups.map((group, index) => {
      const centerX = MARGIN.left + legendCellWidth * index + legendCellWidth / 2
      const label = escapeSvg(fitLabel(group.label, legendCellWidth))
      return `<g class="scatter-legend-item">${shapeMarkup(shapes[index % shapes.length], centerX - 8, HEIGHT - 13, 2.5, group.color, 0.9)}<text x="${round(centerX - 2)}" y="${HEIGHT - 10}" fill="${text}" font-size="7.5">${label}</text></g>`
    }).join('')

    return {
      ok: true,
      kind: 'svg',
      width: WIDTH,
      height: HEIGHT,
      markup: `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="Grouped scatter plot preview"><rect width="${WIDTH}" height="${HEIGHT}" fill="${background}"/>${gridMarkup}<line x1="${MARGIN.left}" y1="${MARGIN.top}" x2="${MARGIN.left}" y2="${HEIGHT - MARGIN.bottom}" stroke="${axis}" stroke-width="1.4"/><line x1="${MARGIN.left}" y1="${HEIGHT - MARGIN.bottom}" x2="${WIDTH - MARGIN.right}" y2="${HEIGHT - MARGIN.bottom}" stroke="${axis}" stroke-width="1.4"/>${marks}<g class="scatter-legend">${legend}</g></svg>`
    }
  }
}

function generatePoint(
  random: ReturnType<typeof createDeterministicRandom>,
  index: number,
  count: number,
  pattern: ScatterConfig['data_pattern']
) {
  const lane = (index + 1) / (count + 1)
  const x = clamp(lane + random.float(-0.17, 0.17), 0.04, 0.96)
  let y: number
  if (pattern === 'positive') y = 0.16 + x * 0.68 + random.float(-0.13, 0.13)
  else if (pattern === 'negative') y = 0.84 - x * 0.68 + random.float(-0.13, 0.13)
  else if (pattern === 'mixed') y = index % 2 === 0 ? 0.2 + x * 0.62 + random.float(-0.15, 0.15) : 0.8 - x * 0.58 + random.float(-0.15, 0.15)
  else y = 0.2 + lane * 0.6 + random.float(-0.16, 0.16)
  return { x, y: clamp(y, 0.04, 0.96) }
}

function shapeMarkup(shape: typeof shapes[number], x: number, y: number, radius: number, fill: string, opacity: number) {
  const cx = round(x)
  const cy = round(y)
  const r = round(radius)
  if (shape === 'square') return `<rect class="scatter-point" x="${round(x - radius)}" y="${round(y - radius)}" width="${round(radius * 2)}" height="${round(radius * 2)}" rx="0.5" fill="${fill}" opacity="${opacity}"/>`
  if (shape === 'diamond') return `<path class="scatter-point" d="M ${cx} ${round(y - radius * 1.25)} L ${round(x + radius * 1.25)} ${cy} L ${cx} ${round(y + radius * 1.25)} L ${round(x - radius * 1.25)} ${cy} Z" fill="${fill}" opacity="${opacity}"/>`
  if (shape === 'triangle') return `<path class="scatter-point" d="M ${cx} ${round(y - radius * 1.25)} L ${round(x + radius * 1.15)} ${round(y + radius)} L ${round(x - radius * 1.15)} ${round(y + radius)} Z" fill="${fill}" opacity="${opacity}"/>`
  return `<circle class="scatter-point" cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" opacity="${opacity}"/>`
}

function readConfig(value: unknown): ScatterConfig | null {
  if (!isRecord(value) || !Number.isInteger(value.point_count) || Number(value.point_count) < 8 || Number(value.point_count) > 30) return null
  if (!['clusters', 'positive', 'negative', 'mixed'].includes(String(value.data_pattern))) return null
  if (!['small', 'medium', 'large'].includes(String(value.point_size))) return null
  if (value.point_opacity !== undefined && (typeof value.point_opacity !== 'number' || value.point_opacity < 0.25 || value.point_opacity > 1)) return null
  return value as unknown as ScatterConfig
}
function readElements(colors: Record<string, string>):
  | { ok: true; colors: Record<typeof requiredElements[number] extends infer K ? `color_roles.elements.${K & string}` : never, string> }
  | { ok: false; result: PreviewRenderResult } {
  const paths = requiredElements.map((key) => `color_roles.elements.${key}` as const)
  const missing = paths.find((path) => !colors[path])
  return missing
    ? { ok: false, result: invalid('MISSING_RESOLVED_COLOR', `Missing resolved color for ${missing}.`) }
    : { ok: true, colors: Object.fromEntries(paths.map((path) => [path, colors[path]])) as any }
}
function invalid(code: string, message: string): PreviewRenderResult { return { ok: false, kind: 'invalid', code, message } }
function fitLabel(label: string, width: number) {
  const maxCharacters = Math.min(18, Math.max(4, Math.floor((width - 12) / 4.2)))
  return label.length <= maxCharacters ? label : `${label.slice(0, maxCharacters - 1)}…`
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)) }
function round(value: number) { return Math.round(value * 100) / 100 }
function escapeSvg(value: string) { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') }
