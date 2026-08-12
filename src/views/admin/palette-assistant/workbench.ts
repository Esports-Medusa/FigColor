import type {
  AnalyzeResponse,
  AssistantDraft,
  ColorSuggestion,
  DraftColor,
  DraftPreviewCase,
  PaletteAssistantProblem,
  SuggestionProvenance,
  WarningFinding
} from '@/api/paletteAssistant'
import { analyzePaletteImage, PaletteAssistantApiError } from '@/api/paletteAssistant'
import { validateDraftPreviewCases } from './draftPreview'
import type { ChartSuitability, ChartType, ValidationIssue } from '@/types/palette'
import { defineComponent, h, type Component, type PropType } from 'vue'
import type { RouteRecordRaw } from 'vue-router'
import { createPreviewDefaults } from '@/lib/chart-types/previewDefaults'

export const MAX_ASSISTANT_IMAGE_BYTES = 6 * 1024 * 1024
export const ASSISTANT_IMAGE_TYPES = ['image/png', 'image/jpeg'] as const
export const PALETTE_TYPES = ['categorical', 'sequential', 'diverging', 'mixed'] as const
export const PHASE_1_CHART_TYPES: readonly ChartType[] = [
  'bar_error', 'boxplot_jitter', 'line_multiseries', 'heatmap_annotated',
  'scatter_grouped', 'violin_distribution'
]
export const CHART_SUITABILITIES: readonly ChartSuitability[] = [
  'best_fit', 'recommended', 'compatible', 'limited'
]

export function createPaletteAssistantRoute(component: Component): RouteRecordRaw {
  return {
    path: '/admin/palette-assistant',
    name: 'admin-palette-assistant',
    component,
    meta: { requiresAuth: true, requiresAdmin: true }
  }
}

export type AnalyzeStatus = 'idle' | 'analyzing' | 'success' | 'error' | 'cancelled'
export type ColorClassification = 'data' | 'structural'

export interface EditableDraftColor extends DraftColor {
  classification: ColorClassification
}

export interface EditableAssistantDraft extends Omit<AssistantDraft, 'colors'> {
  colors: EditableDraftColor[]
}

export interface AnalyzeAudit {
  analysisId: string
  image: AnalyzeResponse['image']
  dataSuggestions: ColorSuggestion[]
  omittedStructuralColors: ColorSuggestion[]
  warnings: WarningFinding[]
  provenance: SuggestionProvenance[]
  algorithmVersion: string
  seededDraft: EditableAssistantDraft
}

export interface SelectedImage {
  file: File
  previewUrl: string
}

export interface WorkbenchState {
  image: SelectedImage | null
  status: AnalyzeStatus
  draft: EditableAssistantDraft | null
  audit: AnalyzeAudit | null
  confirmedRevision: number | null
  latestDraftRevision: number
  error: PaletteAssistantProblem | { code: string; message: string; retryable: boolean; issues?: never } | null
}

export function validateAssistantImage(file: File): string | null {
  if (!ASSISTANT_IMAGE_TYPES.includes(file.type as typeof ASSISTANT_IMAGE_TYPES[number])) {
    return 'Choose one PNG or JPEG image.'
  }
  if (file.size === 0) return 'The image file is empty.'
  if (file.size > MAX_ASSISTANT_IMAGE_BYTES) return 'The image must be 6 MiB or smaller.'
  return null
}

export function createInitialState(): WorkbenchState {
  return { image: null, status: 'idle', draft: null, audit: null, confirmedRevision: null, latestDraftRevision: 0, error: null }
}

export function draftFromAnalyze(response: AnalyzeResponse): EditableAssistantDraft {
  const draft = structuredClone(response.draft) as EditableAssistantDraft
  draft.colors = draft.colors.map((color) => ({ ...color, classification: 'data' }))
  return draft
}

export function auditFromAnalyze(response: AnalyzeResponse): AnalyzeAudit {
  return structuredClone({
    analysisId: response.analysis_id,
    image: response.image,
    dataSuggestions: response.color_suggestions,
    omittedStructuralColors: response.structural_color_suggestions,
    warnings: response.warnings,
    provenance: response.draft.provenance,
    algorithmVersion: response.algorithm_version,
    seededDraft: draftFromAnalyze(response)
  })
}

export function newAdminColor(order: number): EditableDraftColor {
  return {
    id: globalThis.crypto.randomUUID(),
    hex: '#000000', order, source: 'admin', state: 'modified', classification: 'data'
  }
}

export function normalizeDraftOrders(draft: EditableAssistantDraft): void {
  draft.colors.forEach((color, index) => { color.order = index })
}

export function mutateDraft(state: WorkbenchState, mutation: (draft: EditableAssistantDraft) => void): void {
  if (!state.draft) return
  mutation(state.draft)
  normalizeDraftOrders(state.draft)
  state.draft.revision = nextDraftRevision(state)
  state.confirmedRevision = null
}

