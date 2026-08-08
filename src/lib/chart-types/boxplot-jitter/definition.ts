import type { ChartTemplateDefinition, ValidationResult } from '../types'
import {
  combineIssues,
  isRecord,
  requireArrayProperty,
  requireEnumProperty,
  requirePrimitiveProperty,
  rejectUnknownProperties,
  validateObject
} from '../validation'

const rolesPath = 'color_roles'
const configPath = 'preview_config'
const optionalElementRoleKeys = [
  'jitter_point',
  'median_line',
  'whisker',
  'outline',
  'axis',
  'grid',
  'text',
  'box_stroke',
  'median',
  'jitter',
  'outlier',
  'background'
] as const

export const boxplotJitterTemplate: ChartTemplateDefinition = {
  id: 'boxplot_jitter_v1',
  chartType: 'boxplot_jitter',
  templateVersion: 1,
  schemaVersion: 1,
  validateRoles(value: unknown): ValidationResult {
    const objectResult = validateObject(value, rolesPath, 'INVALID_COLOR_ROLES')
    if (!objectResult.valid) {
      return objectResult
    }

    const roles = value as Record<string, unknown>
    return combineIssues([
      ...rejectUnknownProperties(roles, ['groups', 'elements'], rolesPath, 'INVALID_COLOR_ROLES'),
      ...requireArrayProperty(roles, 'groups', rolesPath, 'INVALID_COLOR_ROLES'),
      ...validateNamedRoles(roles.groups, `${rolesPath}.groups`),
      ...validateOptionalElements(roles.elements, `${rolesPath}.elements`)
    ])
  },
  validateConfig(value: unknown): ValidationResult {
    const objectResult = validateObject(value, configPath, 'INVALID_PREVIEW_CONFIG')
    if (!objectResult.valid) {
      return objectResult
    }

    const config = value as Record<string, unknown>
    return combineIssues([
      ...requireEnumProperty(config, 'jitter_density', ['low', 'medium', 'high'], configPath, 'INVALID_PREVIEW_CONFIG'),
      ...requirePrimitiveProperty(config, 'show_outliers', 'boolean', configPath, 'INVALID_PREVIEW_CONFIG'),
      ...validateOptionalString(config, 'y_axis_label', configPath)
    ])
  }
}

function validateNamedRoles(value: unknown, path: string) {
  if (!Array.isArray(value)) {
    return []
  }
  if (value.length < 1 || value.length > 5) {
    return [{ path, code: 'INVALID_COLOR_ROLES', message: `${path} must contain 1 to 5 groups.` }]
  }

  const seenKeys = new Set<string>()
  return value.flatMap((item, index) => {
    const itemPath = `${path}[${index}]`
    if (!isRecord(item)) {
      return [{ path: itemPath, code: 'INVALID_COLOR_ROLES', message: `${itemPath} must be an object.` }]
    }
    const duplicateKeyIssue = typeof item.key === 'string' && seenKeys.has(item.key)
      ? [{ path: `${itemPath}.key`, code: 'INVALID_COLOR_ROLES', message: `Duplicate group key: ${item.key}.` }]
      : []
    if (typeof item.key === 'string') {
      seenKeys.add(item.key)
    }
    return [
      ...duplicateKeyIssue,
      ...requireText(item, 'key', itemPath),
      ...requireText(item, 'label', itemPath),
      ...validatePaletteColorReference(item.color, `${itemPath}.color`)
    ]
  })
}

function validateOptionalElements(value: unknown, path: string) {
  if (value === undefined) {
    return []
  }
  if (!isRecord(value)) {
    return [{ path, code: 'INVALID_COLOR_ROLES', message: `${path} must be an object when present.` }]
  }

  const unknownIssues = rejectUnknownProperties(value, optionalElementRoleKeys, path, 'INVALID_COLOR_ROLES')

  return [...unknownIssues, ...Object.entries(value).flatMap(([key, reference]) =>
    optionalElementRoleKeys.includes(key as typeof optionalElementRoleKeys[number])
      ? validateVisualColorReference(reference, `${path}.${key}`)
      : []
  )]
}

function requireText(value: Record<string, unknown>, key: string, path: string) {
  return typeof value[key] === 'string' && String(value[key]).trim() !== ''
    ? []
    : [{ path: `${path}.${key}`, code: 'INVALID_COLOR_ROLES', message: `${path}.${key} must be a non-empty string.` }]
}

function validateOptionalString(value: Record<string, unknown>, key: string, path: string) {
  return value[key] === undefined || typeof value[key] === 'string'
    ? []
    : [{ path: `${path}.${key}`, code: 'INVALID_PREVIEW_CONFIG', message: `${path}.${key} must be a string when present.` }]
}

function validatePaletteColorReference(value: unknown, path: string) {
  if (!isRecord(value) || value.source !== 'palette' || typeof value.color_id !== 'string' || value.color_id.trim() === '') {
    return [{ path, code: 'INVALID_COLOR_ROLES', message: `${path} must be a palette color reference with color_id.` }]
  }
  return validateOpacity(value.opacity, path)
}

function validateVisualColorReference(value: unknown, path: string) {
  if (!isRecord(value)) {
    return [{ path, code: 'INVALID_COLOR_ROLES', message: `${path} must be a color reference.` }]
  }
  if (value.source === 'palette') {
    return validatePaletteColorReference(value, path)
  }
  if (value.source === 'theme' && typeof value.token === 'string' && ['foreground', 'muted_foreground', 'grid', 'background'].includes(value.token)) {
    return validateOpacity(value.opacity, path)
  }
  return [{ path, code: 'INVALID_COLOR_ROLES', message: `${path} must use a palette color or approved theme token.` }]
}

function validateOpacity(value: unknown, path: string) {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1)
    ? []
    : [{ path: `${path}.opacity`, code: 'INVALID_COLOR_ROLES', message: `${path}.opacity must be between 0 and 1.` }]
}
