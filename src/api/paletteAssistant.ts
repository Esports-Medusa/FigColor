import { getAuthHeaders } from './auth'

export const PALETTE_ASSISTANT_ANALYZE_PATH = '/api/admin/palette-assistant/analyze'
export const PALETTE_ASSISTANT_IMAGE_FIELD = 'image'
export const PALETTE_ASSISTANT_CONTRACT_VERSION = 'palette-assistant.v1'
export const PALETTE_ASSISTANT_ALGORITHM_VERSION = 'deterministic-image-analysis.v1'

export const ANALYZE_PROBLEM_SPECS = {
  AUTHENTICATION_REQUIRED: { status: 401, retryable: false }, ADMIN_REQUIRED: { status: 403, retryable: false },
  MALFORMED_REQUEST: { status: 400, retryable: false }, MISSING_IMAGE: { status: 400, retryable: false },
  MULTIPLE_IMAGES: { status: 400, retryable: false }, REQUEST_TOO_LARGE: { status: 413, retryable: false },
  UNSUPPORTED_MEDIA_TYPE: { status: 415, retryable: false }, IMAGE_SIGNATURE_MISMATCH: { status: 415, retryable: false },
  IMAGE_DECODE_FAILED: { status: 422, retryable: false }, IMAGE_DIMENSIONS_EXCEEDED: { status: 422, retryable: false },
  IMAGE_PIXEL_LIMIT_EXCEEDED: { status: 422, retryable: false }, ANALYSIS_TIMEOUT: { status: 504, retryable: true },
  ANALYSIS_OVERLOADED: { status: 503, retryable: true }, REQUEST_CANCELLED: { status: 499, retryable: true },
  INTERNAL_ANALYSIS_FAILURE: { status: 500, retryable: true }
} as const

export type SuggestionSource = 'assistant' | 'admin'
export type SuggestionState = 'unconfirmed' | 'accepted' | 'modified' | 'cleared'

export interface DraftColor {
  id: string
  hex: string
  label?: string
  order: number
  source: SuggestionSource
  state: SuggestionState
}

export interface SuggestionProvenance {
  path: string
  source: SuggestionSource
  state: SuggestionState
  producer: string
  algorithm_version: string
  reason_codes: string[]
  suggested_value: unknown
  ambiguity_group?: string
}

export interface DraftChartApplicability {
  chart_type: string
  suitability: string
  notes?: string
}

export interface DraftAccessibility {
  colorblind_safe: boolean
  print_friendly: boolean
  dark_background: boolean
}

export interface DraftPreviewCase {
  chart_type: string
  template_id: string
  template_version: number
  schema_version: number
  color_roles: Record<string, unknown>
  preview_config: Record<string, unknown>
  seed_strategy: string
  seed_value?: number
}

export interface AssistantDraft {
  contract_version: string
  revision: number
  name: string
  type: string
  colors: DraftColor[]
  chart_applicability: DraftChartApplicability[]
  disciplines: string[]
  use_cases: string[]
  avoid_cases: string[]
  tags: string[]
  accessibility: DraftAccessibility
  source_type: string
  source_note: string
  preview_cases: DraftPreviewCase[]
  provenance: SuggestionProvenance[]
}

export interface ImageFacts {
  format: string
  encoded_bytes: number
  width: number
  height: number
  pixel_count: number
  has_transparency: boolean
  alpha_backdrop: string
  sha256: string
}

export interface ColorSuggestion {
  id: string
  hex: string
  pixel_count: number
  fraction: number
  producer: string
  algorithm_version: string
  reason_codes: string[]
  ambiguity_group?: string
}

export interface WarningFinding {
  id: string
  code: string
  path?: string
  message: string
  policy: string
  palette_id?: string
  params: Record<string, unknown>
  requires_acknowledgment: boolean
}

export interface AnalyzeResponse {
  contract_version: string
  analysis_id: string
  image: ImageFacts
  color_suggestions: ColorSuggestion[]
  structural_color_suggestions: ColorSuggestion[]
  draft: AssistantDraft
  warnings: WarningFinding[]
  algorithm_version: string
}

export interface FieldIssue {
  path: string
  code: string
  message: string
}

