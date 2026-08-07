import type { ChartTemplateDefinition, ValidationResult } from '../types'
import {
  combineIssues,
  isRecord,
  requireArrayProperty,
  requireEnumProperty,
  requirePositiveIntegerProperty,
  requirePrimitiveProperty,
  rejectUnknownProperties,
  validateObject
} from '../validation'

const rolesPath = 'color_roles'
const configPath = 'preview_config'
const optionalElementRoleKeys = [
  'missing_value',
  'text',
  'border',
  'grid',
  'background',
  'annotation_text'
] as const

export const heatmapAnnotatedTemplate: ChartTemplateDefinition = {
  id: 'heatmap_annotated_v1',
  chartType: 'heatmap_annotated',
  templateVersion: 1,
  schemaVersion: 1,
  validateRoles(value: unknown): ValidationResult {
    const objectResult = validateObject(value, rolesPath, 'INVALID_COLOR_ROLES')
    if (!objectResult.valid) {
      return objectResult
    }

    const roles = value as Record<string, unknown>
    const scale = roles.scale
    return combineIssues([
      ...rejectUnknownProperties(roles, ['scale', 'elements', 'annotations'], rolesPath, 'INVALID_COLOR_ROLES'),
      ...validateScaleObject(roles.scale, `${rolesPath}.scale`),
      ...validateOptionalElements(roles.elements, `${rolesPath}.elements`),
      ...validateAnnotations(roles.annotations, `${rolesPath}.annotations`),
      ...(isRecord(scale)
        ? [
            ...requireEnumProperty(scale, 'type', ['sequential', 'diverging'], `${rolesPath}.scale`, 'INVALID_COLOR_ROLES'),
            ...requireArrayProperty(scale, 'stops', `${rolesPath}.scale`, 'INVALID_COLOR_ROLES'),
            ...validateScaleStopCount(scale, `${rolesPath}.scale`),
            ...validateScaleStops(scale.stops, `${rolesPath}.scale.stops`)
          ]
        : [])
    ])
  },
  validateConfig(value: unknown): ValidationResult {
    const objectResult = validateObject(value, configPath, 'INVALID_PREVIEW_CONFIG')
    if (!objectResult.valid) {
      return objectResult
    }

    const config = value as Record<string, unknown>
    return combineIssues([
      ...requirePositiveIntegerProperty(config, 'rows', configPath, 'INVALID_PREVIEW_CONFIG'),
      ...validateIntegerRange(config.rows, `${configPath}.rows`, 4, 8),
      ...requirePositiveIntegerProperty(config, 'columns', configPath, 'INVALID_PREVIEW_CONFIG'),
      ...validateIntegerRange(config.columns, `${configPath}.columns`, 4, 8),
      ...requirePrimitiveProperty(config, 'cluster_rows', 'boolean', configPath, 'INVALID_PREVIEW_CONFIG'),
      ...requirePrimitiveProperty(config, 'cluster_columns', 'boolean', configPath, 'INVALID_PREVIEW_CONFIG'),
      ...requirePrimitiveProperty(config, 'show_row_labels', 'boolean', configPath, 'INVALID_PREVIEW_CONFIG'),
      ...requirePrimitiveProperty(config, 'show_column_labels', 'boolean', configPath, 'INVALID_PREVIEW_CONFIG'),
      ...requirePrimitiveProperty(config, 'show_values', 'boolean', configPath, 'INVALID_PREVIEW_CONFIG'),
      ...requireEnumProperty(config, 'data_pattern', ['two_clusters', 'three_clusters', 'gradient', 'mixed'], configPath, 'INVALID_PREVIEW_CONFIG')
    ])
  }
}

