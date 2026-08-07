import { createDeterministicRandom } from '@/lib/deterministic/random'
import { fnv1a32 } from '@/lib/deterministic/seed'
import { extractResolvedDataRoles } from '../dataRoles'
import type { ChartRenderer, PreviewRendererInput, PreviewRenderResult } from '../types'

const WIDTH = 360
const HEIGHT = 220
const MARGIN = { top: 18, right: 24, bottom: 38, left: 42 }
const PLOT_WIDTH = WIDTH - MARGIN.left - MARGIN.right
const PLOT_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom
const requiredElements = ['outline', 'median', 'axis', 'grid', 'background'] as const
interface Config {
  sample_count: number
  distribution_shape: 'normal' | 'skewed' | 'bimodal' | 'mixed'
  bandwidth: 'narrow' | 'medium' | 'wide'
  show_summary: boolean
}

export const violinDistributionRenderer: ChartRenderer = {
  chartType: 'violin_distribution',
  templateId: 'violin_distribution_v1',
  templateVersion: 1,
  schemaVersion: 1,
  render(input: PreviewRendererInput): PreviewRenderResult {
    const dataRoles = extractResolvedDataRoles(input.colorRoles, input.resolvedColors, {
      collection: 'groups',
      colorField: 'fill'
    })
    const config = readConfig(input.previewConfig)
    if (!dataRoles.ok) return invalid(dataRoles.code, dataRoles.message)
    if (!config) return invalid('INVALID_VIOLIN_CONFIG', 'violin_distribution renderer received invalid preview configuration.')
    const groups = dataRoles.roles
    const elements = readElements(input.resolvedColors)
    if (!elements.ok) return elements.result
    const outline = elements.colors['color_roles.elements.outline']
    const medianColor = elements.colors['color_roles.elements.median']
    const axis = elements.colors['color_roles.elements.axis']
    const grid = elements.colors['color_roles.elements.grid']
    const background = elements.colors['color_roles.elements.background']
    const xStep = PLOT_WIDTH / groups.length
    const maxWidth = Math.min(32, xStep * 0.34)
    const bandwidth = config.bandwidth === 'narrow' ? 0.055 : config.bandwidth === 'wide' ? 0.11 : 0.08
    const ticks = [0.2, 0.4, 0.6, 0.8]
    const gridMarkup = ticks.map((tick) => {
      const y = round(MARGIN.top + (1 - tick) * PLOT_HEIGHT)
      return `<line x1="${MARGIN.left}" y1="${y}" x2="${WIDTH - MARGIN.right}" y2="${y}" stroke="${grid}" stroke-width="1" opacity="0.55"/>`
    }).join('')

    const violins = groups.map((group, index) => {
      const random = createDeterministicRandom(fnv1a32(`${input.seed}\u001fviolin\u001f${index}\u001f${group.key}`))
      const samples = Array.from({ length: config.sample_count }, () => sample(random, config.distribution_shape, index))
        .map((value) => clamp(value, 0.03, 0.97))
        .sort((a, b) => a - b)
      const gridValues = Array.from({ length: 33 }, (_, gridIndex) => gridIndex / 32)
      const densities = gridValues.map((value) =>
        samples.reduce((sum, candidate) => {
          const u = (value - candidate) / bandwidth
          return sum + Math.exp(-0.5 * u * u)
        }, 0)
      )
      const maxDensity = Math.max(...densities, 1)
      const centerX = MARGIN.left + xStep * index + xStep / 2
      const right = gridValues.map((value, gridIndex) => `${round(centerX + densities[gridIndex] / maxDensity * maxWidth)} ${round(y(value))}`)
      const left = [...gridValues].reverse().map((value, reverseIndex) => {
        const densityIndex = gridValues.length - 1 - reverseIndex
        return `${round(centerX - densities[densityIndex] / maxDensity * maxWidth)} ${round(y(value))}`
      })
      const path = `M ${right[0]} L ${right.slice(1).join(' L ')} L ${left.join(' L ')} Z`
      const q1 = quantile(samples, 0.25)
      const median = quantile(samples, 0.5)
      const q3 = quantile(samples, 0.75)
      const summary = config.show_summary
        ? `<line class="violin-iqr" x1="${round(centerX)}" y1="${round(y(q1))}" x2="${round(centerX)}" y2="${round(y(q3))}" stroke="${medianColor}" stroke-width="3" stroke-linecap="round"/><line class="violin-median" x1="${round(centerX - 6)}" y1="${round(y(median))}" x2="${round(centerX + 6)}" y2="${round(y(median))}" stroke="${medianColor}" stroke-width="2"/>`
        : ''
      return `<g class="violin-group" data-group="${escapeSvg(group.key)}"><path class="violin-shape data-mark" d="${path}" fill="${group.color}" fill-opacity="0.72" stroke="${outline}" stroke-width="1.25"/>${summary}<text x="${round(centerX)}" y="${HEIGHT - 16}" text-anchor="middle" fill="${axis}" font-size="8">${escapeSvg(fitLabel(group.label, xStep))}</text></g>`
    }).join('')
    return {
      ok: true,
      kind: 'svg',
      width: WIDTH,
      height: HEIGHT,
      markup: `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="Violin distribution preview"><rect width="${WIDTH}" height="${HEIGHT}" fill="${background}"/>${gridMarkup}<line x1="${MARGIN.left}" y1="${MARGIN.top}" x2="${MARGIN.left}" y2="${HEIGHT - MARGIN.bottom}" stroke="${axis}" stroke-width="1.4"/><line x1="${MARGIN.left}" y1="${HEIGHT - MARGIN.bottom}" x2="${WIDTH - MARGIN.right}" y2="${HEIGHT - MARGIN.bottom}" stroke="${axis}" stroke-width="1.4"/>${violins}</svg>`
    }
  }
}

