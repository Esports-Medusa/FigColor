import type { ValidationIssue } from '@/types/palette'
import {
  invalidResult,
  registryIssue,
  validResult,
  type PreviewSchema,
  type PreviewSchemaRule,
  type ValidationResult
} from './types'

type PrimitiveKind = 'string' | 'number' | 'boolean'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function validateObject(value: unknown, path: string, code: 'INVALID_COLOR_ROLES' | 'INVALID_PREVIEW_CONFIG'): ValidationResult {
  return isRecord(value)
    ? validResult()
    : invalidResult([registryIssue(path, code, `${path} must be an object.`)])
}

export function requireObjectProperty(
  value: Record<string, unknown>,
  key: string,
  path: string,
  code: 'INVALID_COLOR_ROLES' | 'INVALID_PREVIEW_CONFIG'
): ValidationIssue[] {
  return isRecord(value[key])
    ? []
    : [registryIssue(`${path}.${key}`, code, `${path}.${key} must be an object.`)]
}

export function requireArrayProperty(
  value: Record<string, unknown>,
  key: string,
  path: string,
  code: 'INVALID_COLOR_ROLES' | 'INVALID_PREVIEW_CONFIG'
): ValidationIssue[] {
  return Array.isArray(value[key])
    ? []
    : [registryIssue(`${path}.${key}`, code, `${path}.${key} must be an array.`)]
}

export function requirePrimitiveProperty(
  value: Record<string, unknown>,
  key: string,
  kind: PrimitiveKind,
  path: string,
  code: 'INVALID_COLOR_ROLES' | 'INVALID_PREVIEW_CONFIG'
): ValidationIssue[] {
  return typeof value[key] === kind
    ? []
    : [registryIssue(`${path}.${key}`, code, `${path}.${key} must be a ${kind}.`)]
}

export function requirePositiveIntegerProperty(
  value: Record<string, unknown>,
  key: string,
  path: string,
  code: 'INVALID_COLOR_ROLES' | 'INVALID_PREVIEW_CONFIG'
): ValidationIssue[] {
  return Number.isInteger(value[key]) && Number(value[key]) > 0
    ? []
    : [registryIssue(`${path}.${key}`, code, `${path}.${key} must be a positive integer.`)]
}

export function requireEnumProperty<T extends string>(
  value: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  path: string,
  code: 'INVALID_COLOR_ROLES' | 'INVALID_PREVIEW_CONFIG'
): ValidationIssue[] {
  return typeof value[key] === 'string' && allowed.includes(value[key] as T)
    ? []
    : [registryIssue(`${path}.${key}`, code, `${path}.${key} must be one of: ${allowed.join(', ')}.`)]
}

export function rejectUnknownProperties(
  value: unknown,
  allowed: readonly string[],
  path: string,
  code: 'INVALID_COLOR_ROLES' | 'INVALID_PREVIEW_CONFIG'
): ValidationIssue[] {
  if (!isRecord(value)) return []
  return Object.keys(value)
    .filter((key) => !allowed.includes(key))
    .map((key) => registryIssue(`${path}.${key}`, code, `${path}.${key} is not supported.`))
}

export function combineIssues(issues: ValidationIssue[]): ValidationResult {
  return issues.length > 0 ? invalidResult(issues) : validResult()
}

export function validateSchema(value: unknown, schema: PreviewSchema, path: string, code: 'INVALID_COLOR_ROLES' | 'INVALID_PREVIEW_CONFIG'): ValidationResult {
  return combineIssues(validateSchemaValue(value, schema, path, code))
}

