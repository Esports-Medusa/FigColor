import { sanitizeExportIdentifiers } from './identifiers'
import type { PaletteExportModel } from './types'

export function toCssCustomProperties(model: PaletteExportModel): string {
  const keys = sanitizeExportIdentifiers(model.colors.map((color) => color.key), 'css')
  const lines = model.colors.map((color, index) => `  --figcolor-${keys[index]}: ${color.hex};`)
  return `:root {\n${lines.join('\n')}\n}`
}

