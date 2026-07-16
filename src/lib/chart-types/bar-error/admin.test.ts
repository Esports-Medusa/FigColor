import type { CanonicalPalette } from '@/types/palette'
import {
  buildBarErrorPreviewPayload,
  buildLocalBarErrorPreviewCase,
  cloneEditableBarErrorDraft,
  editableDraftFromPreviewCase,
  editableDraftFromSuggestion,
  validateEditableBarErrorDraft
} from './admin'
import { suggestBarErrorPreviewDraft } from './suggestion'

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

const palette: CanonicalPalette = {
  id: 'palette-1',
  slug: 'admin-palette',
  name: 'Admin Palette',
  status: 'draft',
  colors: [
    { id: 'blue-id', hex: '#2458A6', rgb: [36, 88, 166], order: 0 },
    { id: 'orange-id', hex: '#D55E00', rgb: [213, 94, 0], order: 1 },
    { id: 'green-id', hex: '#009E73', rgb: [0, 158, 115], order: 2 },
    { id: 'purple-id', hex: '#CC79A7', rgb: [204, 121, 167], order: 3 }
  ],
  color_count: 4,
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

function testEditableDraftDoesNotMutateSuggestion(): void {
  const suggestion = suggestBarErrorPreviewDraft(palette)
  expect(suggestion.ok, 'suggestion should succeed')
  if (!suggestion.ok) return

  const draft = editableDraftFromSuggestion(suggestion.value)
  draft.groups[0].label = 'Edited'
  draft.config.sample_size = 12

  expect(suggestion.value.color_roles.groups[0].label === 'Group 1', 'editing local draft should not mutate suggestion roles')
  expect(suggestion.value.preview_config.sample_size === 24, 'editing local draft should not mutate suggestion config')
}

function testEditableDraftDoesNotMutatePreviewCase(): void {
  const previewCase = buildLocalBarErrorPreviewCase(palette.id, editableDraftFromSuggestion(suggestOrThrow()), {
    id: 'preview-1',
    status: 'draft'
  })

  const draft = editableDraftFromPreviewCase(previewCase)
  draft.groups[1].color_id = 'green-id'
  const originalRoles = previewCase.color_roles as { groups: Array<{ fill: { color_id: string } }> }
  expect(originalRoles.groups[1].fill.color_id === 'orange-id', 'editing local draft should not mutate API preview case object')
}

function testPayloadUsesStableColorIds(): void {
  const draft = editableDraftFromSuggestion(suggestOrThrow())
  const payload = buildBarErrorPreviewPayload(draft)
  const roles = payload.color_roles as { groups: Array<{ fill: { source: string; color_id: string } }> }

  expect(roles.groups.map((group) => group.fill.color_id).join(',') === 'blue-id,orange-id,green-id,purple-id', 'payload should persist stable color IDs')
  expect(!JSON.stringify(payload).includes('color-0'), 'payload should not invent index color IDs')
  expect(payload.seed_strategy === 'stable_id' && payload.seed_value === null, 'payload should keep deterministic stable_id seed')
}

function testValidationPassesForSuggestedDraft(): void {
  const draft = editableDraftFromSuggestion(suggestOrThrow())
  const issues = validateEditableBarErrorDraft(palette, draft)
  expect(issues.length === 0, `suggested editable draft should validate: ${JSON.stringify(issues)}`)
}

function testValidationReportsLocalIssues(): void {
  const draft = editableDraftFromSuggestion(suggestOrThrow())
  draft.groups = draft.groups.slice(0, 2)
  draft.groups[0].color_id = 'missing-color'

  const issues = validateEditableBarErrorDraft(palette, draft)
  expect(issues.some((issue) => issue.code === 'INVALID_BAR_ERROR_GROUP_COUNT'), 'group-count issue should be reported')
  expect(issues.some((issue) => issue.code === 'COLOR_NOT_FOUND'), 'missing palette color issue should be reported')
}

function testCloneIsDeepEnoughForEditorState(): void {
  const draft = editableDraftFromSuggestion(suggestOrThrow())
  const cloned = cloneEditableBarErrorDraft(draft)
  cloned.groups[0].label = 'Clone only'
  cloned.config.data_pattern = 'dose_response'

  expect(draft.groups[0].label === 'Group 1', 'cloned groups should be independent')
  expect(draft.config.data_pattern === 'mixed', 'cloned config should be independent')
}

function suggestOrThrow() {
  const result = suggestBarErrorPreviewDraft(palette)
  if (!result.ok) {
    throw new Error(result.message)
  }
  return result.value
}

testEditableDraftDoesNotMutateSuggestion()
testEditableDraftDoesNotMutatePreviewCase()
testPayloadUsesStableColorIds()
testValidationPassesForSuggestedDraft()
testValidationReportsLocalIssues()
testCloneIsDeepEnoughForEditorState()
