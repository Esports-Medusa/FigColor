import type { PaletteExportModel } from './types'

export function toExportHexArray(model: PaletteExportModel): string {
  return `[\n  ${model.colors.map((color) => quote(color.hex)).join(',\n  ')}\n]`
}

export function toExportRgbTuples(model: PaletteExportModel): string {
  return `[\n  ${model.colors.map((color) => `(${color.rgb.join(', ')})`).join(',\n  ')}\n]`
}

export function quote(value: string): string {
  return JSON.stringify(value)
}
