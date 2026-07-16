import editorSource from '@/components/admin/previews/BarErrorPreviewEditor.vue?raw'
import adminPaletteFormSource from '@/views/admin/palettes/AdminPaletteForm.vue?raw'
import type { AdminPreviewMutationResult } from '@/lib/api/adminPreviewCases'
import type { PalettePreviewCase, ValidationIssue } from '@/types/palette'
import {
  canDirectlyEditBarErrorCase,
  canPublishBarErrorDraft,
  canSetPrimaryBarErrorCase,
  findActiveBarErrorDraft,
  findEditableBarErrorDisplayCase,
  publishBarErrorSavedDraft,
  replacePublishedBarErrorWithDraft,
  saveBarErrorDraftRevision,
  shouldSyncBarErrorEditorFromServer
} from './lifecycle'
import type { EditableBarErrorDraft } from './admin'

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

const draft: EditableBarErrorDraft = {
  groups: [
    { key: 'group_1', label: 'Edited A', color_id: 'blue-id' },
    { key: 'group_2', label: 'Edited B', color_id: 'orange-id' },
    { key: 'group_3', label: 'Edited C', color_id: 'green-id' }
  ],
  config: {
    orientation: 'vertical',
    sample_size: 12,
    error_type: 'sem',
    data_pattern: 'mixed'
  }
}

function previewCase(
  status: PalettePreviewCase['status'],
  overrides: Partial<PalettePreviewCase> = {}
): PalettePreviewCase {
  return {
    id: `${status}-preview`,
    palette_id: 'palette-1',
    chart_type: 'bar_error',
    template_id: 'bar_error_v1',
    template_version: 1,
    schema_version: 1,
    color_roles: { groups: [], elements: {} },
    preview_config: {},
    seed_strategy: 'stable_id',
    seed_value: null,
    is_primary: false,
    status,
    ...overrides
  }
}

function ok(value: PalettePreviewCase): AdminPreviewMutationResult<PalettePreviewCase> {
  return { ok: true, value }
}

function conflict(): AdminPreviewMutationResult<PalettePreviewCase> {
  return {
    ok: false,
    status: 409,
    kind: 'conflict',
    message: 'preview case conflict'
  }
}

function validation(issues: ValidationIssue[]): AdminPreviewMutationResult<PalettePreviewCase> {
  return {
    ok: false,
    status: 422,
    kind: 'validation',
    message: 'validation failed',
    issues
  }
}

async function testPublishedIsNotRepublishedWhenDraftMissing(): Promise<void> {
  const calls: string[] = []
  const result = await publishBarErrorSavedDraft([previewCase('published')], draft, {
    update: async () => {
      calls.push('update')
      return ok(previewCase('draft'))
    },
    publish: async () => {
      calls.push('publish')
      return ok(previewCase('published'))
    }
  })

  expect(!result.ok && result.message === 'Save a draft before publishing.', 'publish should require a saved draft')
  expect(calls.length === 0, 'publish should not republish an existing published case when no draft exists')
}

async function testLocalEditsPreservedWhenNoDraftExists(): Promise<void> {
  const before = JSON.stringify(draft)
  const result = await publishBarErrorSavedDraft([], draft, {
    update: async () => ok(previewCase('draft')),
    publish: async () => ok(previewCase('published'))
  })

  expect(!result.ok, 'missing saved draft should fail')
  expect(JSON.stringify(draft) === before, 'missing draft failure should not mutate local edits')
}

async function testSaveCreatesDraftRevisionThroughExplicitWorkflow(): Promise<void> {
  const calls: string[] = []
  const created = previewCase('draft', { id: 'new-draft' })
  const result = await saveBarErrorDraftRevision('palette-1', [], draft, {
    create: async (_paletteId, payload) => {
      calls.push(`create:${(payload.preview_config as { sample_size: number }).sample_size}`)
      return ok(created)
    },
    update: async () => {
      calls.push('update')
      return ok(previewCase('draft'))
    }
  })

  expect(result.ok && result.value.id === 'new-draft', 'save should use server-created draft')
  expect(calls.join(',') === 'create:12', 'save without draft should create with current local edits')
}

async function testReplacementDoesNotCreateBeforeArchiveSucceeds(): Promise<void> {
  const calls: string[] = []
  const result = await replacePublishedBarErrorWithDraft('palette-1', 'published-1', draft, {
    archive: async () => {
      calls.push('archive')
      return conflict()
    },
    create: async () => {
      calls.push('create')
      return ok(previewCase('draft'))
    }
  })

  expect(!result.ok && result.stage === 'archive_failed', 'archive failure should return staged archive_failed result')
  expect(calls.join(',') === 'archive', 'replacement should not create before archive succeeds')
  expect(!result.ok && JSON.stringify(result.preservedDraft) === JSON.stringify(draft), 'archive failure should preserve local revision')
}

