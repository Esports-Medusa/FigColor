import { createDeterministicRandom, type DeterministicRandom } from '@/lib/deterministic/random'
import { fnv1a32 } from '@/lib/deterministic/seed'
import { extractResolvedDataRoles } from '../dataRoles'
import type { ChartRenderer, PreviewRendererInput, PreviewRenderResult } from '../types'

const WIDTH = 360
const HEIGHT = 220
const MARGIN = { top: 16, right: 12, bottom: 42, left: 55 }
const PLOT_WIDTH = WIDTH - MARGIN.left - MARGIN.right
const PLOT_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom
const JITTER_SAMPLE_COUNTS = {
  low: 8,
  medium: 12,
  high: 16
} as const
const MOCK_VALUES = [
  [0.82, 0.91, 0.95, 0.98, 1.01, 1.04, 1.07, 1.10, 1.13, 1.18, 1.22, 1.29],
  [1.02, 1.11, 1.18, 1.22, 1.27, 1.31, 1.35, 1.39, 1.44, 1.49, 1.55, 1.62],
  [1.28, 1.39, 1.47, 1.54, 1.60, 1.65, 1.71, 1.77, 1.83, 1.91, 1.98, 2.08]
] as const
const DEFAULT_COLORS = {
  axis: '#111827',
  grid: '#D1D5DB',
  text: '#6B7280',
  outline: '#111827',
  median: '#111827',
  whisker: '#111827',
  jitter: '#6B7280',
  background: '#FFFFFF'
} as const

type JitterDensity = keyof typeof JITTER_SAMPLE_COUNTS

interface BoxplotConfig {
  jitter_density: JitterDensity
  show_outliers: boolean
  y_axis_label?: string
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
    const dataRoles = extractResolvedDataRoles(input.colorRoles, input.resolvedColors, {
      collection: 'groups',
      colorField: 'color'
    })
    if (!dataRoles.ok) {
      return invalidResult(
        dataRoles.code,
        dataRoles.message
      )
    }
    const groups = dataRoles.roles

    const config = readConfig(input.previewConfig)
    if (!config) {
      return invalidResult(
        'INVALID_BOXPLOT_CONFIG',
        'boxplot_jitter renderer requires jitter_density and show_outliers config.'
      )
    }

    const axisColor = readElementColor(input.resolvedColors, ['axis'], DEFAULT_COLORS.axis)
    const textColor = readElementColor(input.resolvedColors, ['text'], DEFAULT_COLORS.text)
    const boxStrokeColor = readElementColor(input.resolvedColors, ['outline', 'box_stroke'], DEFAULT_COLORS.outline)
    const medianColor = readElementColor(input.resolvedColors, ['median_line', 'median'], DEFAULT_COLORS.median)
    const whiskerColor = readElementColor(input.resolvedColors, ['whisker'], DEFAULT_COLORS.whisker)
    const backgroundColor = readElementColor(input.resolvedColors, ['background'], DEFAULT_COLORS.background)

    const sampleCount = JITTER_SAMPLE_COUNTS[config.jitter_density]
    const statsByGroup = groups.map((group, index) =>
      computeStats(generateSamples(
        createDeterministicRandom(fnv1a32(`${input.seed}\u001fboxplot\u001f${group.key}`)),
        sampleCount,
        index
      ))
    )
    const minValue = Math.min(...statsByGroup.flatMap((stats) => stats.values))
    const maxValue = Math.max(...statsByGroup.flatMap((stats) => stats.values))
    const domainMin = Math.min(0.65, Math.floor((minValue - 0.12) * 20) / 20)
    const domainMax = Math.max(2.72, Math.ceil((maxValue + 0.5) * 20) / 20)
    const yScale = (value: number) =>
      MARGIN.top + PLOT_HEIGHT - ((value - domainMin) / (domainMax - domainMin)) * PLOT_HEIGHT
    const xStep = PLOT_WIDTH / groups.length
    const boxWidth = Math.min(34, xStep * 0.34)
    const jitterWidth = Math.min(58, xStep * 0.62)
    const zeroY = yScale(domainMin)
    const gridTicks = createTicks(domainMin, domainMax)

