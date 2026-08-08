import {
  PaletteNormalizationError,
  normalizePalette,
  normalizePaletteToCanonical
} from '@/lib/palette'
import { chartFilterMatchesPalette } from '@/lib/palette/applicability'
import type { RawPaletteDTO, RawPalettePreviewCase } from '@/types/palette'

function baseRawPalette(overrides: Partial<RawPaletteDTO> = {}): RawPaletteDTO {
  return {
    id: 'palette-1',
    slug: 'test-palette',
    name: 'Test Palette',
    status: 'published',
    colors: [{ id: 'color-1', hex: '#112233' }],
    type: 'categorical',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides
  }
}

function baseRawPreviewCase(overrides: Partial<RawPalettePreviewCase> = {}): RawPalettePreviewCase {
  return {
    id: 'preview-1',
    palette_id: 'palette-1',
    chart_type: 'bar_error',
    template_id: 'bar_error_v1',
    template_version: 1,
    schema_version: 1,
    color_roles: { groups: [] },
    preview_config: { show_error_bars: true },
    seed_strategy: 'stable_id',
    seed_value: null,
    is_primary: true,
    status: 'published',
    ...overrides
  }
}

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

function expectNormalizationIssue(raw: RawPaletteDTO, code: string): void {
  try {
    normalizePaletteToCanonical(raw)
  } catch (error) {
    if (!(error instanceof PaletteNormalizationError)) {
      throw new Error(`expected PaletteNormalizationError for ${code}`)
    }
    const normalizationError = error
    expect(normalizationError.issues.some((issue) => issue.code === code), `expected issue code ${code}`)
    return
  }
  throw new Error(`expected normalization to reject ${code}`)
}

function testMissingPreviewCasesNormalizeToEmptyArray(): void {
  const palette = normalizePaletteToCanonical(baseRawPalette())
  expect(palette.preview_cases.length === 0, 'missing preview_cases should normalize to []')
}

function testNullPrimaryNormalizesToNull(): void {
  const palette = normalizePaletteToCanonical(baseRawPalette({ primary_preview_case: null }))
  expect(palette.primary_preview_case === null, 'null primary should normalize to null')
}

function testPublishedPreviewNormalizes(): void {
  const preview = baseRawPreviewCase({ seed_strategy: 'fixed', seed_value: 42 })
  const palette = normalizePaletteToCanonical(baseRawPalette({
    primary_preview_case: preview,
    preview_cases: [preview]
  }))
  expect(palette.primary_preview_case?.chart_type === 'bar_error', 'published primary chart type should normalize')
  expect(palette.primary_preview_case?.seed_value === 42, 'fixed seed value should normalize')
  expect(palette.preview_cases[0].id === 'preview-1', 'preview case should normalize')
}

function testUnknownChartTypeRejected(): void {
  expectNormalizationIssue(
    baseRawPalette({ preview_cases: [baseRawPreviewCase({ chart_type: 'scatter' })] }),
    'UNKNOWN_CHART_TYPE'
  )
}

function testInvalidSeedStrategyRejected(): void {
  expectNormalizationIssue(
    baseRawPalette({ preview_cases: [baseRawPreviewCase({ seed_strategy: 'random' })] }),
    'INVALID_SEED_STRATEGY'
  )
}

function testPrimaryPaletteMismatchRejected(): void {
  expectNormalizationIssue(
    baseRawPalette({ primary_preview_case: baseRawPreviewCase({ palette_id: 'other-palette' }) }),
    'PRIMARY_PREVIEW_PALETTE_MISMATCH'
  )
}

function testOrderPreserved(): void {
  const palette = normalizePaletteToCanonical(baseRawPalette({
    preview_cases: [
      baseRawPreviewCase({ id: 'first', is_primary: false }),
      baseRawPreviewCase({ id: 'second', is_primary: true })
    ]
  }))
  expect(palette.preview_cases.map((preview) => preview.id).join(',') === 'first,second', 'preview case order should be preserved')
}

function testLegacyPayloadWithoutPreviewFieldsNormalizes(): void {
  const palette = normalizePaletteToCanonical(baseRawPalette({ chart_type: 'bar' }))
  expect(palette.primary_preview_case === null, 'legacy payload should have null primary')
  expect(palette.preview_cases.length === 0, 'legacy payload should have empty preview_cases')
}

function testUndefinedApplicabilityFallsBackToLegacyChartTypes(): void {
  const palette = normalizePalette(baseRawPalette({ chart_types: ['bar', 'heatmap'] }))
  expect(palette.chart_applicability === undefined, 'missing applicability should remain undefined')
  expect(palette.chart_type.join(',') === 'bar_error,heatmap_annotated', 'legacy chart_types should map to Phase 1 compatibility chart_type')
}

