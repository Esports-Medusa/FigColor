import { renderPalettePreview } from '@/lib/renderers'
import { renderGenericPalettePreview } from '@/lib/palette/genericPreview'
import type { PreviewRenderResult } from '@/lib/renderers'
import type { CanonicalPalette, PalettePreviewCase } from '@/types/palette'

export type PaletteChartPreviewState = 'svg' | 'generic' | 'strip' | 'placeholder' | 'invalid' | 'unsupported' | 'error'

export interface PaletteChartPreviewModel {
  state: PaletteChartPreviewState
  svgMarkup: string
  fallbackColors: string[]
  accessibleLabel: string | null
}

export function selectPalettePreviewCase(
  palette: CanonicalPalette,
  previewCase: PalettePreviewCase | null | undefined,
  hasPreviewCaseOverride: boolean,
  publicOnly = true
): PalettePreviewCase | null {
  const candidate = hasPreviewCaseOverride ? previewCase ?? null : palette.primary_preview_case
  return publicOnly
    ? isPublicPrimaryPreviewCase(candidate) ? candidate : null
    : candidate ?? null
}

export function createPaletteChartPreviewModel(
  palette: CanonicalPalette,
  selectedPreviewCase: PalettePreviewCase | null,
  render: typeof renderPalettePreview = renderPalettePreview
): PaletteChartPreviewModel {
  const fallbackColors = palette.colors.map((color) => color.hex).filter(Boolean)
  const hasUsableColors = fallbackColors.length > 0

  if (!selectedPreviewCase) {
    return createPublicFallbackModel(palette, fallbackColors)
  }

  const result = render(palette, selectedPreviewCase)
  if (isSuccessfulSvgResult(result)) {
    return {
      state: 'svg',
      svgMarkup: result.markup,
      fallbackColors,
      accessibleLabel: null
    }
  }

  if (hasUsableColors) {
    const fallback = createPublicFallbackModel(palette, fallbackColors)
    return {
      ...fallback,
      state: result.kind
    }
  }

  return {
    state: 'placeholder',
    svgMarkup: '',
    fallbackColors: [],
    accessibleLabel: 'Palette preview unavailable'
  }
}

function isSuccessfulSvgResult(
  result: PreviewRenderResult
): result is Extract<PreviewRenderResult, { ok: true; kind: 'svg' }> {
  return result.ok && result.kind === 'svg'
}

function isPublicPrimaryPreviewCase(previewCase: PalettePreviewCase | null | undefined): previewCase is PalettePreviewCase {
  return previewCase?.status === 'published' && previewCase.is_primary === true
}

function createPublicFallbackModel(
  palette: CanonicalPalette,
  colors: string[]
): PaletteChartPreviewModel {
  if (colors.length === 0) {
    return {
      state: 'placeholder',
      svgMarkup: '',
      fallbackColors: [],
      accessibleLabel: 'Palette preview unavailable'
    }
  }

  const genericMarkup = renderGenericPalettePreview(palette, colors)
  if (genericMarkup) {
    return {
      state: 'generic',
      svgMarkup: genericMarkup,
      fallbackColors: colors,
      accessibleLabel: null
    }
  }

  return {
    state: 'strip',
    svgMarkup: '',
    fallbackColors: colors,
    accessibleLabel: 'Colour palette preview'
  }
}