function validateSchemaValue(value: unknown, schema: PreviewSchema, path: string, code: 'INVALID_COLOR_ROLES' | 'INVALID_PREVIEW_CONFIG'): ValidationIssue[] {
  switch (schema.kind) {
    case 'object': {
      if (!isRecord(value)) return [registryIssue(path, code, `${path} must be an object.`)]
      const issues = schema.exact ? rejectUnknownProperties(value, Object.keys(schema.fields), path, code) : []
      for (const [key, field] of Object.entries(schema.fields)) {
        const childPath = `${path}.${key}`
        if (!Object.prototype.hasOwnProperty.call(value, key) || value[key] === undefined) {
          if (field.required) issues.push(registryIssue(childPath, code, `${childPath} is required.`))
          continue
        }
        issues.push(...validateSchemaValue(value[key], field.schema, childPath, code))
      }
      for (const rule of schema.rules ?? []) {
        if (rule.kind === 'conditional_min_items' && typeof value[rule.discriminatorField] === 'string' && Array.isArray(value[rule.arrayField])) {
          const minimum = rule.cases[value[rule.discriminatorField] as string]
          if (minimum !== undefined && (value[rule.arrayField] as unknown[]).length < minimum) issues.push(registryIssue(`${path}.${rule.arrayField}`, code, `${path}.${rule.arrayField} must contain at least ${minimum} items.`))
        }
      }
      return issues
    }
    case 'array': {
      if (!Array.isArray(value)) return [registryIssue(path, code, `${path} must be an array.`)]
      const issues: ValidationIssue[] = []
      if ((schema.minItems !== undefined && value.length < schema.minItems) || (schema.maxItems !== undefined && value.length > schema.maxItems)) {
        const range = schema.maxItems === undefined ? `at least ${schema.minItems}` : `${schema.minItems} to ${schema.maxItems}`
        issues.push(registryIssue(path, code, `${path} must contain ${range} items.`))
      }
      value.forEach((item, index) => issues.push(...validateSchemaValue(item, schema.items, `${path}[${index}]`, code)))
      for (const rule of schema.rules ?? []) issues.push(...validateArrayRule(value, rule, path, code))
      return issues
    }
    case 'string':
      if (typeof value !== 'string') return [registryIssue(path, code, `${path} must be a string.`)]
      if (schema.nonWhitespace && value.trim() === '') return [registryIssue(path, code, `${path} must be a non-empty string.`)]
      if (schema.enum && !schema.enum.includes(value)) return [registryIssue(path, code, `${path} must be one of: ${schema.enum.join(', ')}.`)]
      return []
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value) || (schema.integer && !Number.isInteger(value))) return [registryIssue(path, code, `${path} must be ${schema.integer ? 'an integer' : 'a number'}.`)]
      if (schema.min !== undefined && value < schema.min) return [registryIssue(path, code, schema.max === undefined ? `${path} must be at least ${schema.min}.` : `${path} must be between ${schema.min} and ${schema.max}.`)]
      if (schema.max !== undefined && value > schema.max) return [registryIssue(path, code, schema.min === undefined ? `${path} must be at most ${schema.max}.` : `${path} must be between ${schema.min} and ${schema.max}.`)]
      return []
    case 'boolean': return typeof value === 'boolean' ? [] : [registryIssue(path, code, `${path} must be a boolean.`)]
    case 'palette_reference': return validatePaletteReference(value, schema.unknownMembers, path, code)
    case 'visual_reference': return validateVisualReference(value, schema.themeTokens, schema.unknownMembers, path, code)
  }
}

function validatePaletteReference(value: unknown, unknownMembers: 'allow' | 'reject', path: string, code: 'INVALID_COLOR_ROLES' | 'INVALID_PREVIEW_CONFIG') {
  if (!isRecord(value) || value.source !== 'palette' || typeof value.color_id !== 'string' || value.color_id.trim() === '') return [registryIssue(path, code, `${path} must be a palette color reference with color_id.`)]
  const issues = unknownMembers === 'reject' ? rejectUnknownProperties(value, ['source', 'color_id', 'opacity'], path, code) : []
  if (!(value.opacity === undefined || (typeof value.opacity === 'number' && Number.isFinite(value.opacity) && value.opacity >= 0 && value.opacity <= 1))) issues.push(registryIssue(`${path}.opacity`, code, `${path}.opacity must be between 0 and 1.`))
  return issues
}