function testEmptyApplicabilityDoesNotFallBackToLegacyChartTypes(): void {
  const palette = normalizePalette(baseRawPalette({
    chart_types: ['bar'],
    chart_applicability: []
  }))
  expect(Array.isArray(palette.chart_applicability), 'empty applicability should remain authoritative')
  expect(palette.chart_type.length === 0, 'empty applicability must not fall back to legacy chart_types')
}

function testCuratedApplicabilityOrderPreservedInCompatibilityAdapter(): void {
  const palette = normalizePalette(baseRawPalette({
    chart_types: ['bar'],
    chart_applicability: [
      { chart_type: 'line_multiseries', suitability: 'best_fit', source: 'curated' },
      { chart_type: 'bar_error', suitability: 'compatible', source: 'curated' }
    ]
  }))
  expect(palette.chart_type.join(',') === 'line_multiseries,bar_error', 'curated applicability order should drive compatibility chart_type')
}

function testInvalidApplicabilityRejected(): void {
  expectNormalizationIssue(
    baseRawPalette({
      chart_applicability: [
        { chart_type: 'bar_error', suitability: 'best_fit' },
        { chart_type: 'bar_error', suitability: 'best_fit' }
      ]
    }),
    'DUPLICATE_CHART_TYPE'
  )
  expectNormalizationIssue(
    baseRawPalette({
      chart_applicability: [
        { chart_type: 'bar_error', suitability: 'best_fit' },
        { chart_type: 'line_multiseries', suitability: 'best_fit' }
      ]
    }),
    'MULTIPLE_BEST_FIT'
  )
}

function testChartFilterMatchesBroadAndPhaseOneChartTypes(): void {
  const curated = normalizePalette(baseRawPalette({
    chart_types: ['line'],
    chart_applicability: [
      { chart_type: 'bar_error', suitability: 'compatible', source: 'curated' },
      { chart_type: 'boxplot_jitter', suitability: 'compatible', source: 'curated' },
      { chart_type: 'line_multiseries', suitability: 'best_fit', source: 'curated' },
      { chart_type: 'heatmap_annotated', suitability: 'compatible', source: 'curated' }
    ]
  }))

  expect(chartFilterMatchesPalette(curated, 'bar'), 'bar filter should match bar_error applicability')
  expect(chartFilterMatchesPalette(curated, 'boxplot'), 'boxplot filter should match boxplot_jitter applicability')
  expect(chartFilterMatchesPalette(curated, 'violin'), 'violin filter should match boxplot_jitter applicability')
  expect(chartFilterMatchesPalette(curated, 'line'), 'line filter should match line_multiseries applicability')
  expect(chartFilterMatchesPalette(curated, 'heatmap'), 'heatmap filter should match heatmap_annotated applicability')
  expect(chartFilterMatchesPalette(curated, 'line_multiseries'), 'precise Phase 1 filter should match directly')
  expect(!chartFilterMatchesPalette(curated, 'scatter'), 'undeclared broad chart filter should not match curated applicability')
}

function testChartFilterRespectsEmptyApplicabilityAndLegacyFallback(): void {
  const migratedEmpty = normalizePalette(baseRawPalette({
    chart_types: ['heatmap'],
    chart_applicability: []
  }))
  const legacy = normalizePalette(baseRawPalette({
    chart_types: ['heatmap', 'line']
  }))

  expect(!chartFilterMatchesPalette(migratedEmpty, 'heatmap'), 'empty applicability should not fall back to legacy heatmap')
  expect(chartFilterMatchesPalette(legacy, 'heatmap'), 'legacy heatmap should match without chart_applicability')
  expect(chartFilterMatchesPalette(legacy, 'line'), 'legacy line should match without chart_applicability')
}

testMissingPreviewCasesNormalizeToEmptyArray()
testNullPrimaryNormalizesToNull()
testPublishedPreviewNormalizes()
testUnknownChartTypeRejected()
testInvalidSeedStrategyRejected()
testPrimaryPaletteMismatchRejected()
testOrderPreserved()
testLegacyPayloadWithoutPreviewFieldsNormalizes()
testUndefinedApplicabilityFallsBackToLegacyChartTypes()
testEmptyApplicabilityDoesNotFallBackToLegacyChartTypes()
testCuratedApplicabilityOrderPreservedInCompatibilityAdapter()
testInvalidApplicabilityRejected()
testChartFilterMatchesBroadAndPhaseOneChartTypes()
testChartFilterRespectsEmptyApplicabilityAndLegacyFallback()
