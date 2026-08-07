import type { ChartTemplateDefinition, ValidationResult } from '../types'
import {
  combineIssues,
  isRecord,
  requireArrayProperty,
  requireEnumProperty,
  requirePositiveIntegerProperty,
  rejectUnknownProperties,
  validateObject
} from '../validation'

const rolesPath = 'color_roles'
const configPath = 'preview_config'
const optionalElementRoleKeys = [
  'axis',
  'grid',
  'reference_line',
  'text',
  'marker_stroke',
  'background'
] as const

export const lineMultiseriesTemplate: ChartTemplateDefinition = {
  id: 'line_multiseries_v1',
  chartType: 'line_multiseries',
  templateVersion: 1,
  schemaVersion: 1,
  validateRoles(value: unknown): ValidationResult {
    const objectResult = validateObject(value, rolesPath, 'INVALID_COLOR_ROLES')
    if (!objectResult.valid) {
      return objectResult
    }

    const roles = value as Record<string, unknown>
    return combineIssues([
      ...rejectUnknownProperties(roles, ['series', 'elements'], rolesPath, 'INVALID_COLOR_ROLES'),
      ...requireArrayProperty(roles, 'series', rolesPath, 'INVALID_COLOR_ROLES'),
      ...validateSeriesItems(roles.series, `${rolesPath}.series`),
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
      ...requirePositiveIntegerProperty(config, 'point_count', configPath, 'INVALID_PREVIEW_CONFIG'),
      ...validatePointCountRange(config.point_count, `${configPath}.point_count`),
      ...requireEnumProperty(config, 'curve_shape', ['increasing', 'decreasing', 'sigmoid', 'peak', 'mixed'], configPath, 'INVALID_PREVIEW_CONFIG'),
      ...validateOptionalString(config, 'x_axis_label', configPath),
      ...validateOptionalString(config, 'y_axis_label', configPath)
    ])
  }
}

function validateSeriesItems(value: unknown, path: string) {
  if (!Array.isArray(value)) {
    return []
  }
  if (value.length < 1 || value.length > 5) {
    return [{ path, code: 'INVALID_COLOR_ROLES', message: `${path} must contain 1 to 5 series.` }]
  }

  const seenKeys = new Set<string>()
  return value.flatMap((item, index) => {
    const itemPath = `${path}[${index}]`
    if (!isRecord(item)) {
      return [{ path: itemPath, code: 'INVALID_COLOR_ROLES', message: `${itemPath} must be an object.` }]
    }
    const duplicateKeyIssue = typeof item.key === 'string' && seenKeys.has(item.key)
      ? [{ path: `${itemPath}.key`, code: 'INVALID_COLOR_ROLES', message: `Duplicate series key: ${item.key}.` }]
      : []
    if (typeof item.key === 'string') {
      seenKeys.add(item.key)
    }
    return [
      ...duplicateKeyIssue,
      ...requireText(item, 'key', itemPath),
      ...requireText(item, 'label', itemPath),
      ...validatePaletteColorReference(item.line, `${itemPath}.line`),
      ...validateOptionalVisualColorReference(item.confidence_band, `${itemPath}.confidence_band`),
      ...validateOptionalVisualColorReference(item.marker, `${itemPath}.marker`)
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

function validatePointCountRange(value: unknown, path: string) {
  return Number.isInteger(value) && Number(value) >= 6 && Number(value) <= 12
    ? []
    : [{ path, code: 'INVALID_PREVIEW_CONFIG', message: `${path} must be between 6 and 12.` }]
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

function validateOptionalVisualColorReference(value: unknown, path: string) {
  return value === undefined ? [] : validateVisualColorReference(value, path)
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
