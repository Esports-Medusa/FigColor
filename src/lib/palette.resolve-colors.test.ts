import { resolveColorReference, resolveRoleColorReferences } from '@/lib/palette/resolveColors'
import type { PaletteColor } from '@/types/palette'

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

const paletteColors: PaletteColor[] = [
  { id: 'color-1', hex: '#112233', rgb: [17, 34, 51], order: 0 },
  { id: 'color-2', hex: '#AABBCC', rgb: [170, 187, 204], order: 1 }
]

const themeTokens = {
  foreground: '#111111',
  muted_foreground: '#666666',
  grid: '#CCCCCC',
  background: '#FFFFFF'
}

function testPaletteColorResolution(): void {
  const result = resolveColorReference({ source: 'palette', color_id: 'color-2' }, paletteColors, themeTokens)
  expect(result.ok && result.hex === '#AABBCC', 'palette source should resolve by stable color_id')
}

function testThemeColorResolution(): void {
  const result = resolveColorReference({ source: 'theme', token: 'grid' }, paletteColors, themeTokens)
  expect(result.ok && result.hex === '#CCCCCC', 'theme source should resolve by supported token')
}

function testResolutionFailures(): void {
  const missingColor = resolveColorReference({ source: 'palette', color_id: 'color-9' }, paletteColors, themeTokens)
  const unknownTheme = resolveColorReference({ source: 'theme', token: 'shadow' }, paletteColors, themeTokens)
  const unknownSource = resolveColorReference({ source: 'hex', value: '#000000' }, paletteColors, themeTokens)

  expect(!missingColor.ok && missingColor.errors[0].code === 'COLOR_NOT_FOUND', 'unknown color_id should fail')
  expect(!unknownTheme.ok && unknownTheme.errors[0].code === 'INVALID_THEME_TOKEN', 'unknown theme token should fail')
  expect(!unknownSource.ok && unknownSource.errors[0].code === 'UNKNOWN_COLOR_SOURCE', 'unknown source should fail')
}

function testRecursiveRoleResolution(): void {
  const result = resolveRoleColorReferences({
    groups: [{ fill: { source: 'palette', color_id: 'color-1' } }],
    elements: { axis: { source: 'theme', token: 'foreground' } }
  }, paletteColors, themeTokens)

  expect(result.ok, 'recursive role resolution should succeed')
  if (result.ok) {
    expect(result.colors['color_roles.groups[0].fill'] === '#112233', 'palette role path should resolve')
    expect(result.colors['color_roles.elements.axis'] === '#111111', 'theme role path should resolve')
  }
}

testPaletteColorResolution()
testThemeColorResolution()
testResolutionFailures()
testRecursiveRoleResolution()