function validateScaleObject(value: unknown, path: string) {
  return isRecord(value)
    ? []
    : [{ path, code: 'INVALID_COLOR_ROLES', message: `${path} must be an object.` }]
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

function validateAnnotations(value: unknown, path: string) {
  if (value === undefined) {
    return []
  }
  if (!Array.isArray(value)) {
    return [{ path, code: 'INVALID_COLOR_ROLES', message: `${path} must be an array when present.` }]
  }

  const seenKeys = new Set<string>()
  return value.flatMap((item, index) => {
    const itemPath = `${path}[${index}]`
    if (!isRecord(item)) {
      return [{ path: itemPath, code: 'INVALID_COLOR_ROLES', message: `${itemPath} must be an object.` }]
    }
    const duplicateKeyIssue = typeof item.key === 'string' && seenKeys.has(item.key)
      ? [{ path: `${itemPath}.key`, code: 'INVALID_COLOR_ROLES', message: `Duplicate annotation key: ${item.key}.` }]
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

function validateScaleStopCount(scale: Record<string, unknown>, path: string) {
  if (!Array.isArray(scale.stops)) {
    return []
  }

  if (scale.type === 'sequential' && scale.stops.length < 2) {
    return [{ path: `${path}.stops`, code: 'INVALID_COLOR_ROLES', message: `${path}.stops must contain at least 2 stops for a sequential scale.` }]
  }

  if (scale.type === 'diverging' && scale.stops.length < 3) {
    return [{ path: `${path}.stops`, code: 'INVALID_COLOR_ROLES', message: `${path}.stops must contain at least 3 stops for a diverging scale.` }]
  }

  return scale.stops.length > 0
    ? []
    : [{ path: `${path}.stops`, code: 'INVALID_COLOR_ROLES', message: `${path}.stops must not be empty.` }]
}

function validateScaleStops(value: unknown, path: string) {
  if (!Array.isArray(value)) {
    return []
  }

  const issues = value.flatMap((item, index) => {
    const itemPath = `${path}[${index}]`
    if (!isRecord(item)) {
      return [{ path: itemPath, code: 'INVALID_COLOR_ROLES', message: `${itemPath} must be an object.` }]
    }
    return [
      ...requirePositiveNumber(item, 'position', itemPath),
      ...validateStopPositionRange(item.position, `${itemPath}.position`),
      ...validatePaletteColorReference(item.color, `${itemPath}.color`),
      ...validateOptionalString(item, 'label', itemPath, 'INVALID_COLOR_ROLES')
    ]
  })

  for (let index = 1; index < value.length; index += 1) {
    const previous = isRecord(value[index - 1]) ? value[index - 1].position : undefined
    const current = isRecord(value[index]) ? value[index].position : undefined
    if (
      typeof previous === 'number' &&
      typeof current === 'number' &&
      Number.isFinite(previous) &&
      Number.isFinite(current) &&
      current <= previous
    ) {
      issues.push({
        path: `${path}[${index}].position`,
        code: 'INVALID_COLOR_ROLES',
        message: `${path}[${index}].position must be greater than the previous stop position.`
      })
    }
  }

  return issues
}

function requirePositiveNumber(value: Record<string, unknown>, key: string, path: string) {
  return typeof value[key] === 'number' && Number.isFinite(value[key])
    ? []
    : [{ path: `${path}.${key}`, code: 'INVALID_COLOR_ROLES', message: `${path}.${key} must be a number.` }]
}

function validateStopPositionRange(value: unknown, path: string) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? []
    : [{ path, code: 'INVALID_COLOR_ROLES', message: `${path} must be between 0 and 1.` }]
}

function validateIntegerRange(value: unknown, path: string, min: number, max: number) {
  return Number.isInteger(value) && Number(value) >= min && Number(value) <= max
    ? []
    : [{ path, code: 'INVALID_PREVIEW_CONFIG', message: `${path} must be between ${min} and ${max}.` }]
}

function requireText(value: Record<string, unknown>, key: string, path: string) {
  return typeof value[key] === 'string' && String(value[key]).trim() !== ''
    ? []
    : [{ path: `${path}.${key}`, code: 'INVALID_COLOR_ROLES', message: `${path}.${key} must be a non-empty string.` }]
}

function validateOptionalString(
  value: Record<string, unknown>,
  key: string,
  path: string,
  code: 'INVALID_COLOR_ROLES' | 'INVALID_PREVIEW_CONFIG'
) {
  return value[key] === undefined || typeof value[key] === 'string'
    ? []
    : [{ path: `${path}.${key}`, code, message: `${path}.${key} must be a string when present.` }]
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
