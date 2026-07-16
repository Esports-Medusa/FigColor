import { renderPalettePreview } from '@/lib/renderers'
import type { PreviewRenderResult } from '@/lib/renderers'
import type { CanonicalPalette, PalettePreviewCase } from '@/types/palette'

export type PaletteChartPreviewState = 'svg' | 'no-preview' | 'invalid' | 'unsupported' | 'error'

export interface PaletteChartPreviewModel {
  state: PaletteChartPreviewState
  svgMarkup: string
  fallbackColors: string[]
  accessibleLabel: string | null
}

export function selectPalettePreviewCase(
  palette: CanonicalPalette,
  previewCase: PalettePreviewCase | null | undefined,
  hasPreviewCaseOverride: boolean
): PalettePreviewCase | null {
  return hasPreviewCaseOverride ? previewCase ?? null : palette.primary_preview_case
}

export function createPaletteChartPreviewModel(
  palette: CanonicalPalette,
  selectedPreviewCase: PalettePreviewCase | null,
  render: typeof renderPalettePreview = renderPalettePreview
): PaletteChartPreviewModel {
  const fallbackColors = palette.colors.map((color) => color.hex).filter(Boolean)
  const normalizedFallbackColors = fallbackColors.length > 0
    ? fallbackColors
    : ['#d1d5db', '#e5e7eb', '#f3f4f6']

  if (!selectedPreviewCase) {
    return {
      state: 'no-preview',
      svgMarkup: '',
      fallbackColors: normalizedFallbackColors,
      accessibleLabel: 'Colour palette preview'
    }
  }

  const result = render(palette, selectedPreviewCase)
  if (isSuccessfulSvgResult(result)) {
    return {
      state: 'svg',
      svgMarkup: result.markup,
      fallbackColors: normalizedFallbackColors,
      accessibleLabel: null
    }
  }

  return {
    state: result.kind,
    svgMarkup: '',
    fallbackColors: normalizedFallbackColors,
    accessibleLabel: 'Scientific chart preview unavailable'
  }
}

function isSuccessfulSvgResult(
  result: PreviewRenderResult
): result is Extract<PreviewRenderResult, { ok: true; kind: 'svg' }> {
  return result.ok && result.kind === 'svg'
}
