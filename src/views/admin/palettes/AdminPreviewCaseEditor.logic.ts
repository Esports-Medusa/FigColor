import type { PalettePreviewCase, ThemeColorReference, VisualColorReference } from '@/types/palette'

export interface LifecycleActionAvailability {
  saveDraft: boolean
  publish: boolean
  setPrimary: boolean
  archive: boolean
  deleteDraft: boolean
  readOnly: boolean
}

export function resolveLifecycleActionAvailability(
  previewCase: Pick<PalettePreviewCase, 'status' | 'is_primary'> | null,
  hasIssues: boolean,
  requestInProgress = false
): LifecycleActionAvailability {
  const status = previewCase?.status
  const readOnly = requestInProgress || status === 'archived'
  const draft = status === 'draft'
  const published = status === 'published'
  return {
    saveDraft: !requestInProgress && !hasIssues && (!previewCase || draft),
    publish: !requestInProgress && !hasIssues && draft,
    setPrimary: !requestInProgress && published && previewCase !== null && !previewCase.is_primary,
    archive: !requestInProgress && !!previewCase && status !== 'archived',
    deleteDraft: !requestInProgress && draft,
    readOnly
  }
}

export function addArrayItem<T>(items: T[], item: T): T[] {
  return [...items, item]
}

export function removeArrayItemAt<T>(items: T[], index: number, minItems = 0): T[] {
  if (items.length <= minItems || index < 0 || index >= items.length) {
    return items
  }
  return items.filter((_, candidateIndex) => candidateIndex !== index)
}

export function moveArrayItemBy<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const next = index + direction
  if (index < 0 || index >= items.length || next < 0 || next >= items.length) {
    return items
  }
  const reordered = [...items]
  const [item] = reordered.splice(index, 1)
  reordered.splice(next, 0, item)
  return reordered
}

export function parseEditorObjectJson(text: string, previous: Record<string, unknown>): {
  value: Record<string, unknown>
  error: string
} {
  try {
    const parsed = JSON.parse(text)
    if (!isRecord(parsed)) {
      return { value: previous, error: 'JSON value must be an object.' }
    }
    return { value: parsed, error: '' }
  } catch (error) {
    return { value: previous, error: error instanceof Error ? error.message : 'Invalid JSON.' }
  }
}

export function visualReferenceFromEditorValue(value: string): VisualColorReference | undefined {
  if (!value) return undefined
  const [source, reference] = value.split(':', 2)
  if (source === 'palette' && reference.trim() !== '') {
    return { source: 'palette', color_id: reference }
  }
  if (source === 'theme' && isThemeToken(reference)) {
    return { source: 'theme', token: reference }
  }
  return undefined
}

export function editorValueFromVisualReference(value: unknown): string {
  if (!isRecord(value)) return ''
  if (value.source === 'palette' && typeof value.color_id === 'string') {
    return `palette:${value.color_id}`
  }
  if (value.source === 'theme' && typeof value.token === 'string') {
    return `theme:${value.token}`
  }
  return ''
}

export function upsertOptionalVisualReference<T extends Record<string, unknown>>(
  item: T,
  key: string,
  value: string
): T {
  const next: Record<string, unknown> = { ...item }
  const reference = visualReferenceFromEditorValue(value)
  if (reference) {
    next[key] = reference
  } else {
    delete next[key]
  }
  return next as T
}

function isThemeToken(value: string): value is ThemeColorReference['token'] {
  return ['foreground', 'muted_foreground', 'grid', 'background'].includes(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
