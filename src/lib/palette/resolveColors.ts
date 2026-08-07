import type {
  CanonicalPalette,
  NamedColorRole,
  PaletteColor,
  PaletteColorReference,
  ThemeColorReference
} from './schema'
import {
  isPaletteColorReference,
  isThemeColorReference,
  isVisualColorReference,
  findDuplicateColorReferences,
  validateColorReference,
  type ColorReferenceError
} from './colorReferences'

export interface ResolvedColor {
  key?: string
  label?: string
  color_id: string
  hex: string
  rgb: [number, number, number]
  order: number
  palette_color: PaletteColor
}

export type ResolveColorsResult =
  | {
      ok: true
      colors: ResolvedColor[]
    }
  | {
      ok: false
      errors: ColorResolutionError[]
    }

export interface ColorResolutionError extends ColorReferenceError {
  role_key?: string
}

export type ThemeTokens = Record<ThemeColorReference['token'], string>

export type ResolveColorReferenceResult =
  | {
      ok: true
      hex: string
    }
  | {
      ok: false
      errors: ColorResolutionError[]
    }

export type ResolveRoleColorsResult =
  | {
      ok: true
      value: unknown
      colors: Record<string, string>
    }
  | {
      ok: false
      errors: ColorResolutionError[]
    }

export const DEFAULT_THEME_TOKENS: ThemeTokens = {
  foreground: '#111827',
  muted_foreground: '#6B7280',
  grid: '#D1D5DB',
  background: '#FFFFFF'
}

export function resolveColorReference(
  reference: unknown,
  paletteColors: readonly PaletteColor[],
  themeTokens: ThemeTokens = DEFAULT_THEME_TOKENS,
  path = 'color'
): ResolveColorReferenceResult {
  if (isPaletteColorReference(reference)) {
    if (!isValidOpacity(reference.opacity)) {
      return {
        ok: false,
        errors: [{
          path: `${path}.opacity`,
          code: 'INVALID_OPACITY',
          message: 'Opacity must be between 0 and 1.',
          color_id: reference.color_id
        }]
      }
    }

    const color = paletteColors.find((candidate) => candidate.id === reference.color_id)
    return color
      ? { ok: true, hex: color.hex }
      : {
          ok: false,
          errors: [{
            path: `${path}.color_id`,
            code: 'COLOR_NOT_FOUND',
            message: `Referenced palette color does not exist: ${reference.color_id}.`,
            color_id: reference.color_id
          }]
        }
  }

  if (isThemeColorReference(reference)) {
    if (!isValidOpacity(reference.opacity)) {
      return {
        ok: false,
        errors: [{
          path: `${path}.opacity`,
          code: 'INVALID_OPACITY',
          message: 'Opacity must be between 0 and 1.'
        }]
      }
    }

    const hex = themeTokens[reference.token]
    return hex
      ? { ok: true, hex }
      : {
          ok: false,
          errors: [{
            path: `${path}.token`,
            code: 'INVALID_THEME_TOKEN',
            message: `Theme color token is not supported: ${reference.token}.`
          }]
        }
  }

  if (isRecord(reference) && typeof reference.source === 'string') {
    return {
      ok: false,
      errors: [{
        path: `${path}.source`,
        code: reference.source === 'theme' ? 'INVALID_THEME_TOKEN' : 'UNKNOWN_COLOR_SOURCE',
        message: `Unsupported color reference source: ${reference.source}.`
      }]
    }
  }

  return {
    ok: false,
    errors: [{
      path,
      code: 'INVALID_COLOR_REFERENCE',
      message: 'Expected a palette or theme color reference.'
    }]
  }
}

export function resolveRoleColorReferences(
  value: unknown,
  paletteColors: readonly PaletteColor[],
  themeTokens: ThemeTokens = DEFAULT_THEME_TOKENS,
  path = 'color_roles'
): ResolveRoleColorsResult {
  const errors: ColorResolutionError[] = []
  const colors: Record<string, string> = {}

  const resolvedValue = visitRoleValue(value, path, paletteColors, themeTokens, errors, colors)
  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, value: resolvedValue, colors }
}