async function testReplacementArchiveThenCreateSuccess(): Promise<void> {
  const calls: string[] = []
  const archived = previewCase('archived', { id: 'published-1' })
  const serverDraft = previewCase('draft', { id: 'server-draft' })
  const result = await replacePublishedBarErrorWithDraft('palette-1', 'published-1', draft, {
    archive: async (previewCaseId) => {
      calls.push(`archive:${previewCaseId}`)
      return ok(archived)
    },
    create: async (_paletteId, payload) => {
      calls.push(`create:${(payload.preview_config as { sample_size: number }).sample_size}`)
      return ok(serverDraft)
    }
  })

  expect(result.ok && result.value.id === 'server-draft', 'successful replacement should return server-created draft')
  expect(result.ok && result.archivedPreviewCase.status === 'archived', 'successful replacement should include archived source')
  expect(calls.join(',') === 'archive:published-1,create:12', 'replacement should archive then create with preserved local revision')
}

async function testReplacementCreate409PreservesStagedState(): Promise<void> {
  const archived = previewCase('archived', { id: 'published-1' })
  const result = await replacePublishedBarErrorWithDraft('palette-1', 'published-1', draft, {
    archive: async () => ok(archived),
    create: async () => conflict()
  })

  expect(!result.ok && result.stage === 'create_failed_after_archive', 'create conflict after archive should be staged')
  if (!result.ok && result.stage === 'create_failed_after_archive') {
    expect(result.archivedPreviewCase.status === 'archived', 'create conflict should expose archived source')
    expect(!result.createResult.ok && result.createResult.kind === 'conflict', 'create conflict should preserve backend kind')
  }
  expect(!result.ok && JSON.stringify(result.preservedDraft) === JSON.stringify(draft), 'create conflict should preserve local revision')
}

async function testReplacementCreate422PreservesIssuesAndRevision(): Promise<void> {
  const issues = [{ path: 'preview_case.color_roles', code: 'INVALID_COLOR_ROLES', message: 'Invalid roles.' }]
  const result = await replacePublishedBarErrorWithDraft('palette-1', 'published-1', draft, {
    archive: async () => ok(previewCase('archived')),
    create: async () => validation(issues)
  })

  expect(!result.ok && result.stage === 'create_failed_after_archive', 'create validation after archive should be staged')
  if (!result.ok && result.stage === 'create_failed_after_archive') {
    expect(!result.createResult.ok && result.createResult.kind === 'validation', 'create validation should preserve backend kind')
    expect(!result.createResult.ok && result.createResult.issues?.[0].path === 'preview_case.color_roles', 'create validation should preserve backend issues')
  }
  expect(!result.ok && JSON.stringify(result.preservedDraft) === JSON.stringify(draft), 'create validation should preserve local revision')
}

async function testSaveUpdatesSavedDraft(): Promise<void> {
  const calls: string[] = []
  const existingDraft = previewCase('draft', { id: 'draft-1' })
  const result = await saveBarErrorDraftRevision('palette-1', [existingDraft], draft, {
    create: async () => {
      calls.push('create')
      return ok(previewCase('draft'))
    },
    update: async (previewCaseId, payload) => {
      calls.push(`update:${previewCaseId}:${(payload.preview_config as { sample_size: number }).sample_size}`)
      return ok(existingDraft)
    }
  })

  expect(result.ok, 'draft update should succeed')
  expect(calls.join(',') === 'update:draft-1:12', 'save should update the saved draft ID with latest local edits')
}

async function testPublishUpdatesLatestDraftBeforePublishing(): Promise<void> {
  const calls: string[] = []
  const existingDraft = previewCase('draft', { id: 'draft-1' })
  const updatedDraft = previewCase('draft', { id: 'server-returned-draft' })
  const published = previewCase('published', { id: 'server-returned-draft' })

  const result = await publishBarErrorSavedDraft([existingDraft], draft, {
    update: async (previewCaseId, payload) => {
      calls.push(`update:${previewCaseId}:${(payload.preview_config as { sample_size: number }).sample_size}`)
      return ok(updatedDraft)
    },
    publish: async (previewCaseId) => {
      calls.push(`publish:${previewCaseId}`)
      return ok(published)
    }
  })

  expect(result.ok && result.value.status === 'published', 'publish should return server publish response')
  expect(calls.join(',') === 'update:draft-1:12,publish:server-returned-draft', 'publish should update then publish the server-returned draft ID')
}

