import type { DraftPreviewCase } from '@/api/paletteAssistant'
import { getChartTemplateDefinition, validatePreviewCaseAgainstRegistry } from '@/lib/chart-types/registry'
import type { ValidationIssue } from '@/types/palette'
import type { EditableAssistantDraft, EditableDraftColor } from './workbench'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface DraftColorReference {
  colorId: string
  path: string
}

export function resolveDraftColor(
  colors: readonly EditableDraftColor[],
  colorId: string
): EditableDraftColor | undefined {
  return colors.find((color) => color.id === colorId)
}

export function validateDraftPreviewCases(
  draft: Pick<EditableAssistantDraft, 'colors' | 'preview_cases'>
): ValidationIssue[] {
  if (draft.preview_cases.length === 0) return []
  if (draft.preview_cases.length > 1) {
    return [{
      path: 'preview_cases',
      code: 'TOO_MANY_PREVIEW_CASES',
      message: 'A Palette Assistant Draft may contain at most one Preview Case.'
    }]
  }

  return validateDraftPreviewCase(draft.preview_cases[0], draft.colors, 'preview_cases[0]')
}

export function validateDraftPreviewCase(
  previewCase: DraftPreviewCase,
  colors: readonly EditableDraftColor[],
  path = 'preview_cases[0]'
): ValidationIssue[] {
  const registryValidation = validatePreviewCaseAgainstRegistry(previewCase)
  const issues = registryValidation.issues.map((item) => ({ ...item, path: `${path}.${item.path}` }))
  issues.push(...validateSeed(previewCase, path))

  const template = getChartTemplateDefinition(previewCase.chart_type, previewCase.template_id)
  const rolesAreSafeToInterpret = template?.validateRoles(previewCase.color_roles).valid === true
  if (rolesAreSafeToInterpret) {
    for (const reference of collectValidatedPaletteReferences(previewCase.color_roles, `${path}.color_roles`)) {
      if (!UUID_PATTERN.test(reference.colorId)) {
        issues.push({
          path: reference.path,
          code: 'INVALID_DRAFT_COLOR_ID',
          message: `Draft color reference must be a UUID: ${reference.colorId}.`
        })
      } else if (!resolveDraftColor(colors, reference.colorId)) {
        issues.push({
          path: reference.path,
          code: 'DRAFT_COLOR_NOT_FOUND',
          message: `Referenced Draft color does not exist: ${reference.colorId}.`
        })
      }
    }
  }

  return issues
}

function validateSeed(previewCase: DraftPreviewCase, path: string): ValidationIssue[] {
  if (previewCase.seed_strategy !== 'stable_id' && previewCase.seed_strategy !== 'fixed') {
    return [{ path: `${path}.seed_strategy`, code: 'INVALID_SEED_STRATEGY', message: 'Preview seed_strategy must be stable_id or fixed.' }]
  }
  if (previewCase.seed_strategy === 'stable_id') {
    return previewCase.seed_value === undefined
      ? []
      : [{ path: `${path}.seed_value`, code: 'INVALID_SEED_VALUE', message: 'Stable ID Preview seed_strategy requires seed_value to be omitted.' }]
  }
  if (!Number.isInteger(previewCase.seed_value)) {
    return [{ path: `${path}.seed_value`, code: 'INVALID_SEED_VALUE', message: 'Fixed Preview seed_strategy requires an integer seed_value.' }]
  }
  if (previewCase.seed_value! < -2147483648 || previewCase.seed_value! > 2147483647) {
    return [{ path: `${path}.seed_value`, code: 'INVALID_SEED_VALUE', message: 'Fixed Preview seed_value must be a signed 32-bit integer.' }]
  }
  return []
}

function collectValidatedPaletteReferences(value: unknown, path: string): DraftColorReference[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectValidatedPaletteReferences(item, `${path}[${index}]`))
  }
  if (!isRecord(value)) return []
  if (value.source === 'palette' && typeof value.color_id === 'string') {
    return [{ colorId: value.color_id, path: `${path}.color_id` }]
  }
  return Object.entries(value).flatMap(([key, item]) => collectValidatedPaletteReferences(item, `${path}.${key}`))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
