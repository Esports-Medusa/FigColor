import type {
  AdminPreviewMutationResult,
  AdminPreviewCasePayload,
  AdminPreviewCaseUpdatePayload
} from '@/lib/api/adminPreviewCases'
import type { PalettePreviewCase } from '@/types/palette'
import {
  buildBarErrorPreviewPayload,
  buildBarErrorPreviewUpdatePayload,
  type EditableBarErrorDraft
} from './admin'

export interface BarErrorPreviewOperations {
  create: (
    paletteId: string,
    payload: AdminPreviewCasePayload
  ) => Promise<AdminPreviewMutationResult<PalettePreviewCase>>
  update: (
    previewCaseId: string,
    payload: AdminPreviewCaseUpdatePayload
  ) => Promise<AdminPreviewMutationResult<PalettePreviewCase>>
  publish: (
    previewCaseId: string
  ) => Promise<AdminPreviewMutationResult<PalettePreviewCase>>
  archive: (
    previewCaseId: string
  ) => Promise<AdminPreviewMutationResult<PalettePreviewCase>>
}

export type BarErrorEditorMode =
  | 'viewing_published'
  | 'editing_saved_draft'
  | 'editing_unsaved_revision'
  | 'replacing_published'
  | 'replacement_create_failed'
  | 'viewing_archived'
  | 'editing_new_draft'

export type ReplacePublishedBarErrorResult =
  | {
      ok: true
      stage: 'success'
      value: PalettePreviewCase
      archivedPreviewCase: PalettePreviewCase
    }
  | {
      ok: false
      stage: 'archive_failed'
      archiveResult: AdminPreviewMutationResult<PalettePreviewCase>
      preservedDraft: EditableBarErrorDraft
    }
  | {
      ok: false
      stage: 'create_failed_after_archive'
      archivedPreviewCase: PalettePreviewCase
      createResult: AdminPreviewMutationResult<PalettePreviewCase>
      preservedDraft: EditableBarErrorDraft
    }

export function isBarErrorPreviewCase(previewCase: PalettePreviewCase): boolean {
  return previewCase.chart_type === 'bar_error' &&
    previewCase.template_id === 'bar_error_v1'
}

export function findActiveBarErrorDraft(
  previewCases: readonly PalettePreviewCase[]
): PalettePreviewCase | null {
  return previewCases.find((previewCase) =>
    isBarErrorPreviewCase(previewCase) && previewCase.status === 'draft'
  ) ?? null
}

export function findEditableBarErrorDisplayCase(
  previewCases: readonly PalettePreviewCase[]
): PalettePreviewCase | null {
  return findActiveBarErrorDraft(previewCases) ??
    previewCases.find((previewCase) =>
      isBarErrorPreviewCase(previewCase) && previewCase.status === 'published'
    ) ??
    previewCases.find((previewCase) =>
      isBarErrorPreviewCase(previewCase) && previewCase.status === 'archived'
    ) ??
    null
}

export function canDirectlyEditBarErrorCase(
  previewCase: PalettePreviewCase | null,
  isUnsavedRevision: boolean
): boolean {
  if (isUnsavedRevision) return true
  return previewCase === null || previewCase.status === 'draft'
}

export function canPublishBarErrorDraft(
  previewCase: PalettePreviewCase | null,
  localIssueCount: number,
  requestInProgress: boolean
): boolean {
  return Boolean(
    previewCase?.status === 'draft' &&
    localIssueCount === 0 &&
    !requestInProgress
  )
}

export function canSetPrimaryBarErrorCase(
  previewCase: PalettePreviewCase | null,
  requestInProgress: boolean
): boolean {
  return Boolean(
    previewCase?.status === 'published' &&
    !previewCase.is_primary &&
    !requestInProgress
  )
}

export function modeForBarErrorPreviewCase(
  previewCase: PalettePreviewCase | null
): BarErrorEditorMode {
  if (!previewCase) return 'editing_new_draft'
  if (previewCase.status === 'draft') return 'editing_saved_draft'
  if (previewCase.status === 'published') return 'viewing_published'
  return 'viewing_archived'
}

export function shouldSyncBarErrorEditorFromServer(
  mode: BarErrorEditorMode,
  selectedPreviewCase: PalettePreviewCase | null
): boolean {
  if (mode === 'editing_unsaved_revision' || mode === 'replacement_create_failed') {
    return false
  }
  if (mode === 'replacing_published') {
    return selectedPreviewCase?.status === 'draft'
  }
  return true
}

export async function saveBarErrorDraftRevision(
  paletteId: string,
  previewCases: readonly PalettePreviewCase[],
  draft: EditableBarErrorDraft,
  operations: Pick<BarErrorPreviewOperations, 'create' | 'update'>
): Promise<AdminPreviewMutationResult<PalettePreviewCase>> {
  const existingDraft = findActiveBarErrorDraft(previewCases)
  return existingDraft
    ? operations.update(existingDraft.id, buildBarErrorPreviewUpdatePayload(draft))
    : operations.create(paletteId, buildBarErrorPreviewPayload(draft))
}

export async function publishBarErrorSavedDraft(
  previewCases: readonly PalettePreviewCase[],
  draft: EditableBarErrorDraft,
  operations: Pick<BarErrorPreviewOperations, 'update' | 'publish'>
): Promise<AdminPreviewMutationResult<PalettePreviewCase>> {
  const existingDraft = findActiveBarErrorDraft(previewCases)
  if (!existingDraft) {
    return {
      ok: false,
      status: 0,
      kind: 'unexpected',
      message: 'Save a draft before publishing.'
    }
  }

  const updateResult = await operations.update(
    existingDraft.id,
    buildBarErrorPreviewUpdatePayload(draft)
  )
  if (!updateResult.ok) {
    return updateResult
  }

  return operations.publish(updateResult.value.id)
}

export async function replacePublishedBarErrorWithDraft(
  paletteId: string,
  publishedPreviewCaseId: string,
  localDraft: EditableBarErrorDraft,
  operations: Pick<BarErrorPreviewOperations, 'archive' | 'create'>
): Promise<ReplacePublishedBarErrorResult> {
  const preservedDraft = cloneDraft(localDraft)
  const archiveResult = await operations.archive(publishedPreviewCaseId)
  if (!archiveResult.ok) {
    return {
      ok: false,
      stage: 'archive_failed',
      archiveResult,
      preservedDraft
    }
  }

  const createResult = await operations.create(
    paletteId,
    buildBarErrorPreviewPayload(preservedDraft)
  )
  if (!createResult.ok) {
    return {
      ok: false,
      stage: 'create_failed_after_archive',
      archivedPreviewCase: archiveResult.value,
      createResult,
      preservedDraft
    }
  }

  return {
    ok: true,
    stage: 'success',
    value: createResult.value,
    archivedPreviewCase: archiveResult.value
  }
}

function cloneDraft(draft: EditableBarErrorDraft): EditableBarErrorDraft {
  return {
    groups: draft.groups.map((group) => ({ ...group })),
    config: { ...draft.config }
  }
}
