import { validatePreviewCaseAgainstRegistry } from '@/lib/chart-types/registry'
import { renderPalettePreview } from '@/lib/renderers/renderPreview'
import type {
  AdminPreviewCasePayload,
  AdminPreviewCaseUpdatePayload
} from '@/lib/api/adminPreviewCases'
import type { CanonicalPalette, PalettePreviewCase, ValidationIssue } from '@/types/palette'
import type {
  BarErrorColorRoles,
  BarErrorDraftSuggestion,
  BarErrorPreviewConfig
} from './suggestion'

export const BAR_ERROR_MIN_GROUPS = 3
export const BAR_ERROR_MAX_GROUPS = 5

export interface EditableBarErrorGroup {
  key: string
  label: string
  color_id: string
}

export interface EditableBarErrorDraft {
  groups: EditableBarErrorGroup[]
  config: BarErrorPreviewConfig
}

export function editableDraftFromSuggestion(
  suggestion: BarErrorDraftSuggestion
): EditableBarErrorDraft {
  return {
    groups: suggestion.color_roles.groups.map((group) => ({
      key: group.key,
      label: group.label,
      color_id: group.fill.color_id
    })),
    config: cloneConfig(suggestion.preview_config)
  }
}

export function editableDraftFromPreviewCase(
  previewCase: PalettePreviewCase
): EditableBarErrorDraft {
  const roles = previewCase.color_roles as Partial<BarErrorColorRoles>
  const config = previewCase.preview_config as Partial<BarErrorPreviewConfig>

  return {
    groups: Array.isArray(roles.groups)
      ? roles.groups.map((group, index) => ({
          key: typeof group.key === 'string' && group.key ? group.key : `group_${index + 1}`,
          label: typeof group.label === 'string' ? group.label : `Group ${index + 1}`,
          color_id: typeof group.fill?.color_id === 'string' ? group.fill.color_id : ''
        }))
      : [],
    config: {
      orientation: config.orientation === 'horizontal' ? 'horizontal' : 'vertical',
      sample_size: Number.isInteger(config.sample_size) && Number(config.sample_size) > 0
        ? Number(config.sample_size)
        : 24,
      error_type: config.error_type === 'sd' || config.error_type === 'ci' ? config.error_type : 'sem',
      data_pattern: isBarErrorDataPattern(config.data_pattern) ? config.data_pattern : 'mixed'
    }
  }
}

export function cloneEditableBarErrorDraft(draft: EditableBarErrorDraft): EditableBarErrorDraft {
  return {
    groups: draft.groups.map((group) => ({ ...group })),
    config: cloneConfig(draft.config)
  }
}

export function buildBarErrorPreviewPayload(
  draft: EditableBarErrorDraft
): AdminPreviewCasePayload {
  return {
    chart_type: 'bar_error',
    template_id: 'bar_error_v1',
    template_version: 1,
    schema_version: 1,
    color_roles: buildBarErrorColorRoles(draft),
    preview_config: cloneConfig(draft.config),
    seed_strategy: 'stable_id',
    seed_value: null
  }
}

export function buildBarErrorPreviewUpdatePayload(
  draft: EditableBarErrorDraft
): AdminPreviewCaseUpdatePayload {
  return buildBarErrorPreviewPayload(draft)
}

export function buildLocalBarErrorPreviewCase(
  paletteId: string,
  draft: EditableBarErrorDraft,
  options: {
    id?: string
    status?: PalettePreviewCase['status']
    isPrimary?: boolean
  } = {}
): PalettePreviewCase {
  const payload = buildBarErrorPreviewPayload(draft)
  return {
    id: options.id ?? `${paletteId}:bar_error_v1:draft`,
    palette_id: paletteId,
    is_primary: options.isPrimary ?? false,
    status: options.status ?? 'draft',
    chart_type: payload.chart_type,
    template_id: payload.template_id,
    template_version: payload.template_version,
    schema_version: payload.schema_version,
    color_roles: payload.color_roles,
    preview_config: payload.preview_config,
    seed_strategy: payload.seed_strategy,
    seed_value: payload.seed_value ?? null
  }
}

