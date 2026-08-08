import type { CanonicalPalette } from './schema'

export function renderGenericPalettePreview(
  palette: Pick<CanonicalPalette, 'id'>,
  colors: string[]
): string {
  const width = 360
  const height = 220
  const safeColors = colors.filter(isHexColor)
  if (safeColors.length === 0) {
    return ''
  }

  const seed = stableSeed(palette.id || safeColors.join(','))
  const background = '#FFFFFF'
  const panel = '#F8FAFC'
  const line = '#E5E7EB'
  const stripWidth = width - 48
  const swatchWidth = stripWidth / safeColors.length
  const swatches = safeColors.map((color, index) =>
    `<rect x="${round(24 + index * swatchWidth)}" y="168" width="${round(swatchWidth + 0.5)}" height="28" fill="${color}"/>`
  ).join('')
  const tiles = safeColors.map((color, index) => {
    const column = index % 6
    const row = Math.floor(index / 6)
    const x = 28 + column * 52
    const y = 30 + row * 40
    const tileHeight = 18 + ((seed + index * 17) % 28)
    return `<rect class="generic-palette-tile" x="${x}" y="${round(y + 36 - tileHeight)}" width="34" height="${tileHeight}" rx="4" fill="${color}"/>`
  }).join('')
  const ribbons = safeColors.map((_, index) => {
    const x1 = 34 + index * (292 / Math.max(1, safeColors.length - 1))
    const y1 = 124 + (((seed >> (index % 8)) + index * 5) % 18)
    return `${index === 0 ? 'M' : 'L'} ${round(x1)} ${round(y1)}`
  }).join(' ')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Generic colour palette preview"><rect width="${width}" height="${height}" fill="${background}"/><rect x="18" y="20" width="324" height="126" rx="8" fill="${panel}" stroke="${line}"/><path d="${ribbons}" fill="none" stroke="#64748B" stroke-width="1.4" stroke-linecap="round" stroke-dasharray="4 4" opacity="0.45"/>${tiles}<g class="generic-palette-strip">${swatches}</g></svg>`
}

function isHexColor(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value)
}

function stableSeed(value: string): number {
  return Math.abs([...value].reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0))
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
