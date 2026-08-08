import type { ValidationIssue } from '@/types/palette'
import {
  invalidResult,
  registryIssue,
  validResult,
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
