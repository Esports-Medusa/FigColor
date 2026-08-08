import { createDeterministicRandom } from '@/lib/deterministic/random'
import { fnv1a32 } from '@/lib/deterministic/seed'
import { extractResolvedDataRoles } from '../dataRoles'
import type { ChartRenderer, PreviewRendererInput, PreviewRenderResult } from '../types'

const WIDTH = 360
const HEIGHT = 220
const MARGIN = { top: 20, right: 24, bottom: 42, left: 46 }
const PLOT_WIDTH = WIDTH - MARGIN.left - MARGIN.right
const PLOT_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom
const requiredElementColorPaths = [
  'color_roles.elements.axis',
  'color_roles.elements.grid',
  'color_roles.elements.text',
  'color_roles.elements.error_bar',
  'color_roles.elements.background'
] as const

export const barErrorRenderer: ChartRenderer = {
  chartType: 'bar_error',
  templateId: 'bar_error_v1',
  templateVersion: 1,
  schemaVersion: 1,
  render(input: PreviewRendererInput): PreviewRenderResult {
    const dataRoles = extractResolvedDataRoles(input.colorRoles, input.resolvedColors, {
      collection: 'groups',
      colorField: 'fill'
    })
    if (!dataRoles.ok) {
      return {
        ok: false,
        kind: 'invalid',
        code: dataRoles.code,
        message: dataRoles.message
      }
    }
    const groups = dataRoles.roles

    const elementColors = readRequiredElementColors(input.resolvedColors)
    if (!elementColors.ok) {
      return elementColors.result
    }

    const axisColor = elementColors.colors['color_roles.elements.axis']
    const gridColor = elementColors.colors['color_roles.elements.grid']
    const textColor = elementColors.colors['color_roles.elements.text']
    const errorBarColor = elementColors.colors['color_roles.elements.error_bar']
    const backgroundColor = elementColors.colors['color_roles.elements.background']

    const values = groups.map((group, index) => {
      const random = createDeterministicRandom(fnv1a32(`${input.seed}\u001fbar\u001f${group.key}`))
      const trend = 54 + index * random.float(7, 14)
      return Math.round(clamp(trend + random.float(-8, 10), 22, 96))
    })
    const errors = values.map((value, index) => {
      const random = createDeterministicRandom(fnv1a32(`${input.seed}\u001fbar-error\u001f${groups[index].key}`))
      return Math.round(clamp(value * random.float(0.07, 0.16), 4, 16))
    })
    const maxValue = Math.max(...values.map((value, index) => value + errors[index]), 100)

    const yScale = (value: number) =>
      MARGIN.top + PLOT_HEIGHT - (value / maxValue) * PLOT_HEIGHT
    const xStep = PLOT_WIDTH / groups.length
    const barWidth = Math.min(44, xStep * 0.56)
    const zeroY = yScale(0)
    const gridTicks = [0, 25, 50, 75, 100]

    const gridMarkup = gridTicks.map((tick) => {
      const y = round(yScale(tick))
      return `<g><line x1="${MARGIN.left}" y1="${y}" x2="${WIDTH - MARGIN.right}" y2="${y}" stroke="${gridColor}" stroke-width="1" opacity="0.62"/><text x="${MARGIN.left - 10}" y="${y + 4}" text-anchor="end" fill="${textColor}" font-size="10">${tick}</text></g>`
    }).join('')

    const barMarkup = groups.map((group, index) => {
      const centerX = MARGIN.left + xStep * index + xStep / 2
      const valueY = yScale(values[index])
      const errorTopY = yScale(values[index] + errors[index])
      const errorBottomY = yScale(Math.max(0, values[index] - errors[index]))
      const x = centerX - barWidth / 2
      const label = escapeSvg(fitLabel(group.label, xStep))
      const fill = group.color

      return [
        `<rect class="bar-data-mark" data-role-key="${escapeSvg(group.key)}" x="${round(x)}" y="${round(valueY)}" width="${round(barWidth)}" height="${round(zeroY - valueY)}" fill="${fill}" rx="2"/>`,
        `<line x1="${round(centerX)}" y1="${round(errorTopY)}" x2="${round(centerX)}" y2="${round(errorBottomY)}" stroke="${errorBarColor}" stroke-width="1.5"/>`,
        `<line x1="${round(centerX - 7)}" y1="${round(errorTopY)}" x2="${round(centerX + 7)}" y2="${round(errorTopY)}" stroke="${errorBarColor}" stroke-width="1.5"/>`,
        `<line x1="${round(centerX - 7)}" y1="${round(errorBottomY)}" x2="${round(centerX + 7)}" y2="${round(errorBottomY)}" stroke="${errorBarColor}" stroke-width="1.5"/>`,
        `<text x="${round(centerX)}" y="${HEIGHT - 18}" text-anchor="middle" fill="${textColor}" font-size="${groups.length >= 4 ? 8 : 10}">${label}</text>`
      ].join('')
    }).join('')

    return {
      ok: true,
      kind: 'svg',
      width: WIDTH,
      height: HEIGHT,
      markup: `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="Bar chart preview"><rect width="${WIDTH}" height="${HEIGHT}" fill="${backgroundColor}"/>${gridMarkup}<line x1="${MARGIN.left}" y1="${MARGIN.top}" x2="${MARGIN.left}" y2="${zeroY}" stroke="${axisColor}" stroke-width="1.5"/><line x1="${MARGIN.left}" y1="${zeroY}" x2="${WIDTH - MARGIN.right}" y2="${zeroY}" stroke="${axisColor}" stroke-width="1.5"/>${barMarkup}</svg>`
    }
  }
}

function readRequiredElementColors(resolvedColors: Record<string, string>):
  | { ok: true; colors: Record<typeof requiredElementColorPaths[number], string> }
  | { ok: false; result: PreviewRenderResult } {
  const missingPath = requiredElementColorPaths.find((path) => !resolvedColors[path])
  if (missingPath) {
    return {
      ok: false,
      result: {
        ok: false,
        kind: 'invalid',
        code: 'MISSING_RESOLVED_COLOR',
        message: `Missing resolved color for ${missingPath}.`
      }
    }
  }

  return {
    ok: true,
    colors: Object.fromEntries(
      requiredElementColorPaths.map((path) => [path, resolvedColors[path]])
    ) as Record<typeof requiredElementColorPaths[number], string>
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function fitLabel(label: string, width: number): string {
  const maxCharacters = Math.min(18, Math.max(4, Math.floor(width / 5)))
  return label.length <= maxCharacters ? label : `${label.slice(0, maxCharacters - 1)}…`
}

function escapeSvg(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
