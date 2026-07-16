import type { ChartTemplateDefinition, ValidationResult } from '../types'
import {
  combineIssues,
  isRecord,
  requireArrayProperty,
  requireEnumProperty,
  requireObjectProperty,
  requirePrimitiveProperty,
  validateObject
} from '../validation'

const rolesPath = 'color_roles'
const configPath = 'preview_config'
const requiredElementRoleKeys = [
  'axis',
  'grid',
  'text',
  'box_stroke',
  'median',
  'whisker',
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
      ...requireArrayProperty(roles, 'groups', rolesPath, 'INVALID_COLOR_ROLES'),
      ...requireObjectProperty(roles, 'elements', rolesPath, 'INVALID_COLOR_ROLES'),
      ...validateNamedRoles(roles.groups, `${rolesPath}.groups`),
      ...validateRequiredElementRoles(roles.elements, `${rolesPath}.elements`)
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
      ...requirePrimitiveProperty(config, 'show_outliers', 'boolean', configPath, 'INVALID_PREVIEW_CONFIG')
    ])
  }
}

function validateNamedRoles(value: unknown, path: string) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item, index) => {
    const itemPath = `${path}[${index}]`
    if (!isRecord(item)) {
      return [{ path: itemPath, code: 'INVALID_COLOR_ROLES', message: `${itemPath} must be an object.` }]
    }
    return [
      ...requireText(item, 'key', itemPath),
      ...requireText(item, 'label', itemPath),
      ...requireObjectProperty(item, 'color', itemPath, 'INVALID_COLOR_ROLES')
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

function requireText(value: Record<string, unknown>, key: string, path: string) {
  return typeof value[key] === 'string' && String(value[key]).trim() !== ''
    ? []
    : [{ path: `${path}.${key}`, code: 'INVALID_COLOR_ROLES', message: `${path}.${key} must be a non-empty string.` }]
}
