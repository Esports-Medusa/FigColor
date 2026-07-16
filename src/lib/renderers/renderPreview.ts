import { validatePreviewCaseAgainstRegistry } from '@/lib/chart-types/registry'
import { previewSeedInputFromCase, resolvePreviewSeed } from '@/lib/deterministic/seed'
import { resolveRoleColorReferences, type ThemeTokens } from '@/lib/palette/resolveColors'
import type { CanonicalPalette, PalettePreviewCase, ValidationIssue } from '@/types/palette'
import { barErrorRenderer } from './bar-error/renderer'
import { boxplotJitterRenderer } from './boxplot-jitter/renderer'
import { heatmapAnnotatedRenderer } from './heatmap-annotated/renderer'
import { lineMultiseriesRenderer } from './line-multiseries/renderer'
import { getPreviewRenderer, registerPreviewRenderers } from './registry'
import type { ChartRenderer, PreviewRenderResult } from './types'

export const PREVIEW_RENDERERS: readonly ChartRenderer[] = registerPreviewRenderers([
  barErrorRenderer,
  boxplotJitterRenderer,
  lineMultiseriesRenderer,
  heatmapAnnotatedRenderer
])

export interface RenderPalettePreviewOptions {
  themeTokens?: ThemeTokens
  renderers?: readonly ChartRenderer[]
}

export function renderPalettePreview(
  palette: CanonicalPalette,
  previewCase: PalettePreviewCase,
  options: RenderPalettePreviewOptions = {}
): PreviewRenderResult {
  try {
    const validation = validatePreviewCaseAgainstRegistry(previewCase)
    if (!validation.valid) {
      return invalidResult(
        'PREVIEW_CASE_INVALID',
        'Preview case failed chart-template validation.',
        validation.issues
      )
    }

    const seedResult = resolveSeed(previewCase)
    if (!seedResult.ok) {
      return seedResult.result
    }

    const colorResult = resolveRoleColorReferences(
      previewCase.color_roles,
      palette.colors,
      options.themeTokens
    )
    if (!colorResult.ok) {
      return invalidResult(
        'COLOR_RESOLUTION_FAILED',
        'Preview color roles could not be resolved.',
        colorResult.errors
      )
    }

    const renderer = getPreviewRenderer(options.renderers ?? PREVIEW_RENDERERS, {
      chartType: previewCase.chart_type,
      templateId: previewCase.template_id,
      templateVersion: previewCase.template_version,
      schemaVersion: previewCase.schema_version
    })
    if (!renderer) {
      return {
        ok: false,
        kind: 'unsupported',
        code: 'PREVIEW_RENDERER_NOT_FOUND',
        message: `No preview renderer registered for ${previewCase.chart_type}/${previewCase.template_id}@${previewCase.template_version}/${previewCase.schema_version}.`
      }
    }

    return renderer.render({
      paletteId: palette.id,
      previewCaseId: previewCase.id,
      chartType: previewCase.chart_type,
      templateId: previewCase.template_id,
      templateVersion: previewCase.template_version,
      schemaVersion: previewCase.schema_version,
      colorRoles: colorResult.value,
      previewConfig: previewCase.preview_config,
      seed: seedResult.seed,
      resolvedColors: colorResult.colors
    })
  } catch (error) {
    return {
      ok: false,
      kind: 'error',
      code: 'PREVIEW_RENDER_FAILED',
      message: error instanceof Error ? error.message : 'Unexpected preview render failure.'
    }
  }
}

function resolveSeed(previewCase: PalettePreviewCase):
  | { ok: true; seed: number }
  | { ok: false; result: PreviewRenderResult } {
  try {
    return {
      ok: true,
      seed: resolvePreviewSeed(previewSeedInputFromCase(previewCase))
    }
  } catch (error) {
    return {
      ok: false,
      result: invalidResult(
        'INVALID_PREVIEW_SEED',
        error instanceof Error ? error.message : 'Preview seed could not be resolved.',
        [{
          path: 'seed_value',
          code: 'INVALID_PREVIEW_SEED',
          message: 'Fixed preview seed strategy requires an integer seed_value.'
        }]
      )
    }
  }
}

function invalidResult(
  code: string,
  message: string,
  issues: ValidationIssue[]
): PreviewRenderResult {
  return {
    ok: false,
    kind: 'invalid',
    code,
    message,
    issues
  }
}
