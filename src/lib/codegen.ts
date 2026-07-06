import type { PaletteColor } from '@/types/palette'

type ColorInput = PaletteColor | string

function toHexArrayInternal(colors: ColorInput[]): string[] {
  return colors.map((c) => {
    if (typeof c === 'string') return c
    return c.hex
  })
}

/**
 * Convert colors to HEX array string
 */
export function toHexArray(colors: PaletteColor[] | string[]): string {
  const hexes = toHexArrayInternal(colors).map((hex) => `"${hex}"`)
  return `[\n  ${hexes.join(',\n  ')}\n]`
}

/**
 * Convert colors to Python list string
 */
export function toPythonList(colors: PaletteColor[] | string[]): string {
  const hexes = toHexArrayInternal(colors).map((hex) => `"${hex}"`)
  return `colors = [${hexes.join(', ')}]`
}

/**
 * Convert colors to Matplotlib palette string
 */
export function toMatplotlibPalette(colors: PaletteColor[] | string[]): string {
  const hexes = toHexArrayInternal(colors).map((hex) => `"${hex}"`)
  return `palette = [${hexes.join(', ')}]

import matplotlib.pyplot as plt

plt.rcParams["axes.prop_cycle"] = plt.cycler(color=palette)`
}

/**
 * Convert colors to Seaborn palette string
 */
export function toSeabornPalette(colors: PaletteColor[] | string[]): string {
  const hexes = toHexArrayInternal(colors).map((hex) => `"${hex}"`)
  return `palette = [${hexes.join(', ')}]

import seaborn as sns

sns.set_palette(palette)`
}

/**
 * Convert colors to R vector string
 */
export function toRVector(colors: PaletteColor[] | string[]): string {
  const hexes = toHexArrayInternal(colors).map((hex) => `"${hex}"`)
  return `c(${hexes.join(', ')})`
}

/**
 * Convert colors to ggplot2 scale_color_manual string
 */
export function toGgplotScale(colors: PaletteColor[] | string[]): string {
  const hexes = toHexArrayInternal(colors).map((hex) => `"${hex}"`)
  return `scale_color_manual(values = c(${hexes.join(', ')}))

scale_fill_manual(values = c(${hexes.join(', ')}))`
}

/**
 * Convert colors to CSS custom properties string
 */
export function toCssVariables(colors: PaletteColor[] | string[]): string {
  const hexes = toHexArrayInternal(colors)
  const lines = hexes.map((hex, i) => `  --figcolor-${i + 1}: ${hex};`)
  return `:root {\n${lines.join('\n')}\n}`
}