    const gridMarkup = gridTicks.map((tick) => {
      const y = round(yScale(tick))
      return `<g><line x1="${MARGIN.left - 3}" y1="${y}" x2="${MARGIN.left}" y2="${y}" stroke="${axisColor}" stroke-width="0.8"/><text x="${MARGIN.left - 7}" y="${y + 3}" text-anchor="end" fill="${textColor}" font-size="8">${formatTick(tick)}</text></g>`
    }).join('')
    const yAxisLabel = typeof config.y_axis_label === 'string' && config.y_axis_label.trim()
      ? `<text x="12" y="${round(MARGIN.top + PLOT_HEIGHT / 2)}" text-anchor="middle" fill="${textColor}" font-size="8.5" transform="rotate(-90 12 ${round(MARGIN.top + PLOT_HEIGHT / 2)})">${escapeSvg(config.y_axis_label)}</text>`
      : ''

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
      const fill = group.color
      const label = escapeSvg(fitLabel(group.label, xStep))
      const inlierMarkup = stats.inliers.map((value, valueIndex) => {
        const x = centerX + deterministicJitter(input.seed, groupIndex, valueIndex, jitterWidth)
        const y = yScale(value)
        return `<circle class="jitter-point" cx="${round(x)}" cy="${round(y)}" r="3.05" fill="${fill}" stroke="${backgroundColor}" stroke-width="0.65" opacity="0.92"/>`
      }).join('')
      const outlierMarkup = config.show_outliers
        ? stats.outliers.map((value, valueIndex) => {
            const x = centerX + deterministicJitter(input.seed + 101, groupIndex, valueIndex, jitterWidth)
            const y = yScale(value)
            return `<circle class="outlier-point" cx="${round(x)}" cy="${round(y)}" r="3.05" fill="${fill}" stroke="${backgroundColor}" stroke-width="0.65" opacity="0.92"/>`
          }).join('')
        : ''

      return `<g class="boxplot-group" data-key="${escapeSvg(group.key)}" data-q1="${round(stats.q1)}" data-median="${round(stats.median)}" data-q3="${round(stats.q3)}" data-lower-whisker="${round(stats.lowerWhisker)}" data-upper-whisker="${round(stats.upperWhisker)}"><line x1="${round(centerX)}" y1="${round(upperY)}" x2="${round(centerX)}" y2="${round(lowerY)}" stroke="${whiskerColor}" stroke-width="0.9"/><line x1="${round(centerX - boxWidth * 0.32)}" y1="${round(upperY)}" x2="${round(centerX + boxWidth * 0.32)}" y2="${round(upperY)}" stroke="${whiskerColor}" stroke-width="0.9"/><line x1="${round(centerX - boxWidth * 0.32)}" y1="${round(lowerY)}" x2="${round(centerX + boxWidth * 0.32)}" y2="${round(lowerY)}" stroke="${whiskerColor}" stroke-width="0.9"/><rect class="quartile-box" x="${round(centerX - boxWidth / 2)}" y="${round(boxTop)}" width="${round(boxWidth)}" height="${round(boxHeight)}" fill="${fill}" fill-opacity="0.12" stroke="${boxStrokeColor}" stroke-width="0.9"/>${inlierMarkup}${outlierMarkup}<line class="median-line" x1="${round(centerX - boxWidth / 2)}" y1="${round(medianY)}" x2="${round(centerX + boxWidth / 2)}" y2="${round(medianY)}" stroke="${medianColor}" stroke-width="1.25"/><text x="${round(centerX)}" y="${HEIGHT - 25}" text-anchor="middle" fill="${textColor}" font-size="8">${label}</text><text x="${round(centerX)}" y="${HEIGHT - 14}" text-anchor="middle" fill="${textColor}" font-size="7.5" font-style="italic">n = ${stats.values.length}</text></g>`
    }).join('')
    const comparisonMarkup = renderComparisons(groups.length, statsByGroup, yScale, xStep, textColor)

    return {
      ok: true,
      kind: 'svg',
      width: WIDTH,
      height: HEIGHT,
      markup: `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="Publication-style boxplot with jittered observations"><rect width="${WIDTH}" height="${HEIGHT}" fill="${backgroundColor}"/>${gridMarkup}${yAxisLabel}<line x1="${MARGIN.left}" y1="${MARGIN.top}" x2="${MARGIN.left}" y2="${zeroY}" stroke="${axisColor}" stroke-width="0.8"/><line x1="${MARGIN.left}" y1="${zeroY}" x2="${WIDTH - MARGIN.right}" y2="${zeroY}" stroke="${axisColor}" stroke-width="0.8"/>${groupMarkup}${comparisonMarkup}</svg>`
    }
  }
}