export interface PaletteAssistantProblem {
  code: string
  message: string
  retryable: boolean
  issues?: FieldIssue[]
}

export class PaletteAssistantApiError extends Error {
  constructor(public readonly status: number, public readonly problem: PaletteAssistantProblem) {
    super(problem.message)
    this.name = 'PaletteAssistantApiError'
  }
}

export class PaletteAssistantContractError extends Error {
  constructor(public readonly path = '$') {
    super(`The Analyze response did not match the expected contract at ${path}.`)
    this.name = 'PaletteAssistantContractError'
  }
}

export async function analyzePaletteImage(image: File, signal?: AbortSignal): Promise<AnalyzeResponse> {
  const form = new FormData()
  form.append(PALETTE_ASSISTANT_IMAGE_FIELD, image)
  const headers = new Headers(getAuthHeaders())
  headers.delete('Content-Type')

  const response = await fetch(PALETTE_ASSISTANT_ANALYZE_PATH, {
    method: 'POST',
    headers,
    body: form,
    signal
  })
  const payload: unknown = await readJSON(response)
  if (!response.ok) {
    if (!isProblem(payload, response.status)) throw new PaletteAssistantContractError('$.problem')
    throw new PaletteAssistantApiError(response.status, payload)
  }
  if (!isAnalyzeResponse(payload)) throw new PaletteAssistantContractError()
  await assertDeterministicColorProjection(payload)
  return payload
}

async function readJSON(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    throw new PaletteAssistantContractError()
  }
}

type JSONObject = Record<string, unknown>
const object = (value: unknown): value is JSONObject => typeof value === 'object' && value !== null && !Array.isArray(value)
const string = (value: unknown): value is string => typeof value === 'string'
const number = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const integer = (value: unknown): value is number => Number.isSafeInteger(value)
const boolean = (value: unknown): value is boolean => typeof value === 'boolean'
const has = (value: JSONObject, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key)
const exact = (value: JSONObject, required: readonly string[], optional: readonly string[] = []): boolean => {
  const allowed = new Set([...required, ...optional])
  return required.every((key) => has(value, key)) && Object.keys(value).every((key) => allowed.has(key))
}
const arrayOf = <T>(value: unknown, predicate: (item: unknown) => item is T): value is T[] => Array.isArray(value) && value.every(predicate)
const canonicalHex = (value: unknown): value is string => string(value) && /^#[0-9A-F]{6}$/.test(value)
const uuid = (value: unknown, version?: 5): value is string => string(value) && new RegExp(`^[0-9a-f]{8}-[0-9a-f]{4}-${version ?? '[1-8]'}[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`).test(value)
const sha256 = (value: unknown): value is string => string(value) && /^[0-9a-f]{64}$/.test(value)
const suggestionID = (value: unknown): value is string => string(value) && /^color-[0-9a-f]{16}$/.test(value)

function isDraftColor(value: unknown): value is DraftColor {
  if (!object(value) || !exact(value, ['id', 'hex', 'order', 'source', 'state'], ['label'])) return false
  return uuid(value.id, 5) && canonicalHex(value.hex) && integer(value.order) && value.order >= 0 &&
    value.source === 'assistant' && value.state === 'unconfirmed' && !has(value, 'label')
}

function isProvenance(value: unknown): value is SuggestionProvenance {
  if (!object(value) || !exact(value, ['path', 'source', 'state', 'producer', 'algorithm_version', 'reason_codes', 'suggested_value'], ['ambiguity_group'])) return false
  return value.path === '/type' && value.source === 'assistant' && value.state === 'unconfirmed' &&
    value.producer === 'deterministic_rule_engine' && value.algorithm_version === 'deterministic-palette-suggestion.v1' &&
    Array.isArray(value.reason_codes) && value.reason_codes.length === 1 && value.reason_codes[0] === 'MULTIPLE_UNORDERED_RETAINED_DATA_COLORS' &&
    value.suggested_value === 'categorical' && !has(value, 'ambiguity_group')
}

