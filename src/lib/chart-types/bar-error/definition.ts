import type { ChartTemplateDefinition, ValidationResult } from '../types'
import {
  combineIssues,
  isRecord,
  requireArrayProperty,
  requireEnumProperty,
  requireObjectProperty,
  requirePositiveIntegerProperty,
  validateObject
} from '../validation'

const barErrorRolesPath = 'color_roles'
const barErrorConfigPath = 'preview_config'
const requiredElementRoleKeys = ['axis', 'grid', 'text', 'error_bar', 'background'] as const

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

  return value.flatMap((item, index) => {
    const itemPath = `${path}[${index}]`
    if (!isRecord(item)) {
      return [{ path: itemPath, code: 'INVALID_COLOR_ROLES', message: `${itemPath} must be an object.` }]
    }
    return [
      ...requireEnumLikeString(item, 'key', itemPath),
      ...requireEnumLikeString(item, 'label', itemPath),
      ...requireObjectProperty(item, 'fill', itemPath, 'INVALID_COLOR_ROLES')
    ]
  })
}

function validateRequiredElementRoles(value: unknown, path: string) {
  if (!isRecord(value)) {
    return []
  }

  return requiredElementRoleKeys.flatMap((key) =>
    requireObjectProperty(value, key, path, 'INVALID_COLOR_ROLES')
  )
}

function requireEnumLikeString(value: Record<string, unknown>, key: string, path: string) {
  return typeof value[key] === 'string' && String(value[key]).trim() !== ''
    ? []
    : [{ path: `${path}.${key}`, code: 'INVALID_COLOR_ROLES', message: `${path}.${key} must be a non-empty string.` }]
}
