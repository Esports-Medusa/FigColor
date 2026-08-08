import { getChartTemplateDefinition } from '@/lib/chart-types/registry'
import { getPhase1ChartTypesForLegacyKey } from '@/lib/palette/schema'
import { normalizeLegacyChartTypesToApplicability, SUPPORTED_PREVIEW_CHART_TYPES } from '@/lib/palette/applicability'
import { renderPalettePreview } from '@/lib/renderers'
import { normalizePalette } from '@/lib/palette'
import scatterViolinSeedSource from '../../backend/dev/seed_scatter_violin_preview_palettes.sql?raw'
import type { CanonicalPalette, PalettePreviewCase } from '@/types/palette'

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

const palette: CanonicalPalette = {
  id: 'extension-palette',
  slug: 'extension-palette',
  name: 'Extension Palette',
  status: 'published',
  colors: [
    { id: 'c1', hex: '#2458A6', rgb: [36, 88, 166], order: 0 },
    { id: 'c2', hex: '#D55E00', rgb: [213, 94, 0], order: 1 },
    { id: 'c3', hex: '#009E73', rgb: [0, 158, 115], order: 2 },
    { id: 'c4', hex: '#CC79A7', rgb: [204, 121, 167], order: 3 },
    { id: 'c5', hex: '#E69F00', rgb: [230, 159, 0], order: 4 }
  ],
  color_count: 5,
  type: 'categorical',
  chart_types: [],
  journal_style: [],
  disciplines: [],
  use_cases: [],
  avoid_cases: [],
  tags: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  primary_preview_case: null,
  preview_cases: []
}

const elements = {
  axis: { source: 'theme', token: 'foreground' },
  muted_foreground: { source: 'theme', token: 'muted_foreground' },
  grid: { source: 'theme', token: 'grid' },
  background: { source: 'theme', token: 'background' }
}

function scatter(groupCount = 3, overrides: Partial<PalettePreviewCase> = {}): PalettePreviewCase {
  return {
    id: 'scatter-preview',
    palette_id: palette.id,
    chart_type: 'scatter_grouped',
    template_id: 'scatter_grouped_v1',
    template_version: 1,
    schema_version: 1,
    color_roles: {
      groups: palette.colors.slice(0, groupCount).map((color, index) => ({
        key: `g${index + 1}`,
        label: `Group ${index + 1}`,
        color: { source: 'palette', color_id: color.id }
      })),
      elements
    },
    preview_config: { point_count: 14, data_pattern: 'clusters', point_size: 'medium', point_opacity: 0.68 },
    seed_strategy: 'stable_id',
    seed_value: null,
    is_primary: false,
    status: 'draft',
    ...overrides
  }
}

function violin(groupCount = 3, overrides: Partial<PalettePreviewCase> = {}): PalettePreviewCase {
  return {
    ...scatter(),
    id: 'violin-preview',
    chart_type: 'violin_distribution',
    template_id: 'violin_distribution_v1',
    color_roles: {
      groups: palette.colors.slice(0, groupCount).map((color, index) => ({
        key: `d${index + 1}`,
        label: `Distribution ${index + 1}`,
        fill: { source: 'palette', color_id: color.id }
      })),
      elements: {
        outline: { source: 'theme', token: 'foreground' },
        median: { source: 'theme', token: 'foreground' },
        axis: { source: 'theme', token: 'foreground' },
        grid: { source: 'theme', token: 'grid' },
        background: { source: 'theme', token: 'background' }
      }
    },
    preview_config: { sample_count: 28, distribution_shape: 'mixed', bandwidth: 'medium', show_summary: true },
    ...overrides
  }
}

function testRegistrationAndCompatibility(): void {
  expect(getChartTemplateDefinition('scatter_grouped', 'scatter_grouped_v1')?.id === 'scatter_grouped_v1', 'scatter should be registered')
  expect(getChartTemplateDefinition('violin_distribution', 'violin_distribution_v1')?.id === 'violin_distribution_v1', 'violin should be registered')
  expect(SUPPORTED_PREVIEW_CHART_TYPES.includes('scatter_grouped'), 'scatter should be supported for applicability')
  expect(SUPPORTED_PREVIEW_CHART_TYPES.includes('violin_distribution'), 'violin should be supported for applicability')
  expect(getPhase1ChartTypesForLegacyKey('scatter')[0] === 'scatter_grouped', 'legacy scatter should map to scatter_grouped')
  expect(getPhase1ChartTypesForLegacyKey('violin')[0] === 'violin_distribution', 'legacy violin should map to violin_distribution')
  expect(normalizeLegacyChartTypesToApplicability(['scatter', 'violin']).map((item) => item.chart_type).join(',') === 'scatter_grouped,violin_distribution,boxplot_jitter', 'legacy applicability should add new canonical types while preserving violin compatibility')
}

function testRenderingAndDeterminism(): void {
  for (const previewCase of [scatter(), violin()]) {
    const first = renderPalettePreview(palette, previewCase)
    const second = renderPalettePreview(palette, previewCase)
    expect(first.ok && second.ok, `${previewCase.chart_type} should render`)
    expect(first.ok && second.ok && first.markup === second.markup, `${previewCase.chart_type} should be deterministic`)
    expect(first.ok && !/NaN|Infinity|undefined/.test(first.markup), `${previewCase.chart_type} should emit finite SVG`)
  }
}

