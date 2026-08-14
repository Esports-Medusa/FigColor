import type {
  CanonicalPalette,
  PaletteColor,
  PaletteColorReference,
  ThemeColorReference
} from '@/types/palette'

export interface BarErrorGroupRole {
  key: string
  label: string
  fill: PaletteColorReference
}

export interface BarErrorColorRoles {
  groups: BarErrorGroupRole[]
  elements: {
    axis: ThemeColorReference
    grid: ThemeColorReference
    text: ThemeColorReference
    error_bar: ThemeColorReference
    background: ThemeColorReference
  }
}

export interface BarErrorPreviewConfig {
  orientation: 'vertical' | 'horizontal'
  sample_size: number
  error_type: 'sd' | 'sem' | 'ci'
  data_pattern: 'treatment_higher' | 'treatment_lower' | 'dose_response' | 'mixed'
}

export interface BarErrorDraftSuggestion {
  chart_type: 'bar_error'
  template_id: 'bar_error_v1'
  template_version: 1
  schema_version: 1
  color_roles: BarErrorColorRoles
  preview_config: BarErrorPreviewConfig
  seed_strategy: 'stable_id'
  seed_value: null
}

export type BarErrorDraftSuggestionResult =
  | { ok: true; value: BarErrorDraftSuggestion }
  | {
      ok: false
      code: 'INSUFFICIENT_COLORS'
      message: string
      minimum: 3
      available: number
    }

const MIN_GROUPS = 3
const MAX_GROUPS = 10

export function suggestBarErrorPreviewDraft(
  palette: CanonicalPalette
): BarErrorDraftSuggestionResult {
  const usableColors = palette.colors
    .filter(isUsablePaletteColor)
    .sort((a, b) => a.order - b.order)

  if (usableColors.length < MIN_GROUPS) {
    return {
      ok: false,
      code: 'INSUFFICIENT_COLORS',
      message: 'bar_error_v1 needs at least 3 palette colors for group roles.',
      minimum: MIN_GROUPS,
      available: usableColors.length
    }
  }

  return {
    ok: true,
    value: {
      chart_type: 'bar_error',
      template_id: 'bar_error_v1',
      template_version: 1,
      schema_version: 1,
      color_roles: {
        groups: usableColors.slice(0, MAX_GROUPS).map((color, index) => ({
          key: `group_${index + 1}`,
          label: `Group ${index + 1}`,
          fill: { source: 'palette', color_id: color.id }
        })),
        elements: {
          axis: { source: 'theme', token: 'foreground' },
          grid: { source: 'theme', token: 'grid' },
          text: { source: 'theme', token: 'muted_foreground' },
          error_bar: { source: 'theme', token: 'foreground' },
          background: { source: 'theme', token: 'background' }
        }
      },
      preview_config: {
        orientation: 'vertical',
        sample_size: 24,
        error_type: 'sem',
        data_pattern: 'mixed'
      },
      seed_strategy: 'stable_id',
      seed_value: null
    }
  }
}

function isUsablePaletteColor(color: PaletteColor): boolean {
  return typeof color.id === 'string' &&
    color.id.trim() !== '' &&
    typeof color.hex === 'string' &&
    color.hex.trim() !== ''
}
