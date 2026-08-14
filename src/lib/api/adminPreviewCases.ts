import { getAuthHeaders } from '@/api/auth'
import { API_BASE } from '@/api/baseUrl'
import type {
  ChartType,
  PalettePreviewCase,
  PreviewCaseSeedStrategy,
  ValidationIssue
} from '@/types/palette'

export interface AdminPreviewCaseListResponse {
  items: PalettePreviewCase[]
  total: number
}

export interface AdminPreviewCasePayload {
  chart_type: ChartType
  template_id: string
  template_version: number
  schema_version: number
  color_roles: unknown
  preview_config: unknown
  seed_strategy: PreviewCaseSeedStrategy
  seed_value?: number | null
}

export type AdminPreviewCaseUpdatePayload = Partial<AdminPreviewCasePayload>

export type AdminPreviewMutationResult<T> =
  | { ok: true; value: T }
  | {
      ok: false
      status: number
      kind: AdminPreviewErrorKind
      message: string
      issues?: ValidationIssue[]
    }

export type AdminPreviewErrorKind =
  | 'validation'
  | 'conflict'
  | 'not_found'
  | 'network'
  | 'unexpected'

export async function listAdminPreviewCases(
  paletteId: string,
  options: { includeArchived?: boolean } = {}
): Promise<AdminPreviewMutationResult<AdminPreviewCaseListResponse>> {
  const query = new URLSearchParams()
  if (options.includeArchived) query.set('include_archived', 'true')

  return requestAdminPreviewCase<AdminPreviewCaseListResponse>(
    `/admin/palettes/${encodeURIComponent(paletteId)}/preview-cases${query.size ? `?${query}` : ''}`
  )
}

export async function getAdminPreviewCase(
  previewCaseId: string
): Promise<AdminPreviewMutationResult<PalettePreviewCase>> {
  return requestAdminPreviewCase<PalettePreviewCase>(
    `/admin/preview-cases/${encodeURIComponent(previewCaseId)}`
  )
}

export async function createAdminPreviewCase(
  paletteId: string,
  payload: AdminPreviewCasePayload
): Promise<AdminPreviewMutationResult<PalettePreviewCase>> {
  return requestAdminPreviewCase<PalettePreviewCase>(
    `/admin/palettes/${encodeURIComponent(paletteId)}/preview-cases`,
    { method: 'POST', body: JSON.stringify(payload) }
  )
}

export async function updateAdminPreviewCase(
  previewCaseId: string,
  payload: AdminPreviewCaseUpdatePayload
): Promise<AdminPreviewMutationResult<PalettePreviewCase>> {
  return requestAdminPreviewCase<PalettePreviewCase>(
    `/admin/preview-cases/${encodeURIComponent(previewCaseId)}`,
    { method: 'PATCH', body: JSON.stringify(payload) }
  )
}

export async function deleteAdminPreviewCase(
  previewCaseId: string
): Promise<AdminPreviewMutationResult<null>> {
  return requestAdminPreviewCase<null>(
    `/admin/preview-cases/${encodeURIComponent(previewCaseId)}`,
    { method: 'DELETE' }
  )
}

export async function publishAdminPreviewCase(
  previewCaseId: string
): Promise<AdminPreviewMutationResult<PalettePreviewCase>> {
  return lifecycleAction(previewCaseId, 'publish')
}

export async function archiveAdminPreviewCase(
  previewCaseId: string
): Promise<AdminPreviewMutationResult<PalettePreviewCase>> {
  return lifecycleAction(previewCaseId, 'archive')
}

export async function setPrimaryAdminPreviewCase(
  previewCaseId: string
): Promise<AdminPreviewMutationResult<PalettePreviewCase>> {
  return lifecycleAction(previewCaseId, 'set-primary')
}

async function lifecycleAction(
  previewCaseId: string,
  action: 'publish' | 'archive' | 'set-primary'
): Promise<AdminPreviewMutationResult<PalettePreviewCase>> {
  return requestAdminPreviewCase<PalettePreviewCase>(
    `/admin/preview-cases/${encodeURIComponent(previewCaseId)}/${action}`,
    { method: 'POST' }
  )
}

async function requestAdminPreviewCase<T>(
  path: string,
  init: RequestInit = {}
): Promise<AdminPreviewMutationResult<T>> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        ...getAuthHeaders(),
        ...(init.headers || {})
      }
    })

    if (response.ok) {
      return {
        ok: true,
        value: response.status === 204 ? null as T : await response.json()
      }
    }

    const errorBody = await readErrorBody(response)
    return {
      ok: false,
      status: response.status,
      kind: statusToKind(response.status),
      message: errorBody.message,
      issues: errorBody.issues
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      kind: 'network',
      message: error instanceof Error ? error.message : 'Network request failed.'
    }
  }
}

async function readErrorBody(response: Response): Promise<{ message: string; issues?: ValidationIssue[] }> {
  try {
    const body = await response.json()
    return {
      message: typeof body.error === 'string' ? body.error : response.statusText || 'Request failed.',
      issues: Array.isArray(body.issues) ? body.issues : undefined
    }
  } catch {
    return { message: response.statusText || 'Request failed.' }
  }
}

function statusToKind(status: number): AdminPreviewErrorKind {
  if (status === 422) return 'validation'
  if (status === 409) return 'conflict'
  if (status === 404) return 'not_found'
  return 'unexpected'
}