function isDraft(value: unknown): value is AssistantDraft {
  const keys = ['contract_version', 'revision', 'name', 'type', 'colors', 'chart_applicability', 'disciplines', 'use_cases', 'avoid_cases', 'tags', 'accessibility', 'source_type', 'source_note', 'preview_cases', 'provenance']
  if (!object(value) || !exact(value, keys) || !object(value.accessibility)) return false
  const accessibility = value.accessibility
  return value.contract_version === PALETTE_ASSISTANT_CONTRACT_VERSION && value.revision === 1 &&
    value.name === '' && (value.type === '' || value.type === 'categorical') && arrayOf(value.colors, isDraftColor) && value.colors.every((color, index) => color.order === index) &&
    Array.isArray(value.chart_applicability) && value.chart_applicability.length === 0 && Array.isArray(value.disciplines) && value.disciplines.length === 0 && Array.isArray(value.use_cases) && value.use_cases.length === 0 && Array.isArray(value.avoid_cases) && value.avoid_cases.length === 0 && Array.isArray(value.tags) && value.tags.length === 0 &&
    exact(accessibility, ['colorblind_safe', 'print_friendly', 'dark_background']) && boolean(accessibility.colorblind_safe) &&
    accessibility.colorblind_safe === false && accessibility.print_friendly === false && accessibility.dark_background === false && value.source_type === 'figure_extracted' && value.source_note === '' &&
    Array.isArray(value.preview_cases) && value.preview_cases.length === 0 && arrayOf(value.provenance, isProvenance) && ((value.type === '' && value.provenance.length === 0) || (value.type === 'categorical' && value.provenance.length === 1))
}

function isImageFacts(value: unknown): value is ImageFacts {
  const keys = ['format', 'encoded_bytes', 'width', 'height', 'pixel_count', 'has_transparency', 'alpha_backdrop', 'sha256']
  return object(value) && exact(value, keys) && (value.format === 'png' || value.format === 'jpeg') && integer(value.encoded_bytes) && value.encoded_bytes > 0 && value.encoded_bytes <= 6 * 1024 * 1024 && integer(value.width) && value.width > 0 && value.width <= 4096 && integer(value.height) && value.height > 0 && value.height <= 4096 &&
    integer(value.pixel_count) && value.pixel_count === value.width * value.height && value.pixel_count <= 8_000_000 && boolean(value.has_transparency) && value.alpha_backdrop === '#FFFFFF' && sha256(value.sha256)
}

function isColorSuggestion(value: unknown): value is ColorSuggestion {
  const required = ['id', 'hex', 'pixel_count', 'fraction', 'producer', 'algorithm_version', 'reason_codes']
  return object(value) && exact(value, required, ['ambiguity_group']) && suggestionID(value.id) && canonicalHex(value.hex) && integer(value.pixel_count) && value.pixel_count > 0 &&
    number(value.fraction) && value.fraction > 0 && value.fraction <= 1 && value.producer === 'deterministic_extractor' && value.algorithm_version === PALETTE_ASSISTANT_ALGORITHM_VERSION && Array.isArray(value.reason_codes) && value.reason_codes.length === 1 &&
    (value.reason_codes[0] === 'DETERMINISTIC_PIXEL_SUPPORT' || value.reason_codes[0] === 'LIKELY_NEUTRAL_STRUCTURAL_COLOR') && (!has(value, 'ambiguity_group') || (string(value.ambiguity_group) && value.ambiguity_group !== ''))
}

