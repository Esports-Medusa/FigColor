import { renderPalettePreview } from '@/lib/renderers'
import type { PreviewRenderResult } from '@/lib/renderers'
import type { CanonicalPalette, PalettePreviewCase } from '@/types/palette'
import type { DraftPreviewCase } from '@/api/paletteAssistant'
import type { EditableAssistantDraft } from './workbench'
import { validateDraftPreviewCase } from './draftPreview'

export const DRAFT_RENDER_PALETTE_KEY = 'draft-render:palette'
export const DRAFT_RENDER_PREVIEW_KEY = 'draft-render:preview'

export interface DraftPreviewRenderModel {
  state: 'svg' | 'invalid' | 'unsupported' | 'error'
  markup: string
  message: string
  issues: Array<{ path: string; code: string; message: string }>
}

export function renderDraftPreview(
  draft: EditableAssistantDraft,
  previewCase: DraftPreviewCase,
  render: typeof renderPalettePreview = renderPalettePreview
): DraftPreviewRenderModel {
  const issues = validateDraftPreviewCase(previewCase, draft.colors)
  if (issues.length > 0) return { state: 'invalid', markup: '', message: 'Draft Preview validation failed.', issues }
  const result = render(toRenderPalette(draft), toRenderPreviewCase(previewCase))
  return modelFromResult(result)
}

export function toRenderPalette(draft: EditableAssistantDraft): CanonicalPalette {
  const colors = draft.colors.map((color, index) => ({
    id: color.id,
    hex: color.hex,
    rgb: hexToRgb(color.hex),
    label: color.label,
    order: index
  }))
  return {
    id: DRAFT_RENDER_PALETTE_KEY, slug: DRAFT_RENDER_PALETTE_KEY, name: draft.name,
    status: 'draft', colors, color_count: colors.length, type: draft.type as CanonicalPalette['type'],
    chart_types: [], chart_applicability: [], journal_style: [], disciplines: [...draft.disciplines],
    use_cases: [...draft.use_cases], avoid_cases: [...draft.avoid_cases], tags: [...draft.tags],
    accessibility: { ...draft.accessibility }, source_type: 'figure_extracted', source_note: draft.source_note,
    created_at: '', updated_at: '', primary_preview_case: null, preview_cases: []
  }
}

export function toRenderPreviewCase(previewCase: DraftPreviewCase): PalettePreviewCase {
  return {
    id: DRAFT_RENDER_PREVIEW_KEY,
    palette_id: DRAFT_RENDER_PALETTE_KEY,
    chart_type: previewCase.chart_type as PalettePreviewCase['chart_type'],
    template_id: previewCase.template_id,
    template_version: previewCase.template_version,
    schema_version: previewCase.schema_version,
    color_roles: structuredClone(previewCase.color_roles),
    preview_config: structuredClone(previewCase.preview_config),
    seed_strategy: previewCase.seed_strategy as PalettePreviewCase['seed_strategy'],
    seed_value: previewCase.seed_value ?? null,
    is_primary: false,
    status: 'draft'
  }
}

function modelFromResult(result: PreviewRenderResult): DraftPreviewRenderModel {
  if (result.ok && result.kind === 'svg') return { state: 'svg', markup: result.markup, message: '', issues: [] }
  return {
    state: result.kind === 'unsupported' ? 'unsupported' : result.kind === 'error' ? 'error' : 'invalid',
    markup: '',
    message: result.message,
    issues: 'issues' in result ? result.issues ?? [] : []
  }
}

function hexToRgb(hex: string): [number, number, number] {
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return [0, 0, 0]
  return [Number.parseInt(hex.slice(1, 3), 16), Number.parseInt(hex.slice(3, 5), 16), Number.parseInt(hex.slice(5, 7), 16)]
}
