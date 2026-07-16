import type { ExportIdentifierTarget } from './types'

const pythonReservedWords = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break',
  'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally',
  'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal',
  'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield'
])

const rReservedWords = new Set([
  'if', 'else', 'repeat', 'while', 'function', 'for', 'in', 'next', 'break',
  'TRUE', 'FALSE', 'NULL', 'Inf', 'NaN', 'NA', 'NA_integer_', 'NA_real_',
  'NA_complex_', 'NA_character_'
])

export function sanitizeExportIdentifier(
  value: string,
  target: ExportIdentifierTarget
): string {
  if (target === 'css') {
    return sanitizeCssIdentifier(value)
  }
  return sanitizeCodeIdentifier(value, target)
}

export function sanitizeExportIdentifiers(
  values: readonly string[],
  target: ExportIdentifierTarget
): string[] {
  const counts = new Map<string, number>()
  return values.map((value) => {
    const base = sanitizeExportIdentifier(value, target)
    const count = (counts.get(base) ?? 0) + 1
    counts.set(base, count)
    return count === 1 ? base : `${base}_${count}`
  })
}

function sanitizeCodeIdentifier(value: string, target: 'python' | 'r'): string {
  const fallback = target === 'python' ? 'color' : 'color'
  let sanitized = value
    .trim()
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')

  if (!sanitized) {
    sanitized = fallback
  }

  if (/^[0-9]/.test(sanitized)) {
    sanitized = `color_${sanitized}`
  }

  const reservedWords = target === 'python' ? pythonReservedWords : rReservedWords
  if (reservedWords.has(sanitized)) {
    sanitized = `${sanitized}_color`
  }

  return sanitized
}

function sanitizeCssIdentifier(value: string): string {
  let sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (!sanitized) {
    sanitized = 'color'
  }

  if (/^[0-9]/.test(sanitized)) {
    sanitized = `color-${sanitized}`
  }

  return sanitized
}
