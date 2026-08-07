import type { ChartTemplateDefinition, ValidationResult } from '../types'
import {
  combineIssues,
  isRecord,
  requireArrayProperty,
  requireEnumProperty,
  requireObjectProperty,
  requirePositiveIntegerProperty,
  rejectUnknownProperties,
  validateObject
} from '../validation'

const barErrorRolesPath = 'color_roles'
const barErrorConfigPath = 'preview_config'
const requiredElementRoleKeys = ['axis', 'grid', 'text', 'error_bar', 'background'] as const
const themeTokens = ['foreground', 'muted_foreground', 'grid', 'background'] as const

export const barErrorTemplate: ChartTemplateDefinition = {
  id: 'bar_error_v1',
  chartType: 'bar_error',
  templateVersion: 1,
  schemaVersion: 1,
  validateRoles(value: unknown): ValidationResult {
    const objectResult = validateObject(value, barErrorRolesPath, 'INVALID_COLOR_ROLES')
    if (!objectResult.valid) {
      return objectResult
    }

    const roles = value as Record<string, unknown>
    return combineIssues([
      ...rejectUnknownProperties(roles, ['groups', 'elements'], barErrorRolesPath, 'INVALID_COLOR_ROLES'),
      ...requireArrayProperty(roles, 'groups', barErrorRolesPath, 'INVALID_COLOR_ROLES'),
      ...requireObjectProperty(roles, 'elements', barErrorRolesPath, 'INVALID_COLOR_ROLES'),
      ...validateGroupItems(roles.groups, `${barErrorRolesPath}.groups`),
      ...validateRequiredElementRoles(roles.elements, `${barErrorRolesPath}.elements`)
    ])
  },
  validateConfig(value: unknown): ValidationResult {
    const objectResult = validateObject(value, barErrorConfigPath, 'INVALID_PREVIEW_CONFIG')
    if (!objectResult.valid) {
      return objectResult
    }

    const config = value as Record<string, unknown>
    return combineIssues([
      ...requireEnumProperty(config, 'orientation', ['vertical', 'horizontal'], barErrorConfigPath, 'INVALID_PREVIEW_CONFIG'),
      ...requirePositiveIntegerProperty(config, 'sample_size', barErrorConfigPath, 'INVALID_PREVIEW_CONFIG'),
      ...requireEnumProperty(config, 'error_type', ['sd', 'sem', 'ci'], barErrorConfigPath, 'INVALID_PREVIEW_CONFIG'),
      ...requireEnumProperty(
        config,
        'data_pattern',
        ['treatment_higher', 'treatment_lower', 'dose_response', 'mixed'],
        barErrorConfigPath,
        'INVALID_PREVIEW_CONFIG'
      )
    ])
  }
}

function validateGroupItems(value: unknown, path: string) {
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
      ? [{ path: `${itemPath}.key`, code: 'DUPLICATE_ROLE_KEY', message: `Duplicate group key: ${item.key}.` }]
      : []
    if (typeof item.key === 'string') {
      seenKeys.add(item.key)
    }
    return [
      ...duplicateKeyIssue,
      ...requireEnumLikeString(item, 'key', itemPath),
      ...requireEnumLikeString(item, 'label', itemPath),
      ...validatePaletteColorReference(item.fill, `${itemPath}.fill`)
    ]
  })
}

function validateRequiredElementRoles(value: unknown, path: string) {
  if (!isRecord(value)) {
    return []
  }

  return [
    ...rejectUnknownProperties(value, requiredElementRoleKeys, path, 'INVALID_COLOR_ROLES'),
    ...requiredElementRoleKeys.flatMap((key) =>
    Object.prototype.hasOwnProperty.call(value, key)
      ? validateVisualColorReference(value[key], `${path}.${key}`)
      : requireObjectProperty(value, key, path, 'INVALID_COLOR_ROLES')
    )
  ]
}

function requireEnumLikeString(value: Record<string, unknown>, key: string, path: string) {
  return typeof value[key] === 'string' && String(value[key]).trim() !== ''
    ? []
    : [{ path: `${path}.${key}`, code: 'INVALID_COLOR_ROLES', message: `${path}.${key} must be a non-empty string.` }]
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
  if (value.source === 'theme' && typeof value.token === 'string' && themeTokens.includes(value.token as typeof themeTokens[number])) {
    return validateOpacity(value.opacity, path)
  }
  return [{ path, code: 'INVALID_COLOR_ROLES', message: `${path} must use a palette color or approved theme token.` }]
}

function validateOpacity(value: unknown, path: string) {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1)
    ? []
    : [{ path: `${path}.opacity`, code: 'INVALID_COLOR_ROLES', message: `${path}.opacity must be between 0 and 1.` }]
}
