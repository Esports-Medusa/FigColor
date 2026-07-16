import { sanitizeExportIdentifiers } from './identifiers'
import type { PaletteExportModel } from './types'

export function toRNamedVector(model: PaletteExportModel): string {
  return `colors <- c(\n${toRNamedEntries(model, '  ')}\n)`
}

export function toGgplotFillScale(model: PaletteExportModel): string {
  return `scale_fill_manual(\n  values = c(\n${toRNamedEntries(model, '    ')}\n  )\n)`
}

function toRNamedEntries(model: PaletteExportModel, indent: string): string {
  const keys = sanitizeExportIdentifiers(model.colors.map((color) => color.key), 'r')
  return model.colors
    .map((color, index) => `${indent}${keys[index]} = ${rString(color.hex)}`)
    .join(',\n')
}

function rString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}