export function resolveOrderedColorReferences(
  palette: CanonicalPalette,
  references: PaletteColorReference[],
  options: { allowDuplicates?: boolean; path?: string } = {}
): ResolveColorsResult {
  const path = options.path ?? 'colors'
  const errors: ColorResolutionError[] = []

  references.forEach((reference, index) => {
    errors.push(...validateColorReference(palette, reference, `${path}[${index}]`))
  })

  if (!options.allowDuplicates) {
    errors.push(...findDuplicateColorReferences(references, path))
  }

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  return {
    ok: true,
    colors: references.map((reference) => {
      const color = palette.colors.find((candidate) => candidate.id === reference.color_id)
      if (!color) {
        throw new Error(`Unreachable missing color after validation: ${reference.color_id}`)
      }
      return toResolvedColor(reference.color_id, color)
    })
  }
}

export function resolveNamedColorRoles(
  palette: CanonicalPalette,
  roles: NamedColorRole[],
  options: { allowDuplicateColorIds?: boolean; path?: string } = {}
): ResolveColorsResult {
  const path = options.path ?? 'roles'
  const references = roles.map((role) => role.color)
  const errors: ColorResolutionError[] = []
  const seenRoleKeys = new Set<string>()

  roles.forEach((role, index) => {
    if (seenRoleKeys.has(role.key)) {
      errors.push({
        path: `${path}[${index}].key`,
        code: 'DUPLICATE_ROLE_KEY',
        message: `Duplicate role key: ${role.key}.`,
        role_key: role.key
      })
    }
    seenRoleKeys.add(role.key)
    errors.push(...validateColorReference(palette, role.color, `${path}[${index}].color`).map((error) => ({
      ...error,
      role_key: role.key
    })))
  })

  if (!options.allowDuplicateColorIds) {
    errors.push(...findDuplicateColorReferences(references, path).map((error) => ({
      ...error,
      role_key: roles[extractIndex(error.path)]?.key
    })))
  }

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  return {
    ok: true,
    colors: roles.map((role) => {
      const color = palette.colors.find((candidate) => candidate.id === role.color.color_id)
      if (!color) {
        throw new Error(`Unreachable missing color after validation: ${role.color.color_id}`)
      }
      return toResolvedColor(role.color.color_id, color, role.key, role.label)
    })
  }
}

function toResolvedColor(
  colorId: string,
  color: PaletteColor,
  key?: string,
  label?: string
): ResolvedColor {
  return {
    key,
    label,
    color_id: colorId,
    hex: color.hex,
    rgb: color.rgb,
    order: color.order,
    palette_color: color
  }
}

function extractIndex(path: string): number {
  const match = path.match(/\[(\d+)\]/)
  return match ? Number(match[1]) : -1
}

function visitRoleValue(
  value: unknown,
  path: string,
  paletteColors: readonly PaletteColor[],
  themeTokens: ThemeTokens,
  errors: ColorResolutionError[],
  colors: Record<string, string>
): unknown {
  if (isVisualColorReference(value)) {
    const result = resolveColorReference(value, paletteColors, themeTokens, path)
    if (!result.ok) {
      errors.push(...result.errors)
      return value
    }
    colors[path] = result.hex
    return {
      ...value,
      resolved_hex: result.hex
    }
  }

  if (Array.isArray(value)) {
    return value.map((item, index) =>
      visitRoleValue(item, `${path}[${index}]`, paletteColors, themeTokens, errors, colors)
    )
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        visitRoleValue(child, `${path}.${key}`, paletteColors, themeTokens, errors, colors)
      ])
    )
  }

  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isValidOpacity(value: unknown): boolean {
  return value === undefined ||
    (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1)
}
