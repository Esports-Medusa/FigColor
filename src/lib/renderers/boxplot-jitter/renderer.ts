import { createDeterministicRandom, type DeterministicRandom } from '@/lib/deterministic/random'
import type { ChartRenderer, PreviewRendererInput, PreviewRenderResult } from '../types'

const WIDTH = 360
const HEIGHT = 220
const MARGIN = { top: 20, right: 24, bottom: 42, left: 46 }
const PLOT_WIDTH = WIDTH - MARGIN.left - MARGIN.right
const PLOT_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom
const BOXPLOT_DENSITY_COUNTS = {
  low: 18,
  medium: 26,
  high: 34
} as const
const requiredElementColorPaths = [
  'color_roles.elements.axis',
  'color_roles.elements.grid',
  'color_roles.elements.text',
  'color_roles.elements.box_stroke',
  'color_roles.elements.median',
  'color_roles.elements.whisker',
  'color_roles.elements.jitter',
  'color_roles.elements.outlier',
  'color_roles.elements.background'
] as const

type JitterDensity = keyof typeof BOXPLOT_DENSITY_COUNTS

interface BoxplotGroupRole {
  key: string
  label: string
  color: unknown
}

interface BoxplotConfig {
  jitter_density: JitterDensity
  show_outliers: boolean
}

interface BoxplotStats {
  values: number[]
  q1: number
  median: number
  q3: number
  lowerWhisker: number
  upperWhisker: number
  inliers: number[]
  outliers: number[]
}

