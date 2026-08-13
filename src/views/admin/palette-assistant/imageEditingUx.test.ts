import controlledVocabularies from '../../../../contracts/palette-ingestion/v1/controlled-vocabularies.json'
import workbenchSource from './AdminPaletteAssistantWorkbench.vue?raw'
import {
  MAX_ASSISTANT_IMAGE_BYTES, addPickedDraftColor, createInitialState, mutateDraft,
  validateAssistantImageSelection, type EditableAssistantDraft
} from './workbench'
import { mapContainedImagePoint, sampleMedianHex } from './imageColorPicker'
import { ASSISTANT_CONTROLLED_VOCABULARIES, isAuthoritativeVocabularyValue, selectableVocabularyValues } from './controlledVocabulary'

function expect(condition: boolean, message: string): void { if (!condition) throw new Error(message) }
function file(name: string, type: string, size = 1): File { return new File([new Uint8Array(size)], name, { type }) }

function testSharedUploadPathAndGuards(): void {
  expect(workbenchSource.includes('handleIncomingFiles(input.files ?? [])'), 'click selection must use the shared incoming-file path')
  expect(workbenchSource.includes('handleIncomingFiles(event.dataTransfer?.files ?? [])'), 'drop must use the shared incoming-file path')
  expect(workbenchSource.includes('@dragover.prevent="onDragOver"') && workbenchSource.includes('@drop.prevent="onDrop"'), 'dragover/drop must prevent browser navigation')
  expect(workbenchSource.includes("if (creating.value) return"), 'incoming upload/drop path must lock during Create')
  expect(workbenchSource.includes(':aria-disabled="creating"'), 'drop zone must expose its Create lock')
  expect(validateAssistantImageSelection([]).error !== null, 'empty selection must fail')
  expect(validateAssistantImageSelection([file('a.png', 'image/png'), file('b.png', 'image/png')]).error?.includes('exactly one') === true, 'multiple files must fail')
  expect(validateAssistantImageSelection([file('a.gif', 'image/gif')]).error !== null, 'non PNG/JPEG must fail')
  expect(validateAssistantImageSelection([file('a.png', 'image/png', MAX_ASSISTANT_IMAGE_BYTES + 1)]).error?.includes('6 MiB') === true, 'encoded image over 6 MiB must fail')
  expect(validateAssistantImageSelection([file('a.jpg', 'image/jpeg')]).error === null, 'one JPEG must pass local selection validation')
}

function testContainedCoordinateMapping(): void {
  const wide = mapContainedImagePoint(500, 250, { left: 0, top: 0, width: 1000, height: 500 }, 2000, 1000)
  expect(wide?.x === 1000 && wide.y === 500, 'landscape coordinate mapping must preserve the original pixel scale')
  const tall = mapContainedImagePoint(250, 500, { left: 0, top: 0, width: 500, height: 1000 }, 1000, 2000)
  expect(tall?.x === 500 && tall.y === 1000, 'portrait coordinate mapping must preserve the original pixel scale')
  const content = mapContainedImagePoint(500, 500, { left: 0, top: 0, width: 1000, height: 1000 }, 2000, 1000)
  expect(content?.x === 1000 && content.y === 500 && content.contentTop === 250, 'letterboxed content coordinates must map correctly')
  expect(mapContainedImagePoint(500, 100, { left: 0, top: 0, width: 1000, height: 1000 }, 2000, 1000) === null, 'letterbox whitespace must never produce a color')
}

function testRobustMedianSampling(): void {
  const pixels = new Uint8ClampedArray(5 * 5 * 4)
  for (let i = 0; i < 25; i++) pixels.set([20, 100, 200, 255], i * 4)
  pixels.set([255, 0, 0, 255], 12 * 4)
  expect(sampleMedianHex(pixels, 5, 5, 2, 2, 5) === '#1464C8', 'one antialias/outlier pixel must not dominate a 5x5 median sample')
  const transparent = new Uint8ClampedArray([0, 0, 0, 0])
  expect(sampleMedianHex(transparent, 1, 1, 0, 0, 5) === null, 'fully transparent local pixels must be ignored')
}

function editableDraft(): EditableAssistantDraft {
  return {
    contract_version: 'palette-assistant.v1', revision: 3, name: 'Draft', type: 'categorical',
    colors: [{ id: '11111111-1111-4111-8111-111111111111', hex: '#112233', order: 0, source: 'assistant', state: 'accepted', classification: 'data' }],
    chart_applicability: [{ chart_type: 'bar_error', suitability: 'best_fit' }], disciplines: [], use_cases: [], avoid_cases: [], tags: [],
    accessibility: { colorblind_safe: false, print_friendly: false, dark_background: false }, source_type: 'figure_extracted', source_note: '', preview_cases: [], provenance: []
  }
}

function testPickedColorMutationAndInvalidation(): void {
  const state = createInitialState()
  state.draft = editableDraft(); state.latestDraftRevision = 3; state.confirmedRevision = 3
  Object.assign(state.submission, { status: 'validated', validatedRevision: 3, validation: { marker: true }, acknowledgments: ['warning'], idempotencyKey: 'intent', receipt: { marker: true } })
  const result = addPickedDraftColor(state, '#445566')
  const added = state.draft.colors[1]
  expect(result.added && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(added.id), 'picked colors must receive a UUIDv4')
  expect(added.source === 'admin' && added.state === 'modified' && added.classification === 'data' && added.order === 1, 'picked color identity/provenance/order must follow the frozen Draft contract')
  expect(state.draft.revision === 4 && state.confirmedRevision === null, 'picked color must increment revision and clear confirmation')
  expect(state.submission.status === 'idle' && state.submission.validation === null && state.submission.acknowledgments.length === 0 && state.submission.idempotencyKey === null && state.submission.receipt === null, 'picked color must invalidate validation, findings, acknowledgments, Create intent and receipt')
  const duplicate = addPickedDraftColor(state, '#445566')
  expect(!duplicate.added && duplicate.existingIndex === 1 && state.draft.colors.length === 2 && state.draft.revision === 4, 'duplicate HEX must focus existing state without a mutation')
}

function testFrozenVocabularyProjectionAndMutation(): void {
  for (const field of ['disciplines', 'use_cases', 'avoid_cases', 'tags'] as const) {
    expect(JSON.stringify(ASSISTANT_CONTROLLED_VOCABULARIES[field]) === JSON.stringify(controlledVocabularies[field]), `${field} must project the frozen JSON authority exactly`)
    expect(selectableVocabularyValues(field, [], '').every((value) => isAuthoritativeVocabularyValue(field, value)), `${field} control must only offer authoritative values`)
  }
  const state = createInitialState(); state.draft = editableDraft(); state.latestDraftRevision = 3; state.confirmedRevision = 3
  mutateDraft(state, (draft) => { draft.disciplines = ['general'] })
  expect(state.draft.disciplines[0] === 'general' && state.draft.revision === 4 && state.confirmedRevision === null, 'vocabulary selection must use the shared Draft mutation path')
  mutateDraft(state, (draft) => { draft.disciplines = [] })
  expect(state.draft.disciplines.length === 0 && state.draft.revision === 5, 'vocabulary removal must preserve legal empty arrays and increment revision')
  expect(workbenchSource.includes('<0.1%') && workbenchSource.includes('image coverage / 整图像素占比'), 'tiny fractions must not appear as confidence or misleading 0.0%')
}

testSharedUploadPathAndGuards()
testContainedCoordinateMapping()
testRobustMedianSampling()
testPickedColorMutationAndInvalidation()
testFrozenVocabularyProjectionAndMutation()
