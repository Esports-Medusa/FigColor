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
const elementKeys = ['axis', 'muted_foreground', 'grid', 'background'] as const
const themeTokens = ['foreground', 'muted_foreground', 'grid', 'background'] as const

export const scatterGroupedTemplate: ChartTemplateDefinition = {
  id: 'scatter_grouped_v1',
  chartType: 'scatter_grouped',
  templateVersion: 1,
  schemaVersion: 1,
  validateRoles(value: unknown): ValidationResult {
    const objectResult = validateObject(value, rolesPath, 'INVALID_COLOR_ROLES')
    if (!objectResult.valid) return objectResult
    const roles = value as Record<string, unknown>
    return combineIssues([
      ...rejectUnknownProperties(roles, ['groups', 'elements'], rolesPath, 'INVALID_COLOR_ROLES'),
      ...requireArrayProperty(roles, 'groups', rolesPath, 'INVALID_COLOR_ROLES'),
      ...validateGroups(roles.groups, `${rolesPath}.groups`),
      ...validateElements(roles.elements, `${rolesPath}.elements`)
    ])
  },
  validateConfig(value: unknown): ValidationResult {
    const objectResult = validateObject(value, configPath, 'INVALID_PREVIEW_CONFIG')
    if (!objectResult.valid) return objectResult
    const config = value as Record<string, unknown>
    return combineIssues([
      ...requirePositiveIntegerProperty(config, 'point_count', configPath, 'INVALID_PREVIEW_CONFIG'),
      ...integerRange(config.point_count, `${configPath}.point_count`, 8, 30),
      ...requireEnumProperty(config, 'data_pattern', ['clusters', 'positive', 'negative', 'mixed'], configPath, 'INVALID_PREVIEW_CONFIG'),
      ...requireEnumProperty(config, 'point_size', ['small', 'medium', 'large'], configPath, 'INVALID_PREVIEW_CONFIG'),
      ...optionalNumber(config, 'point_opacity', configPath, 0.25, 1)
    ])
  }
}

function validateGroups(value: unknown, path: string) {
  if (!Array.isArray(value)) return []
  if (value.length < 1 || value.length > 5) {
    return [{ path, code: 'INVALID_COLOR_ROLES', message: `${path} must contain 1 to 5 groups.` }]
  }
  const seen = new Set<string>()
  return value.flatMap((item, index) => {
    const itemPath = `${path}[${index}]`
    if (!isRecord(item)) return [{ path: itemPath, code: 'INVALID_COLOR_ROLES', message: `${itemPath} must be an object.` }]
    const issues = [
      ...text(item, 'key', itemPath),
      ...text(item, 'label', itemPath),
      ...paletteReference(item.color, `${itemPath}.color`)
    ]
    if (typeof item.key === 'string' && seen.has(item.key)) {
      issues.push({ path: `${itemPath}.key`, code: 'DUPLICATE_ROLE_KEY', message: `Duplicate group key: ${item.key}.` })
    }
    if (typeof item.key === 'string') seen.add(item.key)
    return issues
  })
}

function validateElements(value: unknown, path: string) {
  if (!isRecord(value)) {
    return [{ path, code: 'INVALID_COLOR_ROLES', message: `${path} must be an object.` }]
  }
  return [
    ...rejectUnknownProperties(value, elementKeys, path, 'INVALID_COLOR_ROLES'),
    ...elementKeys.flatMap((key) =>
    Object.prototype.hasOwnProperty.call(value, key)
      ? visualReference(value[key], `${path}.${key}`)
      : [{ path: `${path}.${key}`, code: 'INVALID_COLOR_ROLES', message: `${path}.${key} is required.` }]
    )
  ]
}

function paletteReference(value: unknown, path: string) {
  if (!isRecord(value) || value.source !== 'palette' || typeof value.color_id !== 'string' || !value.color_id.trim()) {
    return [{ path, code: 'INVALID_COLOR_ROLES', message: `${path} must be a palette color reference with color_id.` }]
  }
  return opacity(value.opacity, path)
}

function visualReference(value: unknown, path: string) {
  if (!isRecord(value)) return [{ path, code: 'INVALID_COLOR_ROLES', message: `${path} must be a color reference.` }]
  if (value.source === 'palette') return paletteReference(value, path)
  if (value.source === 'theme' && typeof value.token === 'string' && themeTokens.includes(value.token as typeof themeTokens[number])) {
    return opacity(value.opacity, path)
  }
  return [{ path, code: 'INVALID_COLOR_ROLES', message: `${path} must use a palette color or approved theme token.` }]
}

function opacity(value: unknown, path: string) {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1)
    ? []
    : [{ path: `${path}.opacity`, code: 'INVALID_COLOR_ROLES', message: `${path}.opacity must be between 0 and 1.` }]
}

function text(value: Record<string, unknown>, key: string, path: string) {
  return typeof value[key] === 'string' && String(value[key]).trim()
    ? []
    : [{ path: `${path}.${key}`, code: 'INVALID_COLOR_ROLES', message: `${path}.${key} must be a non-empty string.` }]
}

function integerRange(value: unknown, path: string, min: number, max: number) {
  return Number.isInteger(value) && Number(value) >= min && Number(value) <= max
    ? []
    : [{ path, code: 'INVALID_PREVIEW_CONFIG', message: `${path} must be between ${min} and ${max}.` }]
}

function optionalNumber(value: Record<string, unknown>, key: string, path: string, min: number, max: number) {
  const candidate = value[key]
  return candidate === undefined || (typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= min && candidate <= max)
    ? []
    : [{ path: `${path}.${key}`, code: 'INVALID_PREVIEW_CONFIG', message: `${path}.${key} must be between ${min} and ${max}.` }]
}
