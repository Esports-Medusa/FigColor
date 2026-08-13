import type {
  AnalyzeResponse,
  AssistantDraft,
  ColorSuggestion,
  DraftColor,
  DraftPreviewCase,
  CandidateReceipt,
  PaletteAssistantProblem,
  SuggestionProvenance,
  ValidateResponse,
  WarningFinding
} from '@/api/paletteAssistant'
import { analyzePaletteImage, createPaletteCandidate, PaletteAssistantApiError, validatePaletteDraft } from '@/api/paletteAssistant'
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
  submission: SubmissionState
}

export type SubmissionStatus = 'idle' | 'validating' | 'validated' | 'creating' | 'create_error' | 'created'
export interface SubmissionState {
  generation: number
  status: SubmissionStatus
  validatedRevision: number | null
  validation: ValidateResponse | null
  acknowledgments: string[]
  idempotencyKey: string | null
  error: PaletteAssistantProblem | { code: string; message: string; retryable: boolean; issues?: never } | null
  receipt: CandidateReceipt | null
}

export function validateAssistantImage(file: File): string | null {
  if (!ASSISTANT_IMAGE_TYPES.includes(file.type as typeof ASSISTANT_IMAGE_TYPES[number])) {
    return 'Choose one PNG or JPEG image.'
  }
  if (file.size === 0) return 'The image file is empty.'
  if (file.size > MAX_ASSISTANT_IMAGE_BYTES) return 'The image must be 6 MiB or smaller.'
  return null
}

export function validateAssistantImageSelection(files: ArrayLike<File>): { file: File | null; error: string | null } {
  if (files.length === 0) return { file: null, error: 'Choose one PNG or JPEG image.' }
  if (files.length !== 1) return { file: null, error: 'Choose exactly one PNG or JPEG image.' }
  const file = files[0]
  return { file, error: validateAssistantImage(file) }
}

export function createInitialState(): WorkbenchState {
  return { image: null, status: 'idle', draft: null, audit: null, confirmedRevision: null, latestDraftRevision: 0, error: null, submission: createSubmissionState() }
}
export function createSubmissionState(generation = 0): SubmissionState { return { generation, status:'idle', validatedRevision:null, validation:null, acknowledgments:[], idempotencyKey:null, error:null, receipt:null } }
export function invalidateSubmission(state: WorkbenchState): void { Object.assign(state.submission, createSubmissionState(state.submission.generation + 1)) }

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

export function addPickedDraftColor(state: WorkbenchState, hex: string): { added: boolean; existingIndex?: number } {
  if (!state.draft) return { added: false }
  const existingIndex = state.draft.colors.findIndex((color) => color.hex === hex)
  if (existingIndex >= 0) return { added: false, existingIndex }
  mutateDraft(state, (draft) => { draft.colors.push({ ...newAdminColor(draft.colors.length), hex }) })
  return { added: true }
}

export function replacePickedDraftColor(state: WorkbenchState, colorID: string, hex: string): { replaced: boolean; existingIndex?: number; referenced?: boolean } {
  if (!state.draft) return { replaced: false }
  const existingIndex = state.draft.colors.findIndex((color) => color.hex === hex)
  if (existingIndex >= 0) return { replaced: false, existingIndex }
  const index = state.draft.colors.findIndex((color) => color.id === colorID)
  if (index < 0) return { replaced: false }
  if (JSON.stringify(state.draft.preview_cases).includes(colorID)) return { replaced: false, referenced: true }
  mutateDraft(state, (draft) => { draft.colors.splice(index, 1, { ...newAdminColor(index), hex }) })
  return { replaced: true }
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
  invalidateSubmission(state)
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
  invalidateSubmission(state)
  return true
}

export function nextDraftRevision(state: WorkbenchState): number {
  state.latestDraftRevision += 1
  return state.latestDraftRevision
}

export function hasUnconfirmedDraft(state: WorkbenchState): boolean {
  return state.draft !== null && !isCurrentRevisionConfirmed(state)
}

export function hasPendingCreate(state: WorkbenchState): boolean {
  return state.submission.status === 'creating'
}

export function shouldProtectWorkbenchLeave(state: WorkbenchState): boolean {
  return hasPendingCreate(state) || hasUnconfirmedDraft(state)
}

export function confirmWorkbenchAbandonment(state: WorkbenchState, confirm: (message: string) => boolean): boolean {
  if (hasPendingCreate(state)) return confirm('Candidate creation is still in progress. Leave this page and ignore its pending result?')
  return confirmDraftAbandonment(state, confirm)
}

