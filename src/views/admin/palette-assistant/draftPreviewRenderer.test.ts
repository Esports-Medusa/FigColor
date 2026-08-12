import { createPreviewDefaults } from '@/lib/chart-types/previewDefaults'
import type { EditableAssistantDraft } from './workbench'
import { DRAFT_RENDER_PALETTE_KEY, DRAFT_RENDER_PREVIEW_KEY, renderDraftPreview, toRenderPalette, toRenderPreviewCase } from './draftPreviewRenderer'

function expect(condition: boolean, message: string): void { if (!condition) throw new Error(message) }

const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002']
const created = createPreviewDefaults('bar_error', ids, -2147483648)
if (!created.ok) throw new Error(created.message)
const draft: EditableAssistantDraft = {
  contract_version: 'palette-assistant.v1', revision: 1, name: 'Draft', type: 'categorical',
  colors: ids.map((id, order) => ({ id, hex: order ? '#D55E00' : '#2458A6', order, source: 'admin', state: 'modified', classification: 'data' })),
  chart_applicability: [], disciplines: [], use_cases: [], avoid_cases: [], tags: [],
  accessibility: { colorblind_safe: false, print_friendly: false, dark_background: false },
  source_type: 'figure_extracted', source_note: '', preview_cases: [created.value], provenance: []
}
const before = JSON.stringify(draft)
const first = renderDraftPreview(draft, draft.preview_cases[0])
expect(first.state === 'svg' && first.markup.includes('<svg'), 'valid Draft adapter must produce real renderer SVG')
expect(JSON.stringify(draft) === before, 'adapter and renderer must not mutate Draft input')

draft.colors[0].hex = '#ABCDEF'
const edited = renderDraftPreview(draft, draft.preview_cases[0])
expect(edited.state === 'svg' && edited.markup.includes('#ABCDEF'), 'HEX edits must resolve the latest color by stable ID')
draft.colors.reverse()
expect(renderDraftPreview(draft, draft.preview_cases[0]).markup.includes('#ABCDEF'), 'reorder must preserve stable-ID binding')
draft.colors.splice(draft.colors.findIndex((color) => color.id === ids[0]), 1)
const missing = renderDraftPreview(draft, draft.preview_cases[0])
expect(missing.state === 'invalid' && missing.markup === '', 'deleted references must fail closed without success-looking fallback')
const malformed = structuredClone(draft.preview_cases[0]); (malformed.color_roles as any).groups[0].fill = { source: 'palette', color_id: '#ABCDEF' }
expect(renderDraftPreview(draft, malformed).state === 'invalid', 'malformed/HEX references must fail closed without rebinding')

const paletteModel = toRenderPalette(draft)
const previewModel = toRenderPreviewCase(draft.preview_cases[0])
expect(paletteModel.id === DRAFT_RENDER_PALETTE_KEY && previewModel.id === DRAFT_RENDER_PREVIEW_KEY, 'adapter must use explicit renderer-only keys')
expect(!/^[0-9a-f-]{36}$/i.test(paletteModel.id + previewModel.id), 'transient keys must not be fake UUIDs')
expect(!before.includes(DRAFT_RENDER_PALETTE_KEY) && !before.includes(DRAFT_RENDER_PREVIEW_KEY), 'transient keys must never enter Draft state')
const renderableDraft = structuredClone(draft); renderableDraft.colors = ids.map((id, order) => ({ id, hex: order ? '#D55E00' : '#2458A6', order, source: 'admin', state: 'modified', classification: 'data' }))
const unsupported = renderDraftPreview(renderableDraft, renderableDraft.preview_cases[0], () => ({ ok: false, kind: 'unsupported', code: 'NO_RENDERER', message: 'No renderer.' }))
const errored = renderDraftPreview(renderableDraft, renderableDraft.preview_cases[0], () => ({ ok: false, kind: 'error', code: 'FAILED', message: 'Renderer failed.' }))
expect(unsupported.state === 'unsupported' && errored.state === 'error', 'adapter must preserve distinct unsupported and renderer-error states')
const maxSeed = createPreviewDefaults('bar_error', ids, 2147483647)
expect(maxSeed.ok && renderDraftPreview(renderableDraft, maxSeed.value).state === 'svg', 'signed 32-bit maximum seed must be renderable')