function generateSamples(
  random: DeterministicRandom,
  sampleCount: number,
  groupIndex: number
): number[] {
  const sourceIndex = Math.min(groupIndex, MOCK_VALUES.length - 1)
  const source = MOCK_VALUES[sourceIndex]
  if (sampleCount <= source.length) {
    return source.filter((_, index) => index % Math.max(1, Math.floor(source.length / sampleCount)) === 0).slice(0, sampleCount)
  }
  const values: number[] = [...source]
  while (values.length < sampleCount) {
    const base = source[values.length % source.length]
    values.push(round(clamp(base + random.float(-0.025, 0.025), 0.65, 2.2)))
  }
  return values.sort((left, right) => left - right)
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
      show_outliers: previewConfig.show_outliers,
      y_axis_label: typeof previewConfig.y_axis_label === 'string' ? previewConfig.y_axis_label : undefined
    }
  }
  return null
}

function readElementColor(resolvedColors: Record<string, string>, keys: readonly string[], fallback: string): string {
  return keys.map((key) => resolvedColors[`color_roles.elements.${key}`]).find(Boolean) ?? fallback
}

function createTicks(min: number, max: number): number[] {
  const step = 0.25
  const start = Math.ceil(min / step) * step
  const ticks: number[] = []
  for (let value = start; value <= max; value += step) {
    ticks.push(value)
  }
  return ticks.length > 0 ? ticks : [min, max]
}

function formatTick(value: number): string {
  return value.toFixed(2).replace(/0$/, '')
}

function fitLabel(label: string, xStep: number): string {
  const maxCharacters = Math.max(5, Math.floor(xStep / 5.2))
  return label.length <= maxCharacters ? label : `${label.slice(0, maxCharacters - 1)}…`
}

function renderComparisons(
  groupCount: number,
  stats: BoxplotStats[],
  yScale: (value: number) => number,
  xStep: number,
  color: string
): string {
  if (groupCount < 2) {
    return ''
  }
  const pairs = groupCount === 2
    ? [[0, 1, 2.35] as const]
    : [[0, groupCount - 1, 2.43] as const, [groupCount - 2, groupCount - 1, 2.22] as const]
  return pairs.map(([leftIndex, rightIndex, value]) => {
    const left = MARGIN.left + xStep * leftIndex + xStep / 2
    const right = MARGIN.left + xStep * rightIndex + xStep / 2
    const y = yScale(value)
    const top = y - 3
    const pValue = mannWhitneyPValue(stats[leftIndex].values, stats[rightIndex].values)
    return `<g class="significance-comparison" data-left="${leftIndex}" data-right="${rightIndex}" data-p-value="${pValue.toFixed(6)}"><path d="M ${round(left)} ${round(y)} V ${round(top)} H ${round(right)} V ${round(y)}" fill="none" stroke="${color}" stroke-width="0.8"/><text x="${round((left + right) / 2)}" y="${round(top - 3)}" text-anchor="middle" fill="${color}" font-size="7.5">${formatPValue(pValue)}</text></g>`
  }).join('')
}

function mannWhitneyPValue(left: number[], right: number[]): number {
  const ranked = [
    ...left.map((value) => ({ value, group: 0 })),
    ...right.map((value) => ({ value, group: 1 }))
  ].sort((a, b) => a.value - b.value)
  let rankSum = 0
  for (let index = 0; index < ranked.length;) {
    let end = index + 1
    while (end < ranked.length && ranked[end].value === ranked[index].value) end += 1
    const averageRank = (index + 1 + end) / 2
    for (let cursor = index; cursor < end; cursor += 1) {
      if (ranked[cursor].group === 0) rankSum += averageRank
    }
    index = end
  }
  const u = rankSum - left.length * (left.length + 1) / 2
  const mean = left.length * right.length / 2
  const sigma = Math.sqrt(left.length * right.length * (left.length + right.length + 1) / 12)
  const z = (Math.abs(u - mean) - 0.5) / sigma
  return Math.min(1, erfc(z / Math.SQRT2))
}

function erfc(value: number): number {
  const z = Math.abs(value)
  const t = 1 / (1 + z / 2)
  const approximation = t * Math.exp(
    -z * z - 1.26551223 +
    t * (1.00002368 +
    t * (0.37409196 +
    t * (0.09678418 +
    t * (-0.18628806 +
    t * (0.27886807 +
    t * (-1.13520398 +
    t * (1.48851587 +
    t * (-0.82215223 +
    t * 0.17087277)))))))))
  return value >= 0 ? approximation : 2 - approximation
}

function formatPValue(value: number): string {
  return value < 0.0001 ? 'P &lt; 0.0001' : `P = ${value.toFixed(4)}`
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