export function protectWorkbenchBeforeUnload(state: WorkbenchState, event: Pick<Event, 'preventDefault'>): boolean {
  if (!shouldProtectWorkbenchLeave(state)) return false
  event.preventDefault()
  return true
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

export function submissionDraft(draft: EditableAssistantDraft): AssistantDraft {
  return { ...structuredClone(draft), colors: draft.colors.map(({ classification: _classification, ...color }) => ({ ...color })) }
}

export function issueControlPath(pointer: string): string {
  const raw = pointer.startsWith('/draft/') ? pointer.slice(7) : pointer.startsWith('/') ? pointer.slice(1) : pointer
  return raw.split('/').map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~')).join('.')
}

export function requiredWarningIDs(state: WorkbenchState): string[] {
  return state.submission.validation?.warnings.filter((item) => item.requires_acknowledgment).map((item) => item.id).sort() ?? []
}
export function canCreateCandidate(state: WorkbenchState): boolean {
  const validation = state.submission.validation
  return Boolean(state.draft && validation && state.submission.validatedRevision === state.draft.revision && isCurrentRevisionConfirmed(state) &&
    validation.duplicates.length === 0 && requiredWarningIDs(state).every((id) => state.submission.acknowledgments.includes(id)) && state.submission.status !== 'creating')
}
export function setWarningAcknowledgment(state: WorkbenchState, id: string, checked: boolean): void {
  const allowed = requiredWarningIDs(state)
  if (!allowed.includes(id)) return
  const next = new Set(state.submission.acknowledgments)
  checked ? next.add(id) : next.delete(id)
  state.submission.acknowledgments = [...next].filter((item) => allowed.includes(item)).sort()
  state.submission.generation += 1
  state.submission.idempotencyKey = null
  state.submission.receipt = null
  if (state.submission.status === 'create_error' || state.submission.status === 'created') state.submission.status = 'validated'
  state.submission.error = null
}
export async function createCandidateAndNavigate(workbench: Pick<PaletteAssistantWorkbench, 'createCandidate'>, navigate: (path: string) => unknown | Promise<unknown>): Promise<boolean> {
  const receipt = await workbench.createCandidate()
  if (!receipt) return false
  await navigate(receipt.admin_review_path)
  return true
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
    invalidateSubmission(this.state)
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
    invalidateSubmission(this.state)
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

  async validate(): Promise<void> {
    const draft = this.state.draft
    if (!draft || !isCurrentRevisionConfirmed(this.state) || this.state.submission.status === 'validating' || this.state.submission.status === 'creating') return
    const revision = draft.revision
    this.state.submission.status = 'validating'; this.state.submission.error = null
    try {
      const response = await validatePaletteDraft(submissionDraft(draft), revision)
      if (!this.state.draft || this.state.draft.revision !== revision || this.state.confirmedRevision !== revision) return
      this.state.submission.validation = response
      this.state.submission.validatedRevision = revision
      this.state.submission.acknowledgments = []
      this.state.submission.idempotencyKey = null
      this.state.submission.receipt = null
      this.state.submission.status = 'validated'
    } catch (error) {
      this.state.submission.status = 'idle'
      this.state.submission.error = problemFrom(error, 'VALIDATE_FAILED', 'Validation failed.')
    }
  }

  async createCandidate(): Promise<CandidateReceipt | null> {
    if (!canCreateCandidate(this.state) || !this.state.draft || !this.state.submission.validation) return null
    const submission = this.state.submission
    const validation = submission.validation!
    const revision = this.state.draft.revision
    const confirmedRevision = this.state.confirmedRevision
    const validationReceipt = validation.validation_receipt
    const key = submission.idempotencyKey ?? globalThis.crypto.randomUUID()
    submission.idempotencyKey = key
    const generation = submission.generation
    submission.status = 'creating'; submission.error = null
    try {
      const receipt = await createPaletteCandidate(submissionDraft(this.state.draft), revision, validationReceipt, [...submission.acknowledgments], key)
      if (!this.isCurrentCreateIntent(revision, confirmedRevision, validation, validationReceipt, key, generation)) return null
      submission.receipt = receipt; submission.status = 'created'
      return receipt
    } catch (error) {
      if (!this.isCurrentCreateIntent(revision, confirmedRevision, validation, validationReceipt, key, generation)) return null
      submission.status = 'create_error'
      submission.error = problemFrom(error, 'CREATE_FAILED', 'Candidate creation failed.')
      return null
    }
  }

  private isCurrentCreateIntent(revision: number, confirmedRevision: number | null, validation: ValidateResponse, validationReceipt: string, key: string, generation: number): boolean {
    return Boolean(this.state.draft && this.state.draft.revision === revision && this.state.confirmedRevision === confirmedRevision && confirmedRevision === revision &&
      this.state.submission.validation === validation && validation.validation_receipt === validationReceipt && this.state.submission.idempotencyKey === key &&
      this.state.submission.generation === generation && this.state.submission.status === 'creating')
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
    invalidateSubmission(this.state)
  }
}

function problemFrom(error: unknown, code: string, message: string): WorkbenchState['error'] {
  return error instanceof PaletteAssistantApiError ? error.problem : { code, message: error instanceof Error ? error.message : message, retryable: true }
}
