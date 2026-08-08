import { normalizePaletteToCanonical } from '@/lib/palette'
import type { CanonicalPalette } from '@/types/palette'
import type { ProjectPalette } from '@/types/project'

export function resolveProjectPalettePreview(palette: ProjectPalette): CanonicalPalette | null {
  if (palette.basePaletteId && palette.previewPalette?.id === palette.basePaletteId) {
    try {
      return normalizePaletteToCanonical(palette.previewPalette)
    } catch {
      // An incomplete canonical payload must not crash the project page.
    }
  }

  if (!palette.roles.length) return null
  return {
    id: palette.basePaletteId || palette.id,
    slug: `project-${palette.id}`,
    name: palette.name,
    status: 'draft',
    colors: palette.roles.map((role, index) => ({
      id: role.key || role.id,
      hex: role.color,
      rgb: [0, 0, 0],
      label: role.label,
      order: index
    })),
    color_count: palette.roles.length,
    type: 'categorical',
    chart_types: [],
    journal_style: [],
    disciplines: [],
    use_cases: [],
    avoid_cases: [],
    tags: [],
    accessibility: { colorblind_safe: false, print_friendly: false, dark_background: false },
    source_type: 'manual',
    created_at: palette.createdAt,
    updated_at: palette.updatedAt,
    primary_preview_case: null,
    preview_cases: []
  }
}
