import { sanitizeExportIdentifiers } from './identifiers'
import { quote } from './bar-error'
import type { PaletteExportModel } from './types'

export function toPythonList(model: PaletteExportModel): string {
  return `colors = [${model.colors.map((color) => quote(color.hex)).join(', ')}]`
}

export function toPythonDictionary(model: PaletteExportModel): string {
  const entries = model.colors.map((color) => `    ${quote(color.key)}: ${quote(color.hex)},`)
  return `colors = {\n${entries.join('\n')}\n}`
}

export function toMatplotlibSnippet(model: PaletteExportModel): string {
  const dictionary = toPythonDictionary(model)
  const groupOrder = model.colors.map((color) => quote(color.key)).join(', ')
  return `import matplotlib.pyplot as plt\n\n${dictionary}\n\ngroup_order = [${groupOrder}]\nbar_colors = [colors[key] for key in group_order]`
}

export function toSeabornSnippet(model: PaletteExportModel): string {
  const colors = model.colors.map((color) => quote(color.hex)).join(', ')
  return `import seaborn as sns\n\ncolors = [${colors}]\nsns.set_palette(colors)`
}

export function toPythonIdentifierDictionary(model: PaletteExportModel): string {
  const keys = sanitizeExportIdentifiers(model.colors.map((color) => color.key), 'python')
  const entries = model.colors.map((color, index) => `    ${keys[index]}: ${quote(color.hex)},`)
  return `colors = {\n${entries.join('\n')}\n}`
}
