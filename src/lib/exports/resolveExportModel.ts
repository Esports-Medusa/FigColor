import { validatePreviewCaseAgainstRegistry } from '@/lib/chart-types/registry'
import { resolveNamedColorRoles, resolveOrderedColorReferences } from '@/lib/palette/resolveColors'
import type { CanonicalPalette, PaletteColor, PalettePreviewCase, PaletteColorReference } from '@/types/palette'
import type { ExportColor, PaletteExportModel } from './types'

interface BarErrorGroupRole {
  key: string
  label: string
  fill: PaletteColorReference
}

interface BarErrorColorRoles {
  groups: BarErrorGroupRole[]
}

export function resolvePaletteExportModel(palette: CanonicalPalette): PaletteExportModel {
  const primaryCase = palette.primary_preview_case
  const fallback = (warnings: string[] = []) => createPaletteOrderFallback(palette.colors, warnings)

  if (!primaryCase) {
    return fallback(['No primary preview case is available.'])
  }

  if (primaryCase.status !== 'published') {
    return fallback(['Primary preview case is not published.'])
  }

  if (!primaryCase.is_primary) {
    return fallback(['Preview case is not marked primary.'])
  }

  return resolvePreviewCaseExportModel(palette, primaryCase, fallback)
}

export function resolveExplicitPreviewCaseExportModel(
  palette: CanonicalPalette,
  previewCase: PalettePreviewCase
): PaletteExportModel {
  return resolvePreviewCaseExportModel(palette, previewCase)
}

function resolvePreviewCaseExportModel(
  palette: CanonicalPalette,
  previewCase: PalettePreviewCase,
  fallback: (warnings?: string[]) => PaletteExportModel = (warnings: string[] = []) => createPaletteOrderFallback(palette.colors, warnings)
): PaletteExportModel {
  const registryResult = validatePreviewCaseAgainstRegistry(previewCase)
  if (!registryResult.valid) {
    return fallback(registryResult.issues.map((issue) => issue.message))
  }

  if (!isBarErrorTemplate(previewCase)) {
    return resolveGenericPreviewExportModel(palette, previewCase) ??
      fallback(['Preview case does not expose exportable palette color roles.'])
  }

  const roles = previewCase.color_roles as BarErrorColorRoles
  if (hasDuplicateRoleKeys(roles.groups)) {
    return fallback(['Preview case contains duplicate group role keys.'])
  }

  const resolved = resolveNamedColorRoles(
    palette,
    roles.groups.map((group) => ({
      key: group.key,
      label: group.label,
      color: group.fill
    })),
    { allowDuplicateColorIds: true, path: 'color_roles.groups' }
  )

  if (!resolved.ok) {
    return fallback(resolved.errors.map((error) => error.message))
  }

  const colors = resolved.colors.map((color, index): ExportColor => ({
    key: color.key ?? `color_${index + 1}`,
    label: color.label ?? color.key ?? `Color ${index + 1}`,
    colorId: color.color_id,
    hex: color.hex,
    rgb: color.rgb,
    order: index
  }))

  return {
    source: 'bar_error_roles',
    colors,
    namedColors: Object.fromEntries(colors.map((color) => [color.key, color.hex])),
    warnings: []
  }
}

function resolveGenericPreviewExportModel(
  palette: CanonicalPalette,
  previewCase: PalettePreviewCase
): PaletteExportModel | null {
  const roles = extractExportablePaletteRoles(previewCase)
  if (roles.length === 0) {
    return null
  }

  if (roles.every((role) => role.key && role.label)) {
    const resolved = resolveNamedColorRoles(
      palette,
      roles.map((role) => ({
        key: role.key,
        label: role.label,
        color: role.color
      })),
      { allowDuplicateColorIds: true, path: 'color_roles' }
    )

    if (!resolved.ok) {
      return createPaletteOrderFallback(palette.colors, resolved.errors.map((error) => error.message))
    }

    const colors = resolved.colors.map((color, index): ExportColor => ({
      key: color.key ?? roles[index].key,
      label: color.label ?? roles[index].label,
      colorId: color.color_id,
      hex: color.hex,
      rgb: color.rgb,
      order: index
    }))

    return {
      source: 'preview_case_roles',
      colors,
      namedColors: Object.fromEntries(colors.map((color) => [color.key, color.hex])),
      warnings: []
    }
  }

  const resolved = resolveOrderedColorReferences(
    palette,
    roles.map((role) => role.color),
    { allowDuplicates: true, path: 'color_roles' }
  )

  if (!resolved.ok) {
    return createPaletteOrderFallback(palette.colors, resolved.errors.map((error) => error.message))
  }

  const colors = resolved.colors.map((color, index): ExportColor => ({
    key: roles[index].key,
    label: roles[index].label,
    colorId: color.color_id,
    hex: color.hex,
    rgb: color.rgb,
    order: index
  }))

  return {
    source: 'preview_case_roles',
    colors,
    namedColors: Object.fromEntries(colors.map((color) => [color.key, color.hex])),
    warnings: []
  }
}