function testButtonAndEditRules(): void {
  expect(!canPublishBarErrorDraft(null, 0, false), 'publish should be disabled without a saved draft ID')
  expect(canPublishBarErrorDraft(previewCase('draft'), 0, false), 'publish should be enabled for a valid saved draft')
  expect(!canDirectlyEditBarErrorCase(previewCase('published'), false), 'published case should not be directly editable')
  expect(!canDirectlyEditBarErrorCase(previewCase('archived'), false), 'archived case should not be directly editable')
  expect(canDirectlyEditBarErrorCase(previewCase('published'), true), 'unsaved revision copy should be editable')
  expect(canSetPrimaryBarErrorCase(previewCase('published'), false), 'set-primary should allow published status')
  expect(!canSetPrimaryBarErrorCase(previewCase('draft'), false), 'set-primary should require published status')
}

async function testConflictsAndValidationPreserveLocalState(): Promise<void> {
  const beforeConflict = JSON.stringify(draft)
  const conflictResult = await saveBarErrorDraftRevision('palette-1', [previewCase('published')], draft, {
    create: async () => conflict(),
    update: async () => ok(previewCase('draft'))
  })
  expect(!conflictResult.ok && conflictResult.kind === 'conflict', '409 should be returned from save')
  expect(JSON.stringify(draft) === beforeConflict, '409 should preserve local edits')

  const issues = [{ path: 'preview_case.color_roles', code: 'INVALID_COLOR_ROLES', message: 'Invalid roles.' }]
  const beforeValidation = JSON.stringify(draft)
  const validationResult = await saveBarErrorDraftRevision('palette-1', [], draft, {
    create: async () => validation(issues),
    update: async () => ok(previewCase('draft'))
  })
  expect(!validationResult.ok && validationResult.kind === 'validation', '422 should be returned from save')
  expect(!validationResult.ok && validationResult.issues?.[0].path === 'preview_case.color_roles', '422 issues should be preserved')
  expect(JSON.stringify(draft) === beforeValidation, '422 should preserve local edits')
}

function testServerResponsesDriveLifecycleStatus(): void {
  const displayed = findEditableBarErrorDisplayCase([previewCase('published'), previewCase('archived')])
  expect(displayed?.status === 'published', 'display state should come from server preview cases')
  expect(findActiveBarErrorDraft([previewCase('published')]) === null, 'published server case should not masquerade as draft')
  expect(!shouldSyncBarErrorEditorFromServer('replacing_published', previewCase('archived')), 'archived refetch during replacement should not overwrite retained revision')
  expect(shouldSyncBarErrorEditorFromServer('replacing_published', previewCase('draft')), 'server-created draft should bind editor after replacement success')
  expect(!shouldSyncBarErrorEditorFromServer('replacement_create_failed', previewCase('archived')), 'create-failed state should preserve retained revision')
}

function testEditorSourceHasExplicitRevisionFlow(): void {
  expect(editorSource.includes('Create Draft Revision'), 'editor should expose explicit revision action')
  expect(editorSource.includes('Archive Published & Create Draft'), 'editor should expose explicit replacement action')
  expect(editorSource.includes("mode === 'replacing_published'"), 'editor should track replacing_published mode')
  expect(editorSource.includes('replacement_create_failed'), 'editor should track replacement_create_failed mode')
  expect(editorSource.includes('shouldSyncBarErrorEditorFromServer'), 'editor watcher should use explicit sync suppression')
  expect(editorSource.includes('Discard the retained local revision'), 'failed replacement cancel should require confirmation')
  expect(editorSource.includes('!savedDraftPreviewCase?.id'), 'publish button should require a saved draft ID')
  expect(editorSource.includes('isReadOnly'), 'editor should distinguish read-only server states')
  expect(editorSource.includes("status === 'published'"), 'revision should start only from published status')
  expect(adminPaletteFormSource.includes('<ConfirmDialog'), 'replacement should use existing confirmation component')
  expect(adminPaletteFormSource.includes('public chart preview may temporarily fall back'), 'primary replacement confirmation should warn about public fallback')
  expect(adminPaletteFormSource.includes('replacePublishedBarErrorWithDraft'), 'parent should use dedicated replacement helper')
}

await testPublishedIsNotRepublishedWhenDraftMissing()
await testLocalEditsPreservedWhenNoDraftExists()
await testSaveCreatesDraftRevisionThroughExplicitWorkflow()
await testReplacementDoesNotCreateBeforeArchiveSucceeds()
await testReplacementArchiveThenCreateSuccess()
await testReplacementCreate409PreservesStagedState()
await testReplacementCreate422PreservesIssuesAndRevision()
await testSaveUpdatesSavedDraft()
await testPublishUpdatesLatestDraftBeforePublishing()
testButtonAndEditRules()
await testConflictsAndValidationPreserveLocalState()
testServerResponsesDriveLifecycleStatus()
testEditorSourceHasExplicitRevisionFlow()
