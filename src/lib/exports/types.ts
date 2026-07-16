export type ExportSource = 'bar_error_roles' | 'palette_order_fallback'

export type ExportIdentifierTarget = 'python' | 'r' | 'css'

export interface ExportColor {
  key: string
  label: string
  colorId: string
  hex: string
  rgb: [number, number, number]
  order: number
}

export interface PaletteExportModel {
  source: ExportSource
  colors: ExportColor[]
  namedColors: Record<string, string>
  warnings: string[]
}
