import type { PaletteExportModel } from './types'

export function toJsonExport(model: PaletteExportModel): string {
  return JSON.stringify({
    source: model.source,
    colors: model.colors.map((color) => ({
      key: color.key,
      label: color.label,
      color_id: color.colorId,
      hex: color.hex,
      rgb: color.rgb
    }))
  }, null, 2)
}