function isBarErrorTemplate(previewCase: PalettePreviewCase): boolean {
  return previewCase.chart_type === 'bar_error' &&
    previewCase.template_id === 'bar_error_v1'
}

function hasDuplicateRoleKeys(groups: readonly BarErrorGroupRole[]): boolean {
  const seen = new Set<string>()
  return groups.some((group) => {
    if (seen.has(group.key)) {
      return true
    }
    seen.add(group.key)
    return false
  })
}

function createPaletteOrderFallback(
  colors: readonly PaletteColor[],
  warnings: string[]
): PaletteExportModel {
  const exportColors = colors.map((color, index): ExportColor => ({
    key: `color_${index + 1}`,
    label: color.label?.trim() || `Color ${index + 1}`,
    colorId: color.id,
    hex: color.hex,
    rgb: color.rgb,
    order: index
  }))

  return {
    source: 'palette_order_fallback',
    colors: exportColors,
    namedColors: Object.fromEntries(exportColors.map((color) => [color.key, color.hex])),
    warnings
  }
}

interface ExportablePaletteRole {
  key: string
  label: string
  color: PaletteColorReference
}

function extractExportablePaletteRoles(previewCase: PalettePreviewCase): ExportablePaletteRole[] {
  const roles = previewCase.color_roles
  if (!isRecord(roles)) {
    return []
  }

  if (previewCase.chart_type === 'boxplot_jitter' && Array.isArray(roles.groups)) {
    return roles.groups.flatMap((role, index) => namedRoleFrom(role, 'color', `group_${index + 1}`, `Group ${index + 1}`))
  }

  if (previewCase.chart_type === 'scatter_grouped' && Array.isArray(roles.groups)) {
    return roles.groups.flatMap((role, index) => namedRoleFrom(role, 'color', `group_${index + 1}`, `Group ${index + 1}`))
  }

  if (previewCase.chart_type === 'violin_distribution' && Array.isArray(roles.groups)) {
    return roles.groups.flatMap((role, index) => namedRoleFrom(role, 'fill', `distribution_${index + 1}`, `Distribution ${index + 1}`))
  }

  if (previewCase.chart_type === 'line_multiseries' && Array.isArray(roles.series)) {
    return roles.series.flatMap((role, index) => namedRoleFrom(role, 'line', `series_${index + 1}`, `Series ${index + 1}`))
  }

  if (previewCase.chart_type === 'heatmap_annotated') {
    const scale = isRecord(roles.scale) && Array.isArray(roles.scale.stops)
      ? roles.scale.stops.flatMap((role, index) => scaleStopRoleFrom(role, index))
      : []
    const annotations = Array.isArray(roles.annotations)
      ? roles.annotations.flatMap((role, index) => namedRoleFrom(role, 'color', `annotation_${index + 1}`, `Annotation ${index + 1}`))
      : []
    return [...scale, ...annotations]
  }

  return []
}

function namedRoleFrom(
  value: unknown,
  colorKey: string,
  fallbackKey: string,
  fallbackLabel: string
): ExportablePaletteRole[] {
  if (!isRecord(value) || !isPaletteColorReference(value[colorKey])) {
    return []
  }
  return [{
    key: typeof value.key === 'string' && value.key.trim() ? value.key : fallbackKey,
    label: typeof value.label === 'string' && value.label.trim() ? value.label : fallbackLabel,
    color: value[colorKey]
  }]
}

function scaleStopRoleFrom(value: unknown, index: number): ExportablePaletteRole[] {
  if (!isRecord(value) || !isPaletteColorReference(value.color)) {
    return []
  }
  const position = typeof value.position === 'number' && Number.isFinite(value.position)
    ? value.position
    : index
  const percent = Math.round(position * 100)
  return [{
    key: `scale_${percent}`,
    label: typeof value.label === 'string' && value.label.trim() ? value.label : `Scale ${percent}%`,
    color: value.color
  }]
}

function isPaletteColorReference(value: unknown): value is PaletteColorReference {
  return isRecord(value) &&
    value.source === 'palette' &&
    typeof value.color_id === 'string' &&
    value.color_id.trim() !== ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