export function validateEditableBarErrorDraft(
  palette: CanonicalPalette,
  draft: EditableBarErrorDraft,
  options: { previewCaseId?: string } = {}
): ValidationIssue[] {
  const previewCase = buildLocalBarErrorPreviewCase(palette.id, draft, {
    id: options.previewCaseId
  })

  const issues: ValidationIssue[] = []
  issues.push(...validateBarErrorEditorRules(palette, draft))

  const registryValidation = validatePreviewCaseAgainstRegistry(previewCase)
  if (!registryValidation.valid) {
    issues.push(...registryValidation.issues)
  }

  const rendered = renderPalettePreview(palette, previewCase)
  if (!rendered.ok && rendered.kind === 'invalid') {
    issues.push(...(rendered.issues ?? [{
      path: 'preview_case',
      code: rendered.code,
      message: rendered.message
    }]))
  }

  return dedupeIssues(issues)
}

export function buildBarErrorColorRoles(draft: EditableBarErrorDraft): BarErrorColorRoles {
  return {
    groups: draft.groups.map((group) => ({
      key: group.key,
      label: group.label,
      fill: { source: 'palette', color_id: group.color_id }
    })),
    elements: {
      axis: { source: 'theme', token: 'foreground' },
      grid: { source: 'theme', token: 'grid' },
      text: { source: 'theme', token: 'muted_foreground' },
      error_bar: { source: 'theme', token: 'foreground' },
      background: { source: 'theme', token: 'background' }
    }
  }
}

function validateBarErrorEditorRules(
  palette: CanonicalPalette,
  draft: EditableBarErrorDraft
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const paletteColorIds = new Set(palette.colors.map((color) => color.id))

  if (draft.groups.length < BAR_ERROR_MIN_GROUPS || draft.groups.length > BAR_ERROR_MAX_GROUPS) {
    issues.push({
      path: 'color_roles.groups',
      code: 'INVALID_BAR_ERROR_GROUP_COUNT',
      message: `bar_error_v1 requires ${BAR_ERROR_MIN_GROUPS} to ${BAR_ERROR_MAX_GROUPS} groups.`
    })
  }

  const seenKeys = new Set<string>()
  draft.groups.forEach((group, index) => {
    if (!group.key.trim()) {
      issues.push({
        path: `color_roles.groups[${index}].key`,
        code: 'INVALID_COLOR_ROLES',
        message: `color_roles.groups[${index}].key must be a non-empty string.`
      })
    } else if (seenKeys.has(group.key)) {
      issues.push({
        path: `color_roles.groups[${index}].key`,
        code: 'DUPLICATE_ROLE_KEY',
        message: `Duplicate group key: ${group.key}.`
      })
    }
    seenKeys.add(group.key)

    if (!group.label.trim()) {
      issues.push({
        path: `color_roles.groups[${index}].label`,
        code: 'INVALID_COLOR_ROLES',
        message: `color_roles.groups[${index}].label must be a non-empty string.`
      })
    }

    if (!paletteColorIds.has(group.color_id)) {
      issues.push({
        path: `color_roles.groups[${index}].fill.color_id`,
        code: 'COLOR_NOT_FOUND',
        message: `Referenced palette color does not exist: ${group.color_id}.`
      })
    }
  })

  return issues
}

function cloneConfig(config: BarErrorPreviewConfig): BarErrorPreviewConfig {
  return { ...config }
}

function isBarErrorDataPattern(value: unknown): value is BarErrorPreviewConfig['data_pattern'] {
  return value === 'treatment_higher' ||
    value === 'treatment_lower' ||
    value === 'dose_response' ||
    value === 'mixed'
}

function dedupeIssues(issues: ValidationIssue[]): ValidationIssue[] {
  const seen = new Set<string>()
  return issues.filter((issue) => {
    const key = `${issue.path}\u001f${issue.code}\u001f${issue.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