function isWarning(value: unknown): value is WarningFinding {
  const required = ['id', 'code', 'message', 'policy', 'params', 'requires_acknowledgment']
  if (!object(value) || !exact(value, required, ['path', 'palette_id']) || has(value, 'path') || has(value, 'palette_id') || !sha256(value.id) || value.requires_acknowledgment !== false || !object(value.params) || !exact(value.params, ['producer'])) return false
  const params = value.params as JSONObject
  const definitions: Record<string, Array<[string, string, string, string]>> = {
    TRANSPARENCY_COMPOSITED_TO_WHITE: [['528ef80e640b07175b66da18ac98ac9348666dd04ccd282921c1846cd223c1e1', 'Transparency was composited onto white before analysis.', PALETTE_ASSISTANT_ALGORITHM_VERSION, 'imageanalysis']],
    NO_USABLE_DATA_COLOR: [['01a4c0bb7b7b7b139dd87ff49785360335924ac25bfd61b49b79e8c9ce749341', 'No usable data color was detected.', PALETTE_ASSISTANT_ALGORITHM_VERSION, 'imageanalysis'], ['6b7d31b5d7bdfa91f35c12bfe187dc8da2eb2d91883c827da9613fd98e3d2ef7', 'No usable data color was available for the seeded Draft.', 'deterministic-palette-suggestion.v1', 'palettesuggestion']],
    HEURISTIC_SUGGESTION_REQUIRES_ADMIN_REVIEW: [['e4460a068dd58fd623166a95a3bc603844eeba409061159c4716987685d11ca3', 'Assistant suggestions are heuristic and require Admin review.', 'deterministic-palette-suggestion.v1', 'palettesuggestion']],
    INSUFFICIENT_USABLE_COLORS: [['23f0aa7f2d971c11f1281ad47c8aa44b8ce0be0bd7744c20fb05f1c62ef14a45', 'Fewer than two usable data colors were available.', 'deterministic-palette-suggestion.v1', 'palettesuggestion']],
    USABLE_COLORS_TRUNCATED: [['cef93768f5f204633a68399d5018340a495b1cf7e3afa3816ea2592aaa609b5a', 'Usable data colors were limited to the first 12 suggestions.', 'deterministic-palette-suggestion.v1', 'palettesuggestion']]
  }
  if (!string(value.code) || !string(value.message) || !string(value.policy) || !string(params.producer)) return false
  return (definitions[value.code] ?? []).some(([id, message, policy, producer]) =>
    value.id === id && value.message === message && value.policy === policy && params.producer === producer
  )
}

function isAnalyzeResponse(value: unknown): value is AnalyzeResponse {
  const keys = ['contract_version', 'analysis_id', 'image', 'color_suggestions', 'structural_color_suggestions', 'draft', 'warnings', 'algorithm_version']
  if (!object(value) || !exact(value, keys) || value.contract_version !== PALETTE_ASSISTANT_CONTRACT_VERSION || !uuid(value.analysis_id) || !isImageFacts(value.image) || !arrayOf(value.color_suggestions, isColorSuggestion) || !arrayOf(value.structural_color_suggestions, isColorSuggestion) || !isDraft(value.draft) || !arrayOf(value.warnings, isWarning) || value.algorithm_version !== PALETTE_ASSISTANT_ALGORITHM_VERSION) return false
  const image = value.image as ImageFacts
  const suggestions = value.color_suggestions as ColorSuggestion[]
  const structural = value.structural_color_suggestions as ColorSuggestion[]
  const draft = value.draft as AssistantDraft
  return suggestions.every((suggestion) => suggestion.reason_codes[0] === 'DETERMINISTIC_PIXEL_SUPPORT' && suggestion.pixel_count <= image.pixel_count && Math.abs(suggestion.fraction - suggestion.pixel_count / image.pixel_count) <= Number.EPSILON) &&
    structural.every((suggestion) => suggestion.reason_codes[0] === 'LIKELY_NEUTRAL_STRUCTURAL_COLOR' && suggestion.pixel_count <= image.pixel_count && Math.abs(suggestion.fraction - suggestion.pixel_count / image.pixel_count) <= Number.EPSILON) &&
    draft.colors.length === Math.min(12, suggestions.length) && draft.colors.every((color, index) => color.hex === suggestions[index].hex) &&
    (draft.type !== 'categorical' || draft.colors.length >= 2)
}

async function digest(algorithm: 'SHA-1' | 'SHA-256', value: Uint8Array): Promise<Uint8Array> {
  try {
    return new Uint8Array(await crypto.subtle.digest(algorithm, value as BufferSource))
  } catch {
    throw new PaletteAssistantContractError('$.identity')
  }
}