function sample(random: ReturnType<typeof createDeterministicRandom>, shape: Config['distribution_shape'], index: number): number {
  const normal = () => {
    const u1 = Math.max(random.next(), 1e-9)
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * random.next())
  }
  const center = 0.43 + index * 0.055
  if (shape === 'skewed') return center + (Math.abs(normal()) - 0.62) * 0.14
  if (shape === 'bimodal') return center + (random.next() < 0.5 ? -0.13 : 0.13) + normal() * 0.065
  if (shape === 'mixed' && index % 2 === 1) return center + (random.next() < 0.5 ? -0.11 : 0.11) + normal() * 0.07
  return center + normal() * 0.13
}
function y(value: number) { return MARGIN.top + (1 - value) * PLOT_HEIGHT }
function quantile(values: number[], ratio: number) {
  const position = (values.length - 1) * ratio
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  return values[lower] + (values[upper] - values[lower]) * (position - lower)
}
function readConfig(value: unknown): Config | null {
  if (!isRecord(value) || !Number.isInteger(value.sample_count) || Number(value.sample_count) < 16 || Number(value.sample_count) > 48) return null
  if (!['normal', 'skewed', 'bimodal', 'mixed'].includes(String(value.distribution_shape))) return null
  if (!['narrow', 'medium', 'wide'].includes(String(value.bandwidth)) || typeof value.show_summary !== 'boolean') return null
  return value as unknown as Config
}
function readElements(colors: Record<string, string>):
  | { ok: true; colors: Record<string, string> }
  | { ok: false; result: PreviewRenderResult } {
  const paths = requiredElements.map((key) => `color_roles.elements.${key}`)
  const missing = paths.find((path) => !colors[path])
  return missing ? { ok: false, result: invalid('MISSING_RESOLVED_COLOR', `Missing resolved color for ${missing}.`) } : { ok: true, colors }
}
function invalid(code: string, message: string): PreviewRenderResult { return { ok: false, kind: 'invalid', code, message } }
function fitLabel(label: string, width: number) {
  const maxCharacters = Math.min(18, Math.max(4, Math.floor(width / 4.7)))
  return label.length <= maxCharacters ? label : `${label.slice(0, maxCharacters - 1)}…`
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)) }
function round(value: number) { return Math.round(value * 100) / 100 }
function escapeSvg(value: string) { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') }