export function replaceDraftPreviewCases(state: WorkbenchState, previewCases: DraftPreviewCase[]): void {
  mutateDraft(state, (draft) => { draft.preview_cases = structuredClone(previewCases) })
}

export function clearDraftPreviewCases(state: WorkbenchState): void {
  replaceDraftPreviewCases(state, [])
}

export type DraftSeedAllocator = () => number

export function allocateDraftPreviewSeed(randomSource: Pick<Crypto, 'getRandomValues'> = globalThis.crypto): number {
  const value = new Int32Array(1)
  randomSource.getRandomValues(value)
  return value[0]
}

export function addDraftPreviewCase(
  state: WorkbenchState,
  chartType: ChartType | string,
  allocateSeed: DraftSeedAllocator = allocateDraftPreviewSeed
): { ok: true } | { ok: false; message: string } {
  if (!state.draft || state.draft.preview_cases.length !== 0) return { ok: false, message: 'A Draft Preview already exists.' }
  const colorIds = state.draft.colors.map((color) => color.id)
  const checked = createPreviewDefaults(chartType, colorIds, 0)
  if (!checked.ok) return { ok: false, message: checked.message }
  const defaults = createPreviewDefaults(chartType, colorIds, allocateSeed())
  if (!defaults.ok) return { ok: false, message: defaults.message }
  replaceDraftPreviewCases(state, [defaults.value])
  return { ok: true }
}

export function replaceDraftPreviewChart(
  state: WorkbenchState,
  chartType: ChartType | string
): { ok: true } | { ok: false; message: string } {
  const existing = state.draft?.preview_cases[0]
  if (!state.draft || !existing || existing.seed_strategy !== 'fixed' || !Number.isInteger(existing.seed_value)) {
    return { ok: false, message: 'The current Draft Preview does not have a valid fixed seed.' }
  }
  const defaults = createPreviewDefaults(chartType, state.draft.colors.map((color) => color.id), existing.seed_value!)
  if (!defaults.ok) return { ok: false, message: defaults.message }
  replaceDraftPreviewCases(state, [defaults.value])
  return { ok: true }
}

export function mutateDraftPreviewCase(
  state: WorkbenchState,
  mutation: (previewCase: DraftPreviewCase) => void
): void {
  mutateDraft(state, (draft) => {
    if (draft.preview_cases.length === 1) mutation(draft.preview_cases[0])
  })
}

export function confirmCurrentDraft(state: WorkbenchState): boolean {
  if (!state.draft || validateDraft(state.draft).length > 0) return false
  state.confirmedRevision = state.draft.revision
  return true
}

export function resetDraftToAnalyze(state: WorkbenchState): boolean {
  if (!state.draft || !state.audit) return false
  state.draft = structuredClone(state.audit.seededDraft)
  state.draft.revision = nextDraftRevision(state)
  state.confirmedRevision = null
  return true
}

export function nextDraftRevision(state: WorkbenchState): number {
  state.latestDraftRevision += 1
  return state.latestDraftRevision
}

export function hasUnconfirmedDraft(state: WorkbenchState): boolean {
  return state.draft !== null && !isCurrentRevisionConfirmed(state)
}

export function confirmDraftAbandonment(
  state: WorkbenchState,
  confirm: (message: string) => boolean
): boolean {
  return !hasUnconfirmedDraft(state) || confirm('Discard the unconfirmed Palette Assistant Draft?')
}

export function warningOccurrences(warnings: readonly WarningFinding[]): Array<{ key: string; warning: WarningFinding }> {
  return warnings.map((warning, index) => ({ key: `${warning.id}-${index}`, warning }))
}

export const AnalyzeWarningList = defineComponent({
  name: 'AnalyzeWarningList',
  props: { warnings: { type: Array as PropType<WarningFinding[]>, required: true } },
  setup(props) {
    return () => h('ul', { class: 'warnings' }, warningOccurrences(props.warnings).map(({ key, warning }) =>
      h('li', { key }, [h('strong', warning.code), `: ${warning.message}`])
    ))
  }
})

export function addChartApplicability(state: WorkbenchState): void {
  mutateDraft(state, (draft) => { draft.chart_applicability.push({ chart_type: '', suitability: 'compatible' }) })
}

export function editChartApplicability(
  state: WorkbenchState,
  index: number,
  field: 'chart_type' | 'suitability' | 'notes',
  value: string
): void {
  mutateDraft(state, (draft) => { draft.chart_applicability[index][field] = value })
}

export function removeChartApplicability(state: WorkbenchState, index: number): void {
  mutateDraft(state, (draft) => { draft.chart_applicability.splice(index, 1) })
}

export function isCurrentRevisionConfirmed(state: WorkbenchState): boolean {
  return state.draft !== null && state.confirmedRevision === state.draft.revision
}

