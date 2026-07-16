import { validatePreviewCaseAgainstRegistry } from '@/lib/chart-types/registry'
import { resolveNamedColorRoles } from '@/lib/palette/resolveColors'
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

  if (!isEligibleBarErrorPrimary(primaryCase)) {
    return fallback(['Primary preview case is not a published bar_error_v1 preview.'])
  }

  const registryResult = validatePreviewCaseAgainstRegistry(primaryCase)
  if (!registryResult.valid) {
    return fallback(registryResult.issues.map((issue) => issue.message))
  }

  const roles = primaryCase.color_roles as BarErrorColorRoles
  if (hasDuplicateRoleKeys(roles.groups)) {
    return fallback(['Primary preview case contains duplicate group role keys.'])
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

function isEligibleBarErrorPrimary(previewCase: PalettePreviewCase): boolean {
  return previewCase.status === 'published' &&
    previewCase.chart_type === 'bar_error' &&
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
