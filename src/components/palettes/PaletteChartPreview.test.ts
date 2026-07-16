import {
  createPaletteChartPreviewModel,
  selectPalettePreviewCase
} from './PaletteChartPreview.logic'
import type { CanonicalPalette, PalettePreviewCase } from '@/types/palette'

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

const previewCase: PalettePreviewCase = {
  id: 'preview-1',
  palette_id: 'palette-1',
  chart_type: 'bar_error',
  template_id: 'bar_error_v1',
  template_version: 1,
  schema_version: 1,
  color_roles: {
    groups: [
      { key: 'control', label: 'Control', fill: { source: 'palette', color_id: 'color-1' } },
      { key: 'treated', label: 'Treated', fill: { source: 'palette', color_id: 'color-2' } },
      { key: 'rescue', label: 'Rescue', fill: { source: 'palette', color_id: 'color-3' } }
    ],
    elements: {
      axis: { source: 'theme', token: 'foreground' },
      grid: { source: 'theme', token: 'grid' },
      text: { source: 'theme', token: 'muted_foreground' },
      error_bar: { source: 'theme', token: 'foreground' },
      background: { source: 'theme', token: 'background' }
    }
  },
  preview_config: {
    orientation: 'vertical',
    sample_size: 24,
    error_type: 'sem',
    data_pattern: 'treatment_higher'
  },
  seed_strategy: 'stable_id',
  seed_value: null,
  is_primary: true,
  status: 'published'
}

const palette: CanonicalPalette = {
  id: 'palette-1',
  slug: 'test-palette',
  name: 'Test Palette',
  status: 'published',
  colors: [
    { id: 'color-1', hex: '#2458A6', rgb: [36, 88, 166], order: 0 },
    { id: 'color-2', hex: '#D55E00', rgb: [213, 94, 0], order: 1 },
    { id: 'color-3', hex: '#009E73', rgb: [0, 158, 115], order: 2 }
  ],
  color_count: 3,
  type: 'categorical',
  chart_types: ['bar_error'],
  journal_style: ['general'],
  disciplines: [],
  use_cases: [],
  avoid_cases: [],
  tags: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  primary_preview_case: previewCase,
  preview_cases: [previewCase]
}

function testPrimaryPreviewRendersInternalSvg(): void {
  const selected = selectPalettePreviewCase(palette, undefined, false)
  const model = createPaletteChartPreviewModel(palette, selected)
  expect(model.state === 'svg', 'successful primary preview should render svg state')
  expect(model.svgMarkup.includes('<svg'), 'successful primary preview should include generated SVG markup')
  expect(model.svgMarkup.includes('#2458A6'), 'generated SVG should use palette colors')
  expect(model.accessibleLabel === null, 'successful SVG should not add a duplicate outer accessible label')
}

function testMissingPrimaryPreviewUsesFallback(): void {
  const legacyPalette = { ...palette, primary_preview_case: null, preview_cases: [previewCase] }
  const selected = selectPalettePreviewCase(legacyPalette, undefined, false)
  const model = createPaletteChartPreviewModel(legacyPalette, selected)
  expect(model.state === 'no-preview', 'missing primary preview should render no-preview state')
  expect(model.svgMarkup === '', 'missing primary preview should not auto-select another preview case')
  expect(model.fallbackColors.join(',') === '#2458A6,#D55E00,#009E73', 'fallback should use palette colors')
  expect(model.accessibleLabel === 'Colour palette preview', 'no-preview fallback should expose public palette label')
}

function testExplicitNullPreviewCaseOverridesPrimary(): void {
  const selected = selectPalettePreviewCase(palette, null, true)
  const model = createPaletteChartPreviewModel(palette, selected)
  expect(model.state === 'no-preview', 'explicit null preview case should be respected')
  expect(model.svgMarkup === '', 'explicit null preview case should not render palette primary preview')
  expect(model.accessibleLabel === 'Colour palette preview', 'explicit null fallback should expose public palette label')
}

function testInvalidPreviewUsesPublicFallback(): void {
  const model = createPaletteChartPreviewModel(
    palette,
    { ...previewCase, color_roles: { groups: [], elements: {} } }
  )
  expect(model.state === 'invalid', 'invalid preview should render invalid state')
  expect(model.svgMarkup === '', 'invalid preview should not expose generated markup')
  expect(model.accessibleLabel === 'Scientific chart preview unavailable', 'invalid fallback should expose public unavailable label')
}

function testUnsupportedPreviewUsesPublicFallback(): void {
  const model = createPaletteChartPreviewModel(
    palette,
    previewCase,
    () => ({
      ok: false,
      kind: 'unsupported',
      code: 'PREVIEW_RENDERER_NOT_FOUND',
      message: 'internal message'
    })
  )
  expect(model.state === 'unsupported', 'unsupported preview should render unsupported state')
  expect(model.svgMarkup === '', 'unsupported preview should not expose SVG markup')
  expect(model.accessibleLabel === 'Scientific chart preview unavailable', 'unsupported fallback should expose public unavailable label')
  expect(!JSON.stringify(model).includes('internal message'), 'unsupported fallback should not expose internal messages')
}

function testRendererFailuresUseFallbackStates(): void {
  const model = createPaletteChartPreviewModel(
    palette,
    previewCase,
    () => ({
      ok: false,
      kind: 'error',
      code: 'PREVIEW_RENDER_FAILED',
      message: 'private failure'
    })
  )
  expect(model.state === 'error', 'renderer errors should use error state')
  expect(model.svgMarkup === '', 'renderer errors should render fallback instead of details')
  expect(model.accessibleLabel === 'Scientific chart preview unavailable', 'renderer error fallback should expose public unavailable label')
  expect(!JSON.stringify(model).includes('private failure'), 'renderer error fallback should not expose internal messages')
}

testPrimaryPreviewRendersInternalSvg()
testMissingPrimaryPreviewUsesFallback()
testExplicitNullPreviewCaseOverridesPrimary()
testInvalidPreviewUsesPublicFallback()
testUnsupportedPreviewUsesPublicFallback()
testRendererFailuresUseFallbackStates()