export function validateDraft(draft: EditableAssistantDraft): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (!draft.name.trim()) issues.push(issue('name', 'REQUIRED', 'Palette name is required.'))
  if (!PALETTE_TYPES.includes(draft.type as typeof PALETTE_TYPES[number])) {
    issues.push(issue('type', 'INVALID_PALETTE_TYPE', 'Choose a supported palette type.'))
  }
  if (draft.colors.length === 0) issues.push(issue('colors', 'REQUIRED', 'Retain at least one data color.'))
  const ids = new Set<string>()
  draft.colors.forEach((color, index) => {
    if (ids.has(color.id)) issues.push(issue(`colors[${index}].id`, 'DUPLICATE_ID', 'Color IDs must be unique.'))
    ids.add(color.id)
    if (!/^#[0-9A-F]{6}$/.test(color.hex)) issues.push(issue(`colors[${index}].hex`, 'INVALID_HEX', 'Use canonical HEX such as #1A2B3C.'))
    if (color.classification !== 'data') issues.push(issue(`colors[${index}].classification`, 'STRUCTURAL_COLOR_RETAINED', 'Structural colors are diagnostics, not retained data colors.'))
  })
  if (draft.type === 'categorical' && draft.colors.length < 2) {
    issues.push(issue('colors', 'CATEGORICAL_REQUIRES_TWO_COLORS', 'Categorical palettes require at least two retained data colors.'))
  }
  const chartTypes = new Set<string>()
  draft.chart_applicability.forEach((item, index) => {
    if (!PHASE_1_CHART_TYPES.includes(item.chart_type as ChartType)) issues.push(issue(`chart_applicability[${index}].chart_type`, 'INVALID_CHART_TYPE', 'Choose a registered chart type.'))
    if (!CHART_SUITABILITIES.includes(item.suitability as ChartSuitability)) issues.push(issue(`chart_applicability[${index}].suitability`, 'INVALID_SUITABILITY', 'Choose a supported suitability.'))
    if (chartTypes.has(item.chart_type)) issues.push(issue(`chart_applicability[${index}].chart_type`, 'DUPLICATE_CHART_TYPE', 'Each chart type may appear once.'))
    chartTypes.add(item.chart_type)
  })
  issues.push(...validateDraftPreviewCases(draft))
  return issues
}

function issue(path: string, code: string, message: string): ValidationIssue {
  return { path, code, message }
}

export class PaletteAssistantWorkbench {
  readonly state = createInitialState()
  private requestGeneration = 0
  private controller: AbortController | null = null

  selectImage(file: File): string | null {
    const validation = validateAssistantImage(file)
    if (validation) return validation
    this.invalidateRequest()
    this.revokeImage()
    this.state.image = { file, previewUrl: URL.createObjectURL(file) }
    this.clearAnalysis()
    return null
  }

  removeImage(): void {
    this.invalidateRequest()
    this.revokeImage()
    this.state.image = null
    this.clearAnalysis()
  }

  dispose(): void {
    this.invalidateRequest()
    this.revokeImage()
  }

  async analyze(): Promise<void> {
    const image = this.state.image
    if (!image) return
    this.invalidateRequest()
    const generation = this.requestGeneration
    this.controller = new AbortController()
    this.state.status = 'analyzing'
    this.state.error = null
    this.state.draft = null
    this.state.audit = null
    this.state.confirmedRevision = null
    try {
      const response = await analyzePaletteImage(image.file, this.controller.signal)
      if (generation !== this.requestGeneration || this.state.image !== image) return
      this.state.draft = draftFromAnalyze(response)
      this.state.draft.revision = nextDraftRevision(this.state)
      this.state.audit = auditFromAnalyze(response)
      this.state.status = 'success'
    } catch (error) {
      if (generation !== this.requestGeneration) return
      if (error instanceof DOMException && error.name === 'AbortError') {
        this.state.status = 'cancelled'
        return
      }
      this.state.status = 'error'
      this.state.error = error instanceof PaletteAssistantApiError
        ? error.problem
        : { code: 'ANALYZE_FAILED', message: error instanceof Error ? error.message : 'Analyze failed.', retryable: true }
    } finally {
      if (generation === this.requestGeneration) this.controller = null
    }
  }

  cancel(): void {
    if (!this.controller) return
    this.controller.abort()
    this.controller = null
    this.requestGeneration += 1
    this.state.status = 'cancelled'
  }

  private invalidateRequest(): void {
    this.controller?.abort()
    this.controller = null
    this.requestGeneration += 1
  }

  private revokeImage(): void {
    if (this.state.image) URL.revokeObjectURL(this.state.image.previewUrl)
  }

  private clearAnalysis(): void {
    this.state.status = 'idle'
    this.state.draft = null
    this.state.audit = null
    this.state.confirmedRevision = null
    this.state.error = null
  }
}