export const boxplotJitterRenderer: ChartRenderer = {
  chartType: 'boxplot_jitter',
  templateId: 'boxplot_jitter_v1',
  templateVersion: 1,
  schemaVersion: 1,
  render(input: PreviewRendererInput): PreviewRenderResult {
    const groups = readGroups(input.colorRoles)
    if (groups.length < 3 || groups.length > 5) {
      return invalidResult(
        'INVALID_BOXPLOT_GROUPS',
        'boxplot_jitter renderer requires 3 to 5 group color roles.'
      )
    }

    const config = readConfig(input.previewConfig)
    if (!config) {
      return invalidResult(
        'INVALID_BOXPLOT_CONFIG',
        'boxplot_jitter renderer requires jitter_density and show_outliers config.'
      )
    }

    const groupFills = groups.map((_, index) => input.resolvedColors[`color_roles.groups[${index}].color`])
    const missingGroupColorIndex = groupFills.findIndex((fill) => !fill)
    if (missingGroupColorIndex >= 0) {
      return invalidResult(
        'MISSING_RESOLVED_COLOR',
        `Missing resolved color for color_roles.groups[${missingGroupColorIndex}].color.`
      )
    }

    const elementColors = readRequiredElementColors(input.resolvedColors)
    if (!elementColors.ok) {
      return elementColors.result
    }

    const axisColor = elementColors.colors['color_roles.elements.axis']
    const gridColor = elementColors.colors['color_roles.elements.grid']
    const textColor = elementColors.colors['color_roles.elements.text']
    const boxStrokeColor = elementColors.colors['color_roles.elements.box_stroke']
    const medianColor = elementColors.colors['color_roles.elements.median']
    const whiskerColor = elementColors.colors['color_roles.elements.whisker']
    const jitterColor = elementColors.colors['color_roles.elements.jitter']
    const outlierColor = elementColors.colors['color_roles.elements.outlier']
    const backgroundColor = elementColors.colors['color_roles.elements.background']

    const random = createDeterministicRandom(input.seed)
    const sampleCount = BOXPLOT_DENSITY_COUNTS[config.jitter_density]
    const statsByGroup = groups.map((_, index) =>
      computeStats(generateSamples(random, sampleCount, index, groups.length))
    )
    const minValue = Math.min(...statsByGroup.flatMap((stats) => stats.values), 0)
    const maxValue = Math.max(...statsByGroup.flatMap((stats) => stats.values), 100)
    const domainPadding = Math.max((maxValue - minValue) * 0.08, 6)
    const domainMin = Math.floor(Math.max(0, minValue - domainPadding))
    const domainMax = Math.ceil(Math.min(140, maxValue + domainPadding))
    const yScale = (value: number) =>
      MARGIN.top + PLOT_HEIGHT - ((value - domainMin) / (domainMax - domainMin)) * PLOT_HEIGHT
    const xStep = PLOT_WIDTH / groups.length
    const boxWidth = Math.min(42, xStep * 0.46)
    const jitterWidth = Math.min(54, xStep * 0.64)
    const zeroY = yScale(domainMin)
    const gridTicks = createTicks(domainMin, domainMax)

    const gridMarkup = gridTicks.map((tick) => {
      const y = round(yScale(tick))
      return `<g><line x1="${MARGIN.left}" y1="${y}" x2="${WIDTH - MARGIN.right}" y2="${y}" stroke="${gridColor}" stroke-width="1" opacity="0.62"/><text x="${MARGIN.left - 10}" y="${y + 4}" text-anchor="end" fill="${textColor}" font-size="10">${tick}</text></g>`
    }).join('')

    const groupMarkup = groups.map((group, groupIndex) => {
      const stats = statsByGroup[groupIndex]
      const centerX = MARGIN.left + xStep * groupIndex + xStep / 2
      const q1Y = yScale(stats.q1)
      const medianY = yScale(stats.median)
      const q3Y = yScale(stats.q3)
      const lowerY = yScale(stats.lowerWhisker)
      const upperY = yScale(stats.upperWhisker)
      const boxTop = Math.min(q1Y, q3Y)
      const boxHeight = Math.max(1, Math.abs(q3Y - q1Y))
      const fill = groupFills[groupIndex]
      const label = escapeSvg(group.label)
      const inlierMarkup = stats.inliers.map((value, valueIndex) => {
        const x = centerX + deterministicJitter(input.seed, groupIndex, valueIndex, jitterWidth)
        const y = yScale(value)
        return `<circle class="jitter-point" cx="${round(x)}" cy="${round(y)}" r="1.9" fill="${jitterColor}" opacity="0.58"/>`
      }).join('')
      const outlierMarkup = config.show_outliers
        ? stats.outliers.map((value, valueIndex) => {
            const x = centerX + deterministicJitter(input.seed + 101, groupIndex, valueIndex, jitterWidth)
            const y = yScale(value)
            return `<circle class="outlier-point" cx="${round(x)}" cy="${round(y)}" r="2.8" fill="${outlierColor}" stroke="${boxStrokeColor}" stroke-width="1"/>`
          }).join('')
        : ''

      return `<g class="boxplot-group" data-key="${escapeSvg(group.key)}" data-q1="${round(stats.q1)}" data-median="${round(stats.median)}" data-q3="${round(stats.q3)}" data-lower-whisker="${round(stats.lowerWhisker)}" data-upper-whisker="${round(stats.upperWhisker)}">${inlierMarkup}${outlierMarkup}<line x1="${round(centerX)}" y1="${round(upperY)}" x2="${round(centerX)}" y2="${round(lowerY)}" stroke="${whiskerColor}" stroke-width="1.5"/><line x1="${round(centerX - boxWidth * 0.32)}" y1="${round(upperY)}" x2="${round(centerX + boxWidth * 0.32)}" y2="${round(upperY)}" stroke="${whiskerColor}" stroke-width="1.5"/><line x1="${round(centerX - boxWidth * 0.32)}" y1="${round(lowerY)}" x2="${round(centerX + boxWidth * 0.32)}" y2="${round(lowerY)}" stroke="${whiskerColor}" stroke-width="1.5"/><rect x="${round(centerX - boxWidth / 2)}" y="${round(boxTop)}" width="${round(boxWidth)}" height="${round(boxHeight)}" fill="${fill}" fill-opacity="0.76" stroke="${boxStrokeColor}" stroke-width="1.5" rx="2"/><line x1="${round(centerX - boxWidth / 2)}" y1="${round(medianY)}" x2="${round(centerX + boxWidth / 2)}" y2="${round(medianY)}" stroke="${medianColor}" stroke-width="2"/><text x="${round(centerX)}" y="${HEIGHT - 18}" text-anchor="middle" fill="${textColor}" font-size="10">${label}</text></g>`
    }).join('')

    return {
      ok: true,
      kind: 'svg',
      width: WIDTH,
      height: HEIGHT,
      markup: `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="Boxplot jitter preview"><rect width="${WIDTH}" height="${HEIGHT}" fill="${backgroundColor}"/>${gridMarkup}<line x1="${MARGIN.left}" y1="${MARGIN.top}" x2="${MARGIN.left}" y2="${zeroY}" stroke="${axisColor}" stroke-width="1.5"/><line x1="${MARGIN.left}" y1="${zeroY}" x2="${WIDTH - MARGIN.right}" y2="${zeroY}" stroke="${axisColor}" stroke-width="1.5"/>${groupMarkup}</svg>`
    }
  }
}

