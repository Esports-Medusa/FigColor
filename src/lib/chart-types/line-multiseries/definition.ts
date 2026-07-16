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

const rolesPath = 'color_roles'
const configPath = 'preview_config'
const requiredElementRoleKeys = [
  'axis',
  'grid',
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
      ...requireArrayProperty(roles, 'series', rolesPath, 'INVALID_COLOR_ROLES'),
      ...requireObjectProperty(roles, 'elements', rolesPath, 'INVALID_COLOR_ROLES'),
      ...validateSeriesItems(roles.series, `${rolesPath}.series`),
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
      ...requirePositiveIntegerProperty(config, 'point_count', configPath, 'INVALID_PREVIEW_CONFIG'),
      ...validatePointCountRange(config.point_count, `${configPath}.point_count`),
      ...requireEnumProperty(config, 'curve_shape', ['increasing', 'decreasing', 'sigmoid', 'peak', 'mixed'], configPath, 'INVALID_PREVIEW_CONFIG')
    ])
  }
}

function validateSeriesItems(value: unknown, path: string) {
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
      ...requireObjectProperty(item, 'line', itemPath, 'INVALID_COLOR_ROLES')
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
