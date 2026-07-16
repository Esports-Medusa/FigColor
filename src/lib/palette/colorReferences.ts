import type {
  CanonicalPalette,
  PaletteColor,
  PaletteColorReference,
  ThemeColorReference,
  ValidationIssue,
  VisualColorReference
} from './schema'

export type ColorReferenceErrorCode =
  | 'INVALID_COLOR_REFERENCE'
  | 'UNKNOWN_COLOR_SOURCE'
  | 'INVALID_THEME_TOKEN'
  | 'COLOR_NOT_FOUND'
  | 'DUPLICATE_COLOR_REFERENCE'
  | 'DUPLICATE_ROLE_KEY'
  | 'INVALID_OPACITY'

export interface ColorReferenceError extends ValidationIssue {
  code: ColorReferenceErrorCode
  color_id?: string
}

export const THEME_COLOR_TOKENS = [
  'foreground',
  'muted_foreground',
  'grid',
  'background'
] as const

export function isPaletteColorReference(value: unknown): value is PaletteColorReference {
  return isRecord(value) &&
    value.source === 'palette' &&
    typeof value.color_id === 'string' &&
    value.color_id.length > 0
}

export function isThemeColorReference(value: unknown): value is ThemeColorReference {
  return isRecord(value) &&
    value.source === 'theme' &&
    typeof value.token === 'string' &&
    THEME_COLOR_TOKENS.includes(value.token as ThemeColorReference['token'])
}

export function isVisualColorReference(value: unknown): value is VisualColorReference {
  return isPaletteColorReference(value) || isThemeColorReference(value)
}

export function resolvePaletteColorReference(
  palette: CanonicalPalette,
  reference: PaletteColorReference
): PaletteColor | undefined {
  return palette.colors.find((color) => color.id === reference.color_id)
}

export function validateColorReference(
  palette: CanonicalPalette,
  reference: unknown,
  path = 'color'
): ColorReferenceError[] {
  const errors: ColorReferenceError[] = []

  if (!isPaletteColorReference(reference)) {
    errors.push({
      path,
      code: 'INVALID_COLOR_REFERENCE',
      message: 'Expected a palette color reference with source "palette" and color_id.'
    })
    return errors
  }

  if (reference.opacity !== undefined && (reference.opacity < 0 || reference.opacity > 1)) {
    errors.push({
      path: `${path}.opacity`,
      code: 'INVALID_OPACITY',
      message: 'Opacity must be between 0 and 1.',
      color_id: reference.color_id
    })
  }

  if (!resolvePaletteColorReference(palette, reference)) {
    errors.push({
      path: `${path}.color_id`,
      code: 'COLOR_NOT_FOUND',
      message: `Referenced palette color does not exist: ${reference.color_id}.`,
      color_id: reference.color_id
    })
  }

  return errors
}

export function validateVisualColorReference(
  palette: CanonicalPalette,
  reference: unknown,
  path = 'color'
): ColorReferenceError[] {
  if (isThemeColorReference(reference)) {
    return reference.opacity !== undefined && (reference.opacity < 0 || reference.opacity > 1)
      ? [{
          path: `${path}.opacity`,
          code: 'INVALID_OPACITY',
          message: 'Opacity must be between 0 and 1.'
        }]
      : []
  }

  if (isRecord(reference) && reference.source === 'theme') {
    return [{
      path: `${path}.token`,
      code: 'INVALID_THEME_TOKEN',
      message: 'Theme color token is not supported.'
    }]
  }

  return validateColorReference(palette, reference, path)
}

export function findMissingColorReferences(
  palette: CanonicalPalette,
  references: PaletteColorReference[],
  path = 'colors'
): ColorReferenceError[] {
  return references.flatMap((reference, index) =>
    resolvePaletteColorReference(palette, reference)
      ? []
      : [{
          path: `${path}[${index}].color_id`,
          code: 'COLOR_NOT_FOUND' as const,
          message: `Referenced palette color does not exist: ${reference.color_id}.`,
          color_id: reference.color_id
        }]
  )
}

export function findDuplicateColorReferences(
  references: PaletteColorReference[],
  path = 'colors'
): ColorReferenceError[] {
  const seen = new Set<string>()
  const errors: ColorReferenceError[] = []

  references.forEach((reference, index) => {
    if (seen.has(reference.color_id)) {
      errors.push({
        path: `${path}[${index}].color_id`,
        code: 'DUPLICATE_COLOR_REFERENCE',
        message: `Duplicate palette color reference: ${reference.color_id}.`,
        color_id: reference.color_id
      })
    }
    seen.add(reference.color_id)
  })

  return errors
}

export function isLegacyCompatibilityColorId(colorId: string): boolean {
  return /^legacy-color-\d+$/.test(colorId)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