function generateSamples(
  random: DeterministicRandom,
  sampleCount: number,
  groupIndex: number,
  groupCount: number
): number[] {
  const center = 46 + groupIndex * (34 / Math.max(1, groupCount - 1)) + random.float(-3, 3)
  const spread = random.float(5.5, 9.5)
  const values: number[] = []

  for (let index = 0; index < sampleCount; index += 1) {
    const wave = Math.sin((index + 1) * (groupIndex + 1) * 0.73) * spread * 0.28
    const noise = (random.next() + random.next() + random.next() - 1.5) * spread
    values.push(round(clamp(center + wave + noise, 8, 122)))
  }

  values.push(round(clamp(center + spread * random.float(3.3, 4.2), 8, 132)))
  values.push(round(clamp(center - spread * random.float(2.9, 3.8), 4, 132)))

  return values
}

function computeStats(values: number[]): BoxplotStats {
  const sorted = [...values].sort((left, right) => left - right)
  const q1 = quantile(sorted, 0.25)
  const median = quantile(sorted, 0.5)
  const q3 = quantile(sorted, 0.75)
  const iqr = q3 - q1
  const lowerFence = q1 - 1.5 * iqr
  const upperFence = q3 + 1.5 * iqr
  const inliers = sorted.filter((value) => value >= lowerFence && value <= upperFence)
  const outliers = sorted.filter((value) => value < lowerFence || value > upperFence)

  return {
    values: sorted,
    q1,
    median,
    q3,
    lowerWhisker: inliers[0] ?? sorted[0],
    upperWhisker: inliers[inliers.length - 1] ?? sorted[sorted.length - 1],
    inliers,
    outliers
  }
}

function quantile(sortedValues: readonly number[], probability: number): number {
  const position = (sortedValues.length - 1) * probability
  const lowerIndex = Math.floor(position)
  const upperIndex = Math.ceil(position)
  const weight = position - lowerIndex
  const lower = sortedValues[lowerIndex]
  const upper = sortedValues[upperIndex]
  return lower + (upper - lower) * weight
}

function readGroups(colorRoles: unknown): BoxplotGroupRole[] {
  if (!isRecord(colorRoles) || !Array.isArray(colorRoles.groups)) {
    return []
  }

  return colorRoles.groups.filter(isGroupRole)
}

function isGroupRole(value: unknown): value is BoxplotGroupRole {
  return isRecord(value) &&
    typeof value.key === 'string' &&
    typeof value.label === 'string' &&
    Object.prototype.hasOwnProperty.call(value, 'color')
}

function readConfig(previewConfig: unknown): BoxplotConfig | null {
  if (!isRecord(previewConfig)) {
    return null
  }
  if (
    (previewConfig.jitter_density === 'low' ||
      previewConfig.jitter_density === 'medium' ||
      previewConfig.jitter_density === 'high') &&
    typeof previewConfig.show_outliers === 'boolean'
  ) {
    return {
      jitter_density: previewConfig.jitter_density,
      show_outliers: previewConfig.show_outliers
    }
  }
  return null
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

function createTicks(min: number, max: number): number[] {
  const step = Math.max(10, Math.ceil((max - min) / 4 / 5) * 5)
  const start = Math.ceil(min / step) * step
  const ticks: number[] = []
  for (let value = start; value <= max; value += step) {
    ticks.push(value)
  }
  return ticks.length > 0 ? ticks : [min, max]
}

function deterministicJitter(seed: number, groupIndex: number, valueIndex: number, width: number): number {
  const random = createDeterministicRandom((seed + groupIndex * 2654435761 + valueIndex * 2246822519) >>> 0)
  return random.float(-width / 2, width / 2)
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
