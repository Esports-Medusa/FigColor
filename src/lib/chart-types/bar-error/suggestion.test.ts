import { validatePreviewCaseAgainstRegistry } from '@/lib/chart-types/registry'
import { renderPalettePreview } from '@/lib/renderers/renderPreview'
import type { CanonicalPalette, PalettePreviewCase } from '@/types/palette'
import { suggestBarErrorPreviewDraft } from './suggestion'

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

function palette(colorCount = 5): CanonicalPalette {
  return {
    id: 'palette-1',
    slug: 'suggestion-palette',
    name: 'Suggestion Palette',
    status: 'draft',
    colors: ([
      { id: 'stable-blue', hex: '#2458A6', rgb: [36, 88, 166], order: 0 },
      { id: 'stable-orange', hex: '#D55E00', rgb: [213, 94, 0], order: 1 },
      { id: 'stable-green', hex: '#009E73', rgb: [0, 158, 115], order: 2 },
      { id: 'stable-purple', hex: '#CC79A7', rgb: [204, 121, 167], order: 3 },
      { id: 'stable-yellow', hex: '#F0E442', rgb: [240, 228, 66], order: 4 },
      { id: 'stable-cyan', hex: '#56B4E9', rgb: [86, 180, 233], order: 5 },
      { id: 'stable-red', hex: '#E41A1C', rgb: [228, 26, 28], order: 6 },
      { id: 'stable-navy', hex: '#003F5C', rgb: [0, 63, 92], order: 7 },
      { id: 'stable-pink', hex: '#F781BF', rgb: [247, 129, 191], order: 8 },
      { id: 'stable-brown', hex: '#A65628', rgb: [166, 86, 40], order: 9 },
      { id: 'stable-gray', hex: '#777777', rgb: [119, 119, 119], order: 10 }
    ] as CanonicalPalette['colors']).slice(0, colorCount),
    color_count: colorCount,
    type: 'categorical',
    chart_types: ['bar_error'],
    journal_style: ['general'],
    disciplines: [],
    use_cases: [],
    avoid_cases: [],
    tags: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    primary_preview_case: null,
    preview_cases: []
  }
}

function toPreviewCase(basePalette: CanonicalPalette): PalettePreviewCase {
  const result = suggestBarErrorPreviewDraft(basePalette)
  if (!result.ok) {
    throw new Error(result.message)
  }

  return {
    id: 'draft-preview',
    palette_id: basePalette.id,
    is_primary: false,
    status: 'draft',
    ...result.value
  }
}

function testSuggestionUsesCanonicalOrderAndStableIds(): void {
  const basePalette = palette(5)
  const first = suggestBarErrorPreviewDraft(basePalette)
  const second = suggestBarErrorPreviewDraft(JSON.parse(JSON.stringify(basePalette)) as CanonicalPalette)

  expect(first.ok && second.ok, 'five-color palette should produce a suggestion')
  if (first.ok && second.ok) {
    expect(JSON.stringify(first.value) === JSON.stringify(second.value), 'suggestion should be deterministic')
    expect(first.value.color_roles.groups.map((group) => group.key).join(',') === 'group_1,group_2,group_3,group_4,group_5', 'group keys should be stable')
    expect(first.value.color_roles.groups.map((group) => group.fill.color_id).join(',') === 'stable-blue,stable-orange,stable-green,stable-purple,stable-yellow', 'fills should use stable color IDs in order')
    expect(first.value.preview_config.data_pattern === 'mixed', 'default data pattern should be neutral')
    expect(first.value.seed_strategy === 'stable_id' && first.value.seed_value === null, 'suggestion should use stable_id seed strategy')
  }
}

function testSuggestionCapsAtTenGroups(): void {
  const result = suggestBarErrorPreviewDraft(palette(11))
  expect(result.ok, 'eleven-color palette should produce a suggestion')
  if (result.ok) {
    expect(result.value.color_roles.groups.length === 10, 'suggestion should cap groups at ten')
  }
}

function testSuggestionRequiresAtLeastThreeColors(): void {
  const result = suggestBarErrorPreviewDraft(palette(2))
  expect(!result.ok, 'two-color palette should fail suggestion')
  if (!result.ok) {
    expect(result.code === 'INSUFFICIENT_COLORS', 'failure should be typed')
    expect(result.minimum === 3 && result.available === 2, 'failure should include color counts')
  }
}

function testSuggestionValidatesAndRenders(): void {
  const basePalette = palette(10)
  const previewCase = toPreviewCase(basePalette)
  const validation = validatePreviewCaseAgainstRegistry(previewCase)
  expect(validation.valid, `suggested preview should pass registry validation: ${JSON.stringify(validation.issues)}`)

  const rendered = renderPalettePreview(basePalette, previewCase)
  expect(rendered.ok, `suggested preview should render through public pipeline: ${JSON.stringify(rendered)}`)
}

testSuggestionUsesCanonicalOrderAndStableIds()
testSuggestionCapsAtTenGroups()
testSuggestionRequiresAtLeastThreeColors()
testSuggestionValidatesAndRenders()