function validateVisualReference(value: unknown, tokens: string[], unknownMembers: 'allow' | 'reject', path: string, code: 'INVALID_COLOR_ROLES' | 'INVALID_PREVIEW_CONFIG') {
  if (!isRecord(value)) return [registryIssue(path, code, `${path} must be a color reference.`)]
  if (value.source === 'palette') return validatePaletteReference(value, unknownMembers, path, code)
  if (value.source === 'theme' && typeof value.token === 'string' && tokens.includes(value.token)) {
    const issues = unknownMembers === 'reject' ? rejectUnknownProperties(value, ['source', 'token', 'opacity'], path, code) : []
    if (!(value.opacity === undefined || (typeof value.opacity === 'number' && Number.isFinite(value.opacity) && value.opacity >= 0 && value.opacity <= 1))) issues.push(registryIssue(`${path}.opacity`, code, `${path}.opacity must be between 0 and 1.`))
    return issues
  }
  return [registryIssue(path, code, `${path} must use a palette color or approved theme token.`)]
}

export function validateSchemaDeclaration(schema: PreviewSchema, path = 'schema'): string[] {
  const errors: string[] = []
  const visit = (node: PreviewSchema, at: string) => {
    if (node.kind === 'number' && node.min !== undefined && node.max !== undefined && node.min > node.max) errors.push(`${at} has min greater than max.`)
    if (node.kind === 'array') {
      if (node.minItems !== undefined && node.minItems < 0) errors.push(`${at}.minItems is invalid.`)
      if (node.maxItems !== undefined && (node.maxItems < 0 || (node.minItems !== undefined && node.minItems > node.maxItems))) errors.push(`${at}.maxItems is invalid.`)
      visit(node.items, `${at}.items`)
    }
    if (node.kind === 'object') Object.entries(node.fields).forEach(([key, field]) => visit(field.schema, `${at}.fields.${key}`))
  }
  visit(schema, path)
  return errors
}

function validateArrayRule(value: unknown[], rule: PreviewSchemaRule, path: string, code: 'INVALID_COLOR_ROLES' | 'INVALID_PREVIEW_CONFIG') {
  const issues: ValidationIssue[] = []
  if (rule.kind === 'unique_by') {
    const seen = new Set<unknown>()
    value.forEach((item, index) => { const candidate = isRecord(item) ? item[rule.field] : undefined; if (typeof candidate === 'string' || typeof candidate === 'number') { if (seen.has(candidate)) issues.push(registryIssue(`${path}[${index}].${rule.field}`, rule.issueCode ?? code, `Duplicate ${rule.field}.`)); seen.add(candidate) } })
  } else if (rule.kind === 'strictly_increasing') {
    for (let index = 1; index < value.length; index += 1) { const previous = value[index - 1]; const current = value[index]; const a = isRecord(previous) ? previous[rule.field] : undefined; const b = isRecord(current) ? current[rule.field] : undefined; if (typeof a === 'number' && typeof b === 'number' && Number.isFinite(a) && Number.isFinite(b) && b <= a) issues.push(registryIssue(`${path}[${index}].${rule.field}`, code, `${path}[${index}].${rule.field} must be greater than the previous value.`)) }
  }
  return issues
}

export function defineTemplate<T extends { rolesSchema: PreviewSchema; configSchema: PreviewSchema }>(definition: Omit<T, 'validateRoles' | 'validateConfig'>): T & { validateRoles(value: unknown): ValidationResult; validateConfig(value: unknown): ValidationResult } {
  return { ...definition, validateRoles: (value) => validateSchema(value, definition.rolesSchema, 'color_roles', 'INVALID_COLOR_ROLES'), validateConfig: (value) => validateSchema(value, definition.configSchema, 'preview_config', 'INVALID_PREVIEW_CONFIG') } as T & { validateRoles(value: unknown): ValidationResult; validateConfig(value: unknown): ValidationResult }
}