const hexBytes = (bytes: Uint8Array): string => [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')

async function suggestionIdentity(classification: 'data' | 'structural', hex: string): Promise<string> {
  const name = `${PALETTE_ASSISTANT_ALGORITHM_VERSION}|${classification}|${hex}`
  return `color-${hexBytes(await digest('SHA-256', new TextEncoder().encode(name))).slice(0, 16)}`
}

function uuidBytes(value: string): Uint8Array {
  const compact = value.replace(/-/g, '')
  return Uint8Array.from(compact.match(/.{2}/g) ?? [], (pair) => Number.parseInt(pair, 16))
}

async function draftColorIdentity(imageSHA256: string, hex: string, occurrence: number): Promise<string> {
  const namespace = uuidBytes('b8264e96-9bca-4f49-a795-12397ba69e22')
  const jcsName = `{"algorithm_version":${JSON.stringify(PALETTE_ASSISTANT_ALGORITHM_VERSION)},"image_sha256":${JSON.stringify(imageSHA256)},"normalized_hex":${JSON.stringify(hex)},"occurrence_index":${occurrence}}`
  const name = new TextEncoder().encode(jcsName)
  const input = new Uint8Array(namespace.length + name.length)
  input.set(namespace); input.set(name, namespace.length)
  const hash = await digest('SHA-1', input)
  hash[6] = (hash[6] & 0x0f) | 0x50
  hash[8] = (hash[8] & 0x3f) | 0x80
  const value = hexBytes(hash.slice(0, 16))
  return `${value.slice(0,8)}-${value.slice(8,12)}-${value.slice(12,16)}-${value.slice(16,20)}-${value.slice(20)}`
}

async function assertDeterministicColorProjection(response: AnalyzeResponse): Promise<void> {
  const seenIDs = new Set<string>()
  const seenHex = new Set<string>()
  const groups: Array<['data' | 'structural', ColorSuggestion[], string]> = [
    ['data', response.color_suggestions, '$.color_suggestions'],
    ['structural', response.structural_color_suggestions, '$.structural_color_suggestions']
  ]
  for (const [classification, suggestions, path] of groups) {
    for (let index = 0; index < suggestions.length; index++) {
      const suggestion = suggestions[index]
      if (suggestion.id !== await suggestionIdentity(classification, suggestion.hex)) throw new PaletteAssistantContractError(`${path}[${index}].id`)
      if (seenIDs.has(suggestion.id)) throw new PaletteAssistantContractError(`${path}[${index}].id`)
      if (seenHex.has(suggestion.hex)) throw new PaletteAssistantContractError(`${path}[${index}].hex`)
      seenIDs.add(suggestion.id); seenHex.add(suggestion.hex)
      if (index > 0) {
        const previous = suggestions[index - 1]
        if (suggestion.pixel_count > previous.pixel_count || (suggestion.pixel_count === previous.pixel_count && suggestion.hex < previous.hex)) {
          throw new PaletteAssistantContractError(`${path}[${index}]`)
        }
      }
    }
  }
  const occurrences = new Map<string, number>()
  const draftIDs = new Set<string>()
  for (let index = 0; index < response.draft.colors.length; index++) {
    const color = response.draft.colors[index]
    if (draftIDs.has(color.id)) throw new PaletteAssistantContractError(`$.draft.colors[${index}].id`)
    draftIDs.add(color.id)
    const occurrence = occurrences.get(color.hex) ?? 0
    const expected = await draftColorIdentity(response.image.sha256, color.hex, occurrence)
    if (color.id !== expected) throw new PaletteAssistantContractError(`$.draft.colors[${index}].id`)
    occurrences.set(color.hex, occurrence + 1)
  }
}

function isFieldIssue(value: unknown): value is FieldIssue {
  return object(value) && exact(value, ['path', 'code', 'message']) && string(value.path) && string(value.code) && string(value.message)
}

function isProblem(value: unknown, status: number): value is PaletteAssistantProblem {
  if (!object(value) || !exact(value, ['code', 'message', 'retryable'], ['issues']) || !string(value.code) || !string(value.message) || value.message === '' || !boolean(value.retryable) || (has(value, 'issues') && !arrayOf(value.issues, isFieldIssue))) return false
  const spec = ANALYZE_PROBLEM_SPECS[value.code as keyof typeof ANALYZE_PROBLEM_SPECS]
  return Boolean(spec && spec.status === status && spec.retryable === value.retryable)
}