function testVariableGroupsAndColors(): void {
  for (const count of [1, 2, 4, 5]) {
    const scatterResult = renderPalettePreview(palette, scatter(count))
    const scatterRepeat = renderPalettePreview(palette, scatter(count))
    const violinResult = renderPalettePreview(palette, violin(count))
    const violinRepeat = renderPalettePreview(palette, violin(count))
    expect(scatterResult.ok && countOccurrences(scatterResult.markup, 'class="scatter-group"') === count, `scatter should render ${count} groups`)
    expect(violinResult.ok && countOccurrences(violinResult.markup, 'class="violin-group"') === count, `violin should render ${count} groups`)
    expect(scatterResult.ok && scatterResult.width === 360 && scatterResult.height === 220, 'scatter should remain 360 × 220')
    expect(violinResult.ok && violinResult.width === 360 && violinResult.height === 220, 'violin should remain 360 × 220')
    expect(scatterResult.ok && scatterRepeat.ok && scatterResult.markup === scatterRepeat.markup, `scatter ${count}-group output should be deterministic`)
    expect(violinResult.ok && violinRepeat.ok && violinResult.markup === violinRepeat.markup, `violin ${count}-group output should be deterministic`)
    if (scatterResult.ok && violinResult.ok) {
      palette.colors.slice(0, count).forEach((color) => {
        expect(scatterResult.markup.includes(`fill="${color.hex}"`), `scatter should visibly use ${color.hex}`)
        expect(violinResult.markup.includes(`fill="${color.hex}"`), `violin should visibly use ${color.hex}`)
      })
      expectCoordinatesWithinCanvas(scatterResult.markup, 'scatter')
      expectCoordinatesWithinCanvas(violinResult.markup, 'violin')
    }
  }
  const changedPalette = { ...palette, colors: palette.colors.map((color, index) => index === 0 ? { ...color, hex: '#ABCDEF' } : color) }
  const scatterResult = renderPalettePreview(changedPalette, scatter())
  const violinResult = renderPalettePreview(changedPalette, violin())
  expect(scatterResult.ok && scatterResult.markup.includes('#ABCDEF'), 'scatter marks should use resolved palette colors')
  expect(violinResult.ok && violinResult.markup.includes('#ABCDEF'), 'violin marks should use resolved palette colors')
}

function testFailures(): void {
  const missingScatter = scatter(2)
  ;(missingScatter.color_roles as any).groups[0].color.color_id = 'missing'
  const missingViolin = violin(2)
  ;(missingViolin.color_roles as any).groups[0].fill.color_id = 'missing'
  for (const previewCase of [missingScatter, missingViolin]) {
    const result = renderPalettePreview(palette, previewCase)
    expect(!result.ok && result.code === 'COLOR_RESOLUTION_FAILED', `${previewCase.chart_type} missing colors should fail resolution`)
  }
  const badOpacity = scatter(2)
  ;(badOpacity.color_roles as any).groups[0].color.opacity = 1.5
  const opacityResult = renderPalettePreview(palette, badOpacity)
  expect(!opacityResult.ok && opacityResult.code === 'PREVIEW_CASE_INVALID', 'invalid role opacity should fail validation')
  const badConfig = violin(2, { preview_config: { sample_count: 2, distribution_shape: 'normal', bandwidth: 'medium', show_summary: true } })
  const configResult = renderPalettePreview(palette, badConfig)
  expect(!configResult.ok && configResult.code === 'PREVIEW_CASE_INVALID', 'malformed violin config should fail validation')
  const empty = scatter(0)
  const emptyResult = renderPalettePreview(palette, empty)
  expect(!emptyResult.ok && emptyResult.code === 'PREVIEW_CASE_INVALID', 'empty scatter groups should fail validation')
}

function testPublicApiNormalizationAcceptsNewPreviewTypes(): void {
  for (const previewCase of [
    scatter(3, { status: 'published', is_primary: true }),
    violin(3, { status: 'published', is_primary: true })
  ]) {
    const normalized = normalizePalette({
      ...palette,
      primary_preview_case: previewCase,
      preview_cases: [previewCase]
    })
    expect(normalized.primary_preview_case?.chart_type === previewCase.chart_type, `${previewCase.chart_type} should survive public API normalization`)
    expect(normalized.preview_cases[0]?.chart_type === previewCase.chart_type, `${previewCase.chart_type} should normalize in preview_cases`)
  }
}

function testSeedMapsAllFivePaletteColorsToDataGroups(): void {
  expect(scatterViolinSeedSource.includes('5 AS group_count'), 'scatter/violin dev seed should create five resolved data roles')
  expect(scatterViolinSeedSource.includes("palette_rows.slug || '-color-' || group_index"), 'each seeded group should map its corresponding palette color')
}

function countOccurrences(value: string, needle: string): number {
  return value.split(needle).length - 1
}

function expectCoordinatesWithinCanvas(markup: string, renderer: string): void {
  const attributes = /\b(x|x1|x2|cx|y|y1|y2|cy)="(-?\d+(?:\.\d+)?)"/g
  let match = attributes.exec(markup)
  while (match) {
    const value = Number(match[2])
    const maximum = match[1].startsWith('x') || match[1] === 'cx' ? 360 : 220
    expect(value >= 0 && value <= maximum, `${renderer} ${match[1]}=${value} should remain inside the SVG canvas`)
    match = attributes.exec(markup)
  }
}

testRegistrationAndCompatibility()
testRenderingAndDeterminism()
testVariableGroupsAndColors()
testFailures()
testPublicApiNormalizationAcceptsNewPreviewTypes()
testSeedMapsAllFivePaletteColorsToDataGroups()
