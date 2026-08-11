import contractSource from '../../backend/internal/paletteassistant/contract.go?raw'
import analyzerSource from '../../backend/internal/paletteassistant/imageanalysis/analyzer.go?raw'
import suggestionSource from '../../backend/internal/paletteassistant/palettesuggestion/engine.go?raw'
import analyzeServiceSource from '../../backend/internal/paletteassistant/analyze/service.go?raw'
import {
  ANALYZE_PROBLEM_SPECS,
  analyzePaletteImage,
  PaletteAssistantApiError,
  PaletteAssistantContractError
} from './paletteAssistant'

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

function installLocalStorage(token = 'admin-token'): void {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (key: string) => key === 'auth_token' ? token : null, setItem() {}, removeItem() {} }
  })
}

function responseBody(): Record<string, unknown> {
  return {
    contract_version: 'palette-assistant.v1', analysis_id: '123e4567-e89b-42d3-a456-426614174000',
    image: { format: 'png', encoded_bytes: 123, width: 2, height: 1, pixel_count: 2, has_transparency: true, alpha_backdrop: '#FFFFFF', sha256: 'a'.repeat(64) },
    color_suggestions: [{ id: 'color-51bd3d4a26033bd9', hex: '#112233', pixel_count: 1, fraction: 0.5, producer: 'deterministic_extractor', algorithm_version: 'deterministic-image-analysis.v1', reason_codes: ['DETERMINISTIC_PIXEL_SUPPORT'] }],
    structural_color_suggestions: [{ id: 'color-2e8f2aa94cac55f4', hex: '#FFFFFF', pixel_count: 1, fraction: 0.5, producer: 'deterministic_extractor', algorithm_version: 'deterministic-image-analysis.v1', reason_codes: ['LIKELY_NEUTRAL_STRUCTURAL_COLOR'] }],
    draft: {
      contract_version: 'palette-assistant.v1', revision: 1, name: '', type: '',
      colors: [{ id: '2559aff2-2f7b-5f17-9d9f-e505654c4ae5', hex: '#112233', order: 0, source: 'assistant', state: 'unconfirmed' }],
      chart_applicability: [], disciplines: [], use_cases: [], avoid_cases: [], tags: [],
      accessibility: { colorblind_safe: false, print_friendly: false, dark_background: false },
      source_type: 'figure_extracted', source_note: '', preview_cases: [], provenance: []
    },
    warnings: [
      { id: '528ef80e640b07175b66da18ac98ac9348666dd04ccd282921c1846cd223c1e1', code: 'TRANSPARENCY_COMPOSITED_TO_WHITE', message: 'Transparency was composited onto white before analysis.', policy: 'deterministic-image-analysis.v1', params: { producer: 'imageanalysis' }, requires_acknowledgment: false },
      { id: 'e4460a068dd58fd623166a95a3bc603844eeba409061159c4716987685d11ca3', code: 'HEURISTIC_SUGGESTION_REQUIRES_ADMIN_REVIEW', message: 'Assistant suggestions are heuristic and require Admin review.', policy: 'deterministic-palette-suggestion.v1', params: { producer: 'palettesuggestion' }, requires_acknowledgment: false },
      { id: '23f0aa7f2d971c11f1281ad47c8aa44b8ce0be0bd7744c20fb05f1c62ef14a45', code: 'INSUFFICIENT_USABLE_COLORS', message: 'Fewer than two usable data colors were available.', policy: 'deterministic-palette-suggestion.v1', params: { producer: 'palettesuggestion' }, requires_acknowledgment: false }
    ],
    algorithm_version: 'deterministic-image-analysis.v1'
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function objectResponse(body: unknown): Response {
  const response = new Response(null, { status: 200 })
  Object.defineProperty(response, 'json', { value: async () => body })
  return response
}

async function referenceDraftUUIDv5(imageSHA256: string, hex: string, occurrenceIndex: number): Promise<string> {
  const namespace = Uint8Array.from('b8264e969bca4f49a79512397ba69e22'.match(/../g)!, (pair) => Number.parseInt(pair, 16))
  const name = new TextEncoder().encode(`{"algorithm_version":"deterministic-image-analysis.v1","image_sha256":"${imageSHA256}","normalized_hex":"${hex}","occurrence_index":${occurrenceIndex}}`)
  const input = new Uint8Array(namespace.length + name.length); input.set(namespace); input.set(name, namespace.length)
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-1', input)); bytes[6]=(bytes[6]&15)|80; bytes[8]=(bytes[8]&63)|128
  const value=[...bytes.slice(0,16)].map((byte)=>byte.toString(16).padStart(2,'0')).join('')
  return `${value.slice(0,8)}-${value.slice(8,12)}-${value.slice(12,16)}-${value.slice(16,20)}-${value.slice(20)}`
}

async function testMultipartAuthAbortAndProjection(): Promise<void> {
  installLocalStorage()
  const controller = new AbortController()
  const file = new File(['png'], 'figure.png', { type: 'image/png' })
  let calls = 0
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: (input: RequestInfo | URL, init?: RequestInit) => {
    calls++
    expect(String(input) === '/api/admin/palette-assistant/analyze', 'Analyze path drifted')
    expect(init?.method === 'POST', 'Analyze must use POST')
    expect(init?.body instanceof FormData, 'Analyze must use FormData')
    const entries = [...(init?.body as FormData).entries()]
    expect(entries.length === 1 && entries[0][0] === 'image' && entries[0][1] instanceof File, 'multipart must contain exactly one image part')
    expect(entries[0][1] === file, 'File identity must be preserved')
    const headers = new Headers(init?.headers)
    expect(headers.get('Authorization') === 'Bearer admin-token', 'existing Admin bearer authentication must be preserved')
    expect(!headers.has('Content-Type'), 'browser must generate the multipart boundary')
    expect(init?.signal === controller.signal, 'AbortSignal must be passed unchanged')
    return jsonResponse(responseBody())
  } })

  const result = await analyzePaletteImage(file, controller.signal)
  expect(calls === 1, 'Analyze client must make exactly one request without retry')
  expect(result.draft.colors[0].id === '2559aff2-2f7b-5f17-9d9f-e505654c4ae5', 'DraftColor identity must be preserved')
  expect(result.color_suggestions[0].id === 'color-51bd3d4a26033bd9' && result.structural_color_suggestions[0].id === 'color-2e8f2aa94cac55f4', 'suggestion arrays must preserve content and order')
  expect(result.warnings.map((warning) => warning.code).join(',') === 'TRANSPARENCY_COMPOSITED_TO_WHITE,HEURISTIC_SUGGESTION_REQUIRES_ADMIN_REVIEW,INSUFFICIENT_USABLE_COLORS' && result.draft.provenance.length === 0, 'warnings and absent single-color provenance must be preserved')
  expect(result.image.encoded_bytes === 123 && result.algorithm_version === 'deterministic-image-analysis.v1', 'image facts and analyzer identity must be preserved')
}

async function testProblemStatuses(): Promise<void> {
  for (const [code, spec] of Object.entries(ANALYZE_PROBLEM_SPECS)) {
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: () => jsonResponse({ code, message: 'Safe message.', retryable: spec.retryable }, spec.status) })
    let failure: unknown
    try { await analyzePaletteImage(new File(['x'], 'x.png')) } catch (error) { failure = error }
    expect(failure instanceof PaletteAssistantApiError, `${code} must remain a structured Problem failure`)
    const apiError = failure as PaletteAssistantApiError
    expect(apiError.status === spec.status && apiError.problem.code === code && apiError.problem.retryable === spec.retryable, `${code} Problem projection must be preserved`)
  }
  for (const body of [
    { code: 'ADMIN_REQUIRED', message: 'x', retryable: true },
    { code: 'ADMIN_REQUIRED', message: 'x', retryable: false, extra: true },
    { code: 'INVALID_DRAFT', message: 'x', retryable: false },
    { code: 'IDEMPOTENCY_KEY_MISSING', message: 'x', retryable: false },
    { code: 'ADMIN_REQUIRED', message: null, retryable: false }
  ]) {
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: () => jsonResponse(body, body.code === 'ADMIN_REQUIRED' ? 403 : 422) })
    let failure: unknown; try { await analyzePaletteImage(new File(['x'], 'x.png')) } catch (error) { failure = error }
    expect(failure instanceof PaletteAssistantContractError, `malformed/non-Analyze Problem ${body.code} must fail closed`)
  }
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: () => jsonResponse({ code: 'ADMIN_REQUIRED', message: 'x', retryable: false }, 401) })
  let wrongStatus: unknown; try { await analyzePaletteImage(new File(['x'], 'x.png')) } catch (error) { wrongStatus = error }
  expect(wrongStatus instanceof PaletteAssistantContractError, 'correct code with wrong status must fail closed')
}

function warning(variant: string): Record<string, unknown> {
  const rows: Record<string, Record<string, unknown>> = {
    transparency: { id:'528ef80e640b07175b66da18ac98ac9348666dd04ccd282921c1846cd223c1e1',code:'TRANSPARENCY_COMPOSITED_TO_WHITE',message:'Transparency was composited onto white before analysis.',policy:'deterministic-image-analysis.v1',params:{producer:'imageanalysis'},requires_acknowledgment:false },
    imageNone: { id:'01a4c0bb7b7b7b139dd87ff49785360335924ac25bfd61b49b79e8c9ce749341',code:'NO_USABLE_DATA_COLOR',message:'No usable data color was detected.',policy:'deterministic-image-analysis.v1',params:{producer:'imageanalysis'},requires_acknowledgment:false },
    heuristic: { id:'e4460a068dd58fd623166a95a3bc603844eeba409061159c4716987685d11ca3',code:'HEURISTIC_SUGGESTION_REQUIRES_ADMIN_REVIEW',message:'Assistant suggestions are heuristic and require Admin review.',policy:'deterministic-palette-suggestion.v1',params:{producer:'palettesuggestion'},requires_acknowledgment:false },
    suggestionNone: { id:'6b7d31b5d7bdfa91f35c12bfe187dc8da2eb2d91883c827da9613fd98e3d2ef7',code:'NO_USABLE_DATA_COLOR',message:'No usable data color was available for the seeded Draft.',policy:'deterministic-palette-suggestion.v1',params:{producer:'palettesuggestion'},requires_acknowledgment:false },
    insufficient: { id:'23f0aa7f2d971c11f1281ad47c8aa44b8ce0be0bd7744c20fb05f1c62ef14a45',code:'INSUFFICIENT_USABLE_COLORS',message:'Fewer than two usable data colors were available.',policy:'deterministic-palette-suggestion.v1',params:{producer:'palettesuggestion'},requires_acknowledgment:false },
    truncated: { id:'cef93768f5f204633a68399d5018340a495b1cf7e3afa3816ea2592aaa609b5a',code:'USABLE_COLORS_TRUNCATED',message:'Usable data colors were limited to the first 12 suggestions.',policy:'deterministic-palette-suggestion.v1',params:{producer:'palettesuggestion'},requires_acknowledgment:false }
  }
  return structuredClone(rows[variant])
}

// Independently precomputed from the frozen Go algorithms; tests never call frontend identity helpers.
const COLOR_VECTORS: Array<[string, string, string]> = [
  ['#000000','color-370ebb088749173b','621bec94-c917-5be8-877d-1fcf5bb08e1c'],
  ['#000001','color-e5086a36fe8607cd','a5eaa225-ec52-56f5-ab6f-0d95448cc09f'],
  ['#000002','color-d6d592d4c12098df','02d0febe-cc95-5377-860d-9fa59430281b'],
  ['#000003','color-02788c2a9a6fb256','43cdf865-db37-5aa0-8d78-44fafb0a0aa0'],
  ['#000004','color-f90c1613a3fa2597','2164f8cf-65c5-5262-8064-1b0264a27daf'],
  ['#000005','color-f7a4058c778fdf3c','e48f2828-4242-5422-a7e2-9bb8bedb60c2'],
  ['#000006','color-374c642d318c4c12','28ffbba8-6858-5232-8f17-761c0430bcd8'],
  ['#000007','color-b405aaf3604d6dcb','62c4377c-265c-5c8c-a5d9-e0899e7080d4'],
  ['#000008','color-e01d184bd5c25aca','cdfb47fe-6b5b-5479-b21b-549f141a21d2'],
  ['#000009','color-4cfa2117b878c26d','724fc9b5-1d76-54b5-b543-8290227698f9'],
  ['#00000A','color-18ffefaecebefe42','f3bbac97-9931-511f-ac52-ce8a3612d228'],
  ['#00000B','color-748b255a536d7043','b5e49b0d-e60a-54cd-87f3-6276253b2de2'],
  ['#00000C','color-2699def9ce7c1421','3c0eaf6f-242a-5206-840e-2118a7b6553a']
]

function responseWithColors(count: number, transparent = true): any {
  const body: any = structuredClone(responseBody())
  body.image.width = Math.max(1, count); body.image.pixel_count = Math.max(1, count); body.image.has_transparency = transparent
  body.structural_color_suggestions[0].pixel_count = 1; body.structural_color_suggestions[0].fraction = 1 / body.image.pixel_count
  body.color_suggestions = COLOR_VECTORS.slice(0, count).map(([hex, id]) => ({ id,hex,pixel_count:1,fraction:1/body.image.pixel_count,producer:'deterministic_extractor',algorithm_version:'deterministic-image-analysis.v1',reason_codes:['DETERMINISTIC_PIXEL_SUPPORT'] }))
  body.draft.colors = COLOR_VECTORS.slice(0, Math.min(12, count)).map(([hex, _id, draftID], index) => ({ id:draftID,hex,order:index,source:'assistant',state:'unconfirmed' }))
  if (count >= 2) {
    body.draft.type = 'categorical'
    body.draft.provenance = [{ path: '/type', source: 'assistant', state: 'unconfirmed', producer: 'deterministic_rule_engine', algorithm_version: 'deterministic-palette-suggestion.v1', reason_codes: ['MULTIPLE_UNORDERED_RETAINED_DATA_COLORS'], suggested_value: 'categorical' }]
  }
  body.warnings = [...(transparent ? [warning('transparency')] : []), ...(count === 0 ? [warning('imageNone')] : []), warning('heuristic'), ...(count === 0 ? [warning('suggestionNone')] : count === 1 ? [warning('insufficient')] : []), ...(count > 12 ? [warning('truncated')] : [])]
  return body
}

async function testWarningProjection(): Promise<void> {
  const legalSequences = [
    [],
    [warning('heuristic')],
    [warning('heuristic'), warning('heuristic')],
    [warning('insufficient'), warning('insufficient'), warning('insufficient')],
    [warning('transparency'), warning('heuristic'), warning('transparency')],
    [warning('heuristic'), warning('heuristic'), warning('truncated'), warning('heuristic')]
  ]
  for (const warnings of legalSequences) {
    const body = responseWithColors(2)
    body.warnings = warnings
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: () => objectResponse(body) })
    const result = await analyzePaletteImage(new File(['x'], 'x.png'))
    expect(result.warnings === body.warnings, 'parsed response must retain the server warning array identity')
    expect(result.warnings.length === warnings.length && result.warnings.every((item, index) => (item as unknown) === warnings[index]), 'warning order, occurrence identity, and multiplicity must be preserved')
    expect(JSON.stringify(result.warnings) === JSON.stringify(warnings), 'warning occurrences must not be normalized, rebuilt, sorted, or deduplicated')
  }
  for (const [colorCount, warningCount] of [[13,1],[2,4]] as const) {
    const body = responseWithColors(colorCount)
    body.warnings = Array.from({ length: warningCount }, () => warning('heuristic'))
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: () => jsonResponse(body) })
    const result = await analyzePaletteImage(new File(['x'], 'x.png'))
    expect(result.warnings.length === warningCount, 'warning count must remain independent of raw, selected, and omitted color counts')
  }

  const malformed: Array<[string, (body: any) => void]> = [
    ['wrong container', (b) => { b.warnings = {} }],
    ['non-object occurrence', (b) => { b.warnings = ['warning'] }],
    ['missing required field', (b) => { delete b.warnings[0].message }],
    ['wrong field type', (b) => { b.warnings[0].requires_acknowledgment = 'false' }],
    ['unknown field', (b) => { b.warnings[0].extra = true }],
    ['unknown code', (b) => { b.warnings[0].code = 'UNKNOWN' }],
    ['wrong id', (b) => { b.warnings[0].id = '0'.repeat(64) }],
    ['wrong message', (b) => { b.warnings[0].message = 'Different.' }],
    ['wrong policy', (b) => { b.warnings[0].policy = 'deterministic-image-analysis.v1' }],
    ['wrong producer', (b) => { b.warnings[0].params.producer = 'imageanalysis' }]
  ]
  for (const [name, mutate] of malformed) {
    const body = responseWithColors(2)
    body.warnings = [warning('heuristic')]
    mutate(body)
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: () => jsonResponse(body) })
    let failure: unknown; try { await analyzePaletteImage(new File(['x'], 'x.png')) } catch (error) { failure = error }
    expect(failure instanceof PaletteAssistantContractError, `${name} warning projection must fail closed with the existing contract error identity`)
  }
}

function installCategoricalProposal(body: any): void {
  body.draft.type = 'categorical'
  body.draft.provenance = [{ path: '/type', source: 'assistant', state: 'unconfirmed', producer: 'deterministic_rule_engine', algorithm_version: 'deterministic-palette-suggestion.v1', reason_codes: ['MULTIPLE_UNORDERED_RETAINED_DATA_COLORS'], suggested_value: 'categorical' }]
}

async function testCategoricalProposalEligibility(): Promise<void> {
  for (const count of [0, 1]) {
    const body = responseWithColors(count)
    installCategoricalProposal(body)
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: () => jsonResponse(body) })
    let failure: unknown; try { await analyzePaletteImage(new File(['x'], 'x.png')) } catch (error) { failure = error }
    expect(failure instanceof PaletteAssistantContractError, `${count}-color categorical proposal must fail with the existing contract error identity`)
  }
  for (const count of [2, 3, 13]) {
    const body = responseWithColors(count)
    body.warnings = [warning('heuristic'), warning('heuristic'), warning('truncated'), warning('heuristic')]
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: () => objectResponse(body) })
    const result = await analyzePaletteImage(new File(['x'], 'x.png'))
    expect(result === body && result.draft.type === 'categorical', `${count}-color categorical response must be accepted without reconstruction`)
    expect(result.warnings === body.warnings, 'legal response with selected colors, omitted-over-maximum colors, and repeated warnings must preserve identity')
  }

  const singleWithoutProposal = responseWithColors(1)
  singleWithoutProposal.warnings = []
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: () => objectResponse(singleWithoutProposal) })
  expect(await analyzePaletteImage(new File(['x'], 'x.png')) === singleWithoutProposal, 'single-color response without categorical proposal must remain legal')

  const structuralBypass = responseWithColors(1)
  installCategoricalProposal(structuralBypass)
  structuralBypass.warnings = Array.from({ length: 5 }, () => warning('heuristic'))
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: () => jsonResponse(structuralBypass) })
  let structuralFailure: unknown; try { await analyzePaletteImage(new File(['x'], 'x.png')) } catch (error) { structuralFailure = error }
  expect(structuralFailure instanceof PaletteAssistantContractError, 'one selected plus one structural/omitted color and extra warnings must not satisfy categorical eligibility')

  const rawSuggestionBypass = responseWithColors(2)
  rawSuggestionBypass.draft.colors = rawSuggestionBypass.draft.colors.slice(0, 1)
  installCategoricalProposal(rawSuggestionBypass)
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: () => jsonResponse(rawSuggestionBypass) })
  let rawFailure: unknown; try { await analyzePaletteImage(new File(['x'], 'x.png')) } catch (error) { rawFailure = error }
  expect(rawFailure instanceof PaletteAssistantContractError, 'multiple raw suggestions with only one selected Draft color must not bypass eligibility')

  const reorderedProposal = responseWithColors(2)
  reorderedProposal.draft = { provenance: reorderedProposal.draft.provenance, colors: reorderedProposal.draft.colors, type: reorderedProposal.draft.type, ...reorderedProposal.draft }
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: () => jsonResponse(reorderedProposal) })
  expect((await analyzePaletteImage(new File(['x'], 'x.png'))).draft.type === 'categorical', 'proposal property order must not affect eligibility')
}

async function testDeterministicIdentityOrderingAndUniqueness(): Promise<void> {
  const legal = responseWithColors(2)
  expect(legal.color_suggestions[0].id === 'color-370ebb088749173b', 'known suggestion SHA-256 vector drifted')
  expect(legal.draft.colors[0].id === '621bec94-c917-5be8-877d-1fcf5bb08e1c', 'known DraftColor UUIDv5 vector drifted')
  expect(await referenceDraftUUIDv5('a'.repeat(64), '#112233', 0) === '2559aff2-2f7b-5f17-9d9f-e505654c4ae5', 'occurrence=0 UUIDv5 known answer drifted')
  expect(await referenceDraftUUIDv5('a'.repeat(64), '#112233', 1) === 'ac918de4-9c79-5008-932b-0467c558ed11', 'occurrence=1 UUIDv5 known answer drifted')

  for (const body of [
    responseBody(),
    (() => { const b:any=responseBody(); b.color_suggestions[0].hex='#445566'; b.color_suggestions[0].id='color-851e5938b3796710'; b.draft.colors[0].hex='#445566'; b.draft.colors[0].id='16008a8a-647f-5db9-a94d-1c6c41e21766'; return b })(),
    (() => { const b:any=responseBody(); b.image.sha256='b'.repeat(64); b.draft.colors[0].id='fdc404d1-857c-5cf9-b7b9-400516559fbf'; return b })()
  ]) {
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: () => jsonResponse(body) })
    const result = await analyzePaletteImage(new File(['x'], 'x.png'))
    expect(JSON.stringify(result) === JSON.stringify(body), 'legal known-answer payload must be returned without rewriting')
  }

  const cases: Array<[string, any, string]> = []
  const add = (name: string, mutate: (body: any) => void, path: string, count = 2) => {
    const body = responseWithColors(count); mutate(body); cases.push([name, body, path])
  }
  add('format-correct wrong suggestion ID', (b) => { b.color_suggestions[0].id = 'color-1111111111111111' }, '$.color_suggestions[0].id')
  add('structural-classified ID on data', (b) => { b.color_suggestions[0].id = 'color-c99b9c513258d799' }, '$.color_suggestions[0].id')
  add('wrong algorithm-version suggestion ID', (b) => { b.color_suggestions[0].id = 'color-fd8778e32d3c0dc2' }, '$.color_suggestions[0].id')
  add('swapped suggestion IDs', (b) => { [b.color_suggestions[0].id,b.color_suggestions[1].id] = [b.color_suggestions[1].id,b.color_suggestions[0].id] }, '$.color_suggestions[0].id')
  add('pixel-count descending order', (b) => { b.image.width=3; b.image.pixel_count=3; b.color_suggestions[0].fraction=1/3; b.color_suggestions[1].pixel_count=2; b.color_suggestions[1].fraction=2/3; b.structural_color_suggestions[0].fraction=1/3 }, '$.color_suggestions[1]')
  add('HEX ascending tie-break', (b) => { b.color_suggestions.reverse(); b.draft.colors.reverse(); b.draft.colors.forEach((c: any,i: number)=>c.order=i) }, '$.color_suggestions[1]')
  add('duplicate data identity and HEX', (b) => { b.color_suggestions[1]={...b.color_suggestions[0]}; b.draft.colors[1]={...b.draft.colors[0],id:'11111111-1111-5111-8111-111111111111',order:1} }, '$.color_suggestions[1].id')
  add('duplicate data ID with distinct HEX', (b) => { b.color_suggestions[1].id=b.color_suggestions[0].id }, '$.color_suggestions[1].id')
  add('duplicate data HEX with distinct ID', (b) => { b.color_suggestions[1].hex=b.color_suggestions[0].hex; b.draft.colors[1].hex=b.draft.colors[0].hex }, '$.color_suggestions[1].id')
  add('cross-array HEX conflict', (b) => { b.structural_color_suggestions[0]={...b.color_suggestions[0],id:'color-c99b9c513258d799',reason_codes:['LIKELY_NEUTRAL_STRUCTURAL_COLOR']} }, '$.structural_color_suggestions[0].hex')
  add('cross-array duplicate ID with distinct HEX', (b) => { b.structural_color_suggestions[0].id=b.color_suggestions[0].id }, '$.structural_color_suggestions[0].id')
  add('arbitrary UUIDv5', (b) => { b.draft.colors[0].id='11111111-1111-5111-8111-111111111111' }, '$.draft.colors[0].id')
  add('swapped DraftColor IDs', (b) => { [b.draft.colors[0].id,b.draft.colors[1].id]=[b.draft.colors[1].id,b.draft.colors[0].id] }, '$.draft.colors[0].id')
  add('image-bound DraftColor ID', (b) => { b.image.sha256='b'.repeat(64) }, '$.draft.colors[0].id')
  add('off-by-one occurrence UUIDv5', (b) => { b.draft.colors[0].id='ac918de4-9c79-5008-932b-0467c558ed11' }, '$.draft.colors[0].id')
  add('wrong UUID namespace', (b) => { b.draft.colors[0].id='0a12c316-fcd8-5690-8c94-fcacb9c476b5' }, '$.draft.colors[0].id')
  add('wrong Draft algorithm version', (b) => { b.draft.colors[0].id='7bac7021-42a9-5149-a276-d599c2dd4290' }, '$.draft.colors[0].id')
  add('wrong Draft JCS name shape', (b) => { b.draft.colors[0].id='cfb7e520-358a-560d-8498-57524806aabf' }, '$.draft.colors[0].id')
  add('duplicate DraftColor ID', (b) => { b.draft.colors[1].id=b.draft.colors[0].id }, '$.draft.colors[1].id')
  add('DraftColor ID from another suggestion position', (b) => { b.draft.colors[1].id=b.draft.colors[0].id }, '$.draft.colors[1].id')
  add('13-color boundary DraftColor ID', (b) => { b.draft.colors[11].id='11111111-1111-5111-8111-111111111111' }, '$.draft.colors[11].id', 13)

  for (const [name, body, path] of cases) {
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: () => jsonResponse(body) })
    let failure: unknown; try { await analyzePaletteImage(new File(['x'], 'x.png')) } catch (error) { failure = error }
    expect(failure instanceof PaletteAssistantContractError && failure.path === path, `${name} must fail closed at ${path}`)
  }

  for (const [name, id] of [
    ['uppercase digest','color-370EBB088749173B'],
    ['wrong prefix','colour-370ebb088749173b'],
    ['short digest','color-370ebb088749173'],
    ['long digest','color-370ebb088749173b0']
  ]) {
    const body=responseWithColors(1); body.color_suggestions[0].id=id
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: () => jsonResponse(body) })
    let failure: unknown; try { await analyzePaletteImage(new File(['x'], 'x.png')) } catch (error) { failure=error }
    expect(failure instanceof PaletteAssistantContractError, `${name} suggestion ID must fail closed`)
  }

  const structural = responseWithColors(0)
  structural.image.width=2; structural.image.pixel_count=2
  structural.structural_color_suggestions = [
    {id:'color-c99b9c513258d799',hex:'#000000',pixel_count:1,fraction:0.5,producer:'deterministic_extractor',algorithm_version:'deterministic-image-analysis.v1',reason_codes:['LIKELY_NEUTRAL_STRUCTURAL_COLOR']},
    {id:'color-428df56b92b8018e',hex:'#000001',pixel_count:1,fraction:0.5,producer:'deterministic_extractor',algorithm_version:'deterministic-image-analysis.v1',reason_codes:['LIKELY_NEUTRAL_STRUCTURAL_COLOR']}
  ]
  for (const [name, mutate, path] of [
    ['structural HEX tie-break', (b:any)=>b.structural_color_suggestions.reverse(), '$.structural_color_suggestions[1]'],
    ['structural pixel-count descending order', (b:any)=>{b.image.width=3;b.image.pixel_count=3;b.structural_color_suggestions[0].fraction=1/3;b.structural_color_suggestions[1].pixel_count=2;b.structural_color_suggestions[1].fraction=2/3}, '$.structural_color_suggestions[1]'],
    ['structural duplicate ID/HEX', (b:any)=>{b.structural_color_suggestions[1]={...b.structural_color_suggestions[0]}}, '$.structural_color_suggestions[1].id'],
    ['structural duplicate ID distinct HEX', (b:any)=>{b.structural_color_suggestions[1].id=b.structural_color_suggestions[0].id}, '$.structural_color_suggestions[1].id'],
    ['structural duplicate HEX distinct ID', (b:any)=>{b.structural_color_suggestions[1].hex=b.structural_color_suggestions[0].hex}, '$.structural_color_suggestions[1].id']
  ] as const) {
    const body=structuredClone(structural); mutate(body)
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: () => jsonResponse(body) })
    let failure: unknown; try { await analyzePaletteImage(new File(['x'], 'x.png')) } catch (error) { failure=error }
    expect(failure instanceof PaletteAssistantContractError && failure.path === path, `${name} must fail closed at ${path}`)
  }
}

async function testMalformedSuccessAndErrorFailClosed(): Promise<void> {
  const invalid: Array<[string, (body: any) => void]> = [
    ['top-level unknown', (b) => { b.candidate_id = 'x' }], ['nested unknown', (b) => { b.image.extra = true }],
    ['array unknown', (b) => { b.draft.colors[0].formal_color_id = 'x' }], ['missing required', (b) => { delete b.draft.name }],
    ['null required', (b) => { b.image = null }], ['wrong primitive', (b) => { b.image.width = '2' }],
    ['non-integer', (b) => { b.image.width = 1.5 }], ['negative', (b) => { b.image.encoded_bytes = -1 }],
    ['NaN', (b) => { b.color_suggestions[0].fraction = Number.NaN }], ['Infinity', (b) => { b.color_suggestions[0].fraction = Number.POSITIVE_INFINITY }],
    ['format', (b) => { b.image.format = 'gif' }], ['analysis UUID', (b) => { b.analysis_id = '' }],
    ['color UUID', (b) => { b.draft.colors[0].id = '' }], ['duplicate color ID', (b) => { b.draft.colors.push({ ...b.draft.colors[0], order: 1 }) }],
    ['hex', (b) => { b.draft.colors[0].hex = '#abcdef' }], ['order', (b) => { b.draft.colors[0].order = -1 }],
    ['revision', (b) => { b.draft.revision = 2 }], ['type', (b) => { b.draft.type = 'mixed' }],
    ['source', (b) => { b.draft.colors[0].source = 'admin' }], ['state', (b) => { b.draft.colors[0].state = 'modified' }],
    ['source type', (b) => { b.draft.source_type = 'manual' }], ['preview', (b) => { b.draft.preview_cases = [{}] }],
    ['producer', (b) => { b.color_suggestions[0].producer = '' }], ['algorithm', (b) => { b.algorithm_version = '' }],
    ['reason codes', (b) => { b.color_suggestions[0].reason_codes = [] }], ['warning', (b) => { b.warnings[0].code = 'UNKNOWN' }],
    ['provenance', (b) => { installCategoricalProposal(b); b.draft.provenance[0].path = '/name' }]
  ]
  for (const [name, mutate] of invalid) {
    const body: any = structuredClone(responseBody()); mutate(body)
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: () => jsonResponse(body, 200) })
    let failure: unknown
    try { await analyzePaletteImage(new File(['x'], 'x.png')) } catch (error) { failure = error }
    expect(failure instanceof PaletteAssistantContractError, `${name} must fail closed`)
  }

  for (const body of [{ code: 'ADMIN_REQUIRED', message: 'x' }, { code: 'NOT_ANALYZE', message: 'x', retryable: false }]) {
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: () => jsonResponse(body, 403) })
    let failure: unknown; try { await analyzePaletteImage(new File(['x'], 'x.png')) } catch (error) { failure = error }
    expect(failure instanceof PaletteAssistantContractError, 'malformed Problem must fail closed')
  }
}

async function testTransportFailuresPreserveIdentity(): Promise<void> {
  for (const failure of [new TypeError('network down'), new DOMException('aborted', 'AbortError')]) {
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: () => Promise.reject(failure) })
    let received: unknown; try { await analyzePaletteImage(new File(['x'], 'x.png')) } catch (error) { received = error }
    expect(received === failure, `${failure.name} identity must be preserved`)
  }
  for (const body of ['', 'not json']) {
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: () => new Response(body, { status: 200 }) })
    let received: unknown; try { await analyzePaletteImage(new File(['x'], 'x.png')) } catch (error) { received = error }
    expect(received instanceof PaletteAssistantContractError, 'empty/non-JSON response must fail closed')
  }
}

async function testTruncatedDraftProjection(): Promise<void> {
  const body = responseWithColors(13)
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: () => jsonResponse(body) })
  const result = await analyzePaletteImage(new File(['x'], 'x.png'))
  expect(result.color_suggestions.length === 13 && result.draft.colors.length === 12, 'legal truncation projection must be preserved')
}

function testGoContractDriftBoundary(): void {
  function goLexicalView(source: string, preserveLiterals: boolean): string {
    const output=[...source]; let state:'code'|'line'|'block'|'string'|'raw'|'rune'='code'; let escaped=false
    for(let index=0;index<source.length;index++) {
      const char=source[index], next=source[index+1]
      if(state==='code') {
        if(char==='/'&&next==='/') { output[index]=output[index+1]=' '; state='line'; index++ }
        else if(char==='/'&&next==='*') { output[index]=output[index+1]=' '; state='block'; index++ }
        else if(char==='"') { if(!preserveLiterals) output[index]=' '; state='string'; escaped=false }
        else if(char==='`') { if(!preserveLiterals) output[index]=' '; state='raw' }
        else if(char==="'") { if(!preserveLiterals) output[index]=' '; state='rune'; escaped=false }
      } else {
        if((state==='line'||state==='block'||!preserveLiterals)&&char!=='\n'&&char!=='\r') output[index]=' '
        if(state==='line'&&(char==='\n'||char==='\r')) state='code'
        else if(state==='block'&&char==='*'&&next==='/') { output[index+1]=' '; state='code'; index++ }
        else if(state==='raw'&&char==='`') state='code'
        else if(state==='string'||state==='rune') {
          const terminator=state==='string'?'"':"'"
          if(escaped) escaped=false
          else if(char==='\\') escaped=true
          else if(char===terminator) state='code'
          else if(char==='\n'||char==='\r') throw new Error(`unterminated Go ${state} literal`)
        }
      }
    }
    expect(state==='code'||state==='line', `unterminated Go lexical state: ${state}`)
    const masked=output.join(''); expect(masked.length===source.length, 'Go lexical mask offset alignment drifted'); return masked
  }
  const goLexicalMask = (source: string): string => goLexicalView(source, false)
  const goCommentMask = (source: string): string => goLexicalView(source, true)
  function goBlock(source: string, marker: string): string {
    const code=goLexicalMask(source)
    const start=code.indexOf(marker); expect(start >= 0 && code.indexOf(marker,start+marker.length)<0, `missing or ambiguous Go block ${marker}`)
    const open=code.indexOf('{',start); expect(open >= 0, `missing opening brace for ${marker}`)
    let depth=0
    for(let index=open;index<code.length;index++) { if(code[index]==='{') depth++; else if(code[index]==='}'&&--depth===0) return source.slice(start,index+1) }
    throw new Error(`unterminated Go block ${marker}`)
  }
  const goFunction = goBlock
  function canonicalGoExecutable(source: string): string {
    const standaloneLiteral = /^\s*_\s*=\s*(?:"(?:\\.|[^"\\])*"|`[^`]*`|'(?:\\.|[^'\\])')\s*$/
    return goCommentMask(source).split(/\r?\n/)
      .filter((line) => line.trim() !== '' && !standaloneLiteral.test(line))
      .join(' ').replace(/\s+/g, ' ').trim()
  }
  function maximumColorsChain(source: string): void {
    const assignment='(?:<<=|>>=|&\\^=|\\+=|-=|\\*=|\\/=|%=|&=|\\|=|\\^=|:=|=|\\+\\+|--)'
    const sourceCode=goLexicalMask(source)
    const declaration=sourceCode.match(/^\s*MaximumColors\s*=\s*(\d+)\s*$/gm)
    expect(declaration?.length === 1 && /^\s*MaximumColors\s*=\s*12\s*$/.test(declaration[0]), 'MaximumColors production declaration drifted')
    const constructor=goFunction(source,'func New() *Engine')
    expect(/^func New\(\) \*Engine \{\s*return &Engine\{policy: Policy\{Version: PolicyVersion, MinimumColors: MinimumColors, MaximumColors: MaximumColors\}\}\s*\}$/.test(goLexicalMask(constructor)), 'Engine New() no longer binds MaximumColors constant into production policy')
    const suggest=goFunction(source,'func (e *Engine) Suggest(')
    const suggestCode=goLexicalMask(suggest)
    const canonicalSuggestExecutable = 'func (e *Engine) Suggest(ctx context.Context, input imageanalysis.Result) (Result, error) { if ctx == nil { return Result{}, ErrInvalidContext } if e == nil || e.policy != (Policy{Version: PolicyVersion, MinimumColors: MinimumColors, MaximumColors: MaximumColors}) { return Result{}, ErrInvalidEngine } if err := ctx.Err(); err != nil { return Result{}, ErrCancelled } if input.Evidence.AlgorithmVersion != imageanalysis.AlgorithmVersion || input.Evidence.Configuration.AlgorithmVersion != imageanalysis.AlgorithmVersion { return Result{}, ErrUnsupportedAnalyzer } if !validEvidence(input) || !imageanalysis.VerifyResult(input) { return Result{}, ErrInvalidEvidence } r := Result{Policy: e.policy, SourceAnalyzerVersion: input.Evidence.AlgorithmVersion, SourceEvidenceSHA256: input.Evidence.OutputSHA256, Reviewable: true, SelectedColors: []SuggestedColor{}, OmittedColors: []OmittedColor{}, Facts: []Fact{{Code: "SOURCE_PIXEL_COUNT", Value: itoa(input.Image.PixelCount)}, {Code: "WP_B2_RETAINED_DATA_COLOR_COUNT", Value: itoa(int64(len(input.ColorSuggestions)))}}, Warnings: []string{WarningHeuristic}, UnresolvedDecisions: semanticUnresolved()} for i, c := range input.ColorSuggestions { if i < e.policy.MaximumColors { r.SelectedColors = append(r.SelectedColors, SuggestedColor{ID: selectedColorID(e.policy, input.Evidence.OutputSHA256, c), Hex: c.Hex, PixelCount: c.PixelCount, Fraction: c.Fraction, SourceSuggestionID: c.ID, RuleID: RuleSelectRetained, ReasonCodes: []string{ReasonSelected}, Authoritative: false}) } else { r.OmittedColors = append(r.OmittedColors, OmittedColor{Hex: c.Hex, PixelCount: c.PixelCount, Fraction: c.Fraction, Classification: "data", ReasonCodes: []string{ReasonTruncated}}) } } for _, c := range input.StructuralColors { r.OmittedColors = append(r.OmittedColors, OmittedColor{Hex: c.Hex, PixelCount: c.PixelCount, Fraction: c.Fraction, Classification: "structural", ReasonCodes: []string{ReasonStructural}}) } for _, c := range input.Evidence.Excluded { r.OmittedColors = append(r.OmittedColors, OmittedColor{Hex: c.Hex, PixelCount: c.PixelCount, Fraction: c.Fraction, Classification: c.Classification, ReasonCodes: append([]string{ReasonExcluded}, c.ReasonCodes...)}) } switch { case len(r.SelectedColors) == 0: r.State = StateNoUsableColors r.Warnings = append(r.Warnings, WarningNoUsable) case len(r.SelectedColors) < e.policy.MinimumColors: r.State = StateNeedsReview r.Warnings = append(r.Warnings, WarningInsufficient) default: r.State = StateComplete r.PaletteType = &PaletteTypeSuggestion{Value: "categorical", Producer: Producer, AlgorithmVersion: e.policy.Version, RuleID: RuleCategorical, ReasonCodes: []string{"MULTIPLE_UNORDERED_RETAINED_DATA_COLORS"}} r.UnresolvedDecisions = removeUnresolved(r.UnresolvedDecisions, "/palette_type") } if len(input.ColorSuggestions) > e.policy.MaximumColors { r.Warnings = append(r.Warnings, WarningTruncated) } r.SuggestionSetID = stableID(e.policy.Version, strconv.Itoa(e.policy.MinimumColors), strconv.Itoa(e.policy.MaximumColors), input.Evidence.OutputSHA256, semanticHash(r)) r.OutputSHA256 = semanticHash(r) return r, nil }'
    expect(canonicalGoExecutable(suggest) === canonicalSuggestExecutable, 'Suggest continuous canonical executable chain drifted')
    expect(/if e == nil \|\| e\.policy != \(Policy\{Version: PolicyVersion, MinimumColors: MinimumColors, MaximumColors: MaximumColors\}\) \{\s*return Result\{\}, ErrInvalidEngine\s*\}/.test(suggestCode), 'Suggest executable policy integrity guard no longer fails closed on MaximumColors drift')
    expect(!new RegExp(`e\\.policy(?:\\.MaximumColors)?\\s*${assignment}|&\\s*e\\.policy\\b`).test(suggestCode), 'Suggest mutates or aliases the production policy')
    expect((suggestCode.match(/\be\b/g)??[]).length===12 && !/\b\w+(?:\.\w+)*\s*\(\s*&?\s*e\s*\)/.test(suggestCode), 'Engine is passed to a helper or used through an unverified alias')
    expect((suggestCode.match(/\binput\b/g)??[]).length===15 && (suggestCode.match(/\binput\.ColorSuggestions\b/g)??[]).length===3 && (suggestCode.match(/\blen\s*\(\s*input\.ColorSuggestions\s*\)/g)??[]).length===2 && (suggestCode.match(/range\s+input\.ColorSuggestions\b/g)??[]).length===1 && !new RegExp(`\\binput\\s*${assignment}|&\\s*input\\b`).test(suggestCode), 'whole input or ColorSuggestions is rewritten, pre-sliced, aliased, reordered, or replaced')
    expect((suggestCode.match(/\b(?:\w+\.)*\w+\s*\(\s*input\s*\)/g)??[]).length===2 && (suggestCode.match(/\bvalidEvidence\s*\(\s*input\s*\)/g)??[]).length===1 && (suggestCode.match(/\bimageanalysis\.VerifyResult\s*\(\s*input\s*\)/g)??[]).length===1, 'whole input is passed to an unverified helper')
    const dataLoop=goBlock(suggest,'for i, c := range input.ColorSuggestions')
    const dataCode=goLexicalMask(dataLoop)
    const selectedBranch=goBlock(dataLoop,'if i < e.policy.MaximumColors')
    const selectedCode=goLexicalMask(selectedBranch)
    expect(/^if i < e\.policy\.MaximumColors \{\s*r\.SelectedColors = append\(r\.SelectedColors, SuggestedColor\{ID: selectedColorID\(e\.policy, input\.Evidence\.OutputSHA256, c\), Hex: c\.Hex, PixelCount: c\.PixelCount, Fraction: c\.Fraction, SourceSuggestionID: c\.ID, RuleID: RuleSelectRetained, ReasonCodes: \[\]string\{ReasonSelected\}, Authoritative: false\}\)\s*\}$/.test(selectedCode), 'selected branch must contain only the unique canonical SuggestedColor append')
    const omittedBranch=goBlock(dataLoop,'else {')
    const omittedCode=goLexicalMask(omittedBranch)
    expect(/^else \{\s*r\.OmittedColors = append\(r\.OmittedColors, OmittedColor\{Hex: c\.Hex, PixelCount: c\.PixelCount, Fraction: c\.Fraction, Classification: \s*, ReasonCodes: \[\]string\{ReasonTruncated\}\}\)\s*\}$/.test(omittedCode), 'omitted branch must contain only the unique canonical OmittedColor direct-field projection')
    expect(/if i < e\.policy\.MaximumColors \{\s*r\.SelectedColors = append\(r\.SelectedColors,[\s\S]*?\)\s*\} else \{\s*r\.OmittedColors = append\(r\.OmittedColors, OmittedColor\{[\s\S]*?\}\)\s*\}/.test(dataCode), 'Suggest executable data first-N/omitted branches are no longer bound to e.policy.MaximumColors')
    expect(/^for i, c := range input\.ColorSuggestions \{/.test(dataCode) && (dataCode.match(/\bif\b/g)??[]).length===1 && (dataCode.match(/:=/g)??[]).length===1 && !/\b(?:break|continue|goto|switch|select)\b/.test(dataCode), 'data selection has a secondary gate, counter, or control-flow exit')
    expect((dataCode.match(/\bi\b/g)??[]).length===2 && !new RegExp(`\\bi\\s*${assignment}|&\\s*i\\b`).test(dataCode), 'range index is reassigned, shadowed, aliased, or replaced by a secondary index')
    expect((dataCode.match(/\bc\b/g)??[]).length===9 && (dataCode.match(new RegExp(`\\bc(?:\\.\\w+)?\\s*${assignment}`,'g'))??[]).length===1 && !/&\s*c\b/.test(dataCode) && !/\bc\s*\.\s*\w+\s*\(/.test(dataCode) && (dataCode.match(/(?:^|[,(])\s*(?:\(\s*)*c(?:\s*\.\s*\w+)?\s*(?:\)\s*)*(?=[,)])/g)??[]).length===1, 'current range color is mutated, shadowed, aliased, used as a call receiver, or passed to a helper')
    const dataStart=suggestCode.indexOf('for i, c := range input.ColorSuggestions'); let depth=0
    for(let index=0;index<dataStart;index++) { if(suggestCode[index]==='{') depth++; else if(suggestCode[index]==='}') depth-- }
    expect(depth===1, 'data selection loop is wrapped by a secondary gate')
    expect((suggestCode.match(/\bSelectedColors\b/g)??[]).length===5 && (suggestCode.match(new RegExp(`r\\.SelectedColors(?:\\s*\\[[^\\]]*\\](?:\\.\\w+)?)?\\s*${assignment}`,'g'))??[]).length===1 && (suggestCode.match(/r\.SelectedColors\s*=\s*append\(r\.SelectedColors,/g)??[]).length===1 && (suggestCode.match(/SelectedColors:\s*\[\]SuggestedColor\{\}/g)??[]).length===1 && (suggestCode.match(/\blen\s*\(\s*r\.SelectedColors\s*\)/g)??[]).length===2 && !/&\s*r\.SelectedColors\b|\bcopy\s*\(\s*r\.SelectedColors\b/.test(suggestCode), 'SelectedColors has an extra write, element mutation, alias, helper/copy use, overwrite, slice, clear, or append path')
    expect((suggestCode.match(/\br\b/g)??[]).length===28 && (suggestCode.match(/\b(?:\w+\.)*\w+\s*\(\s*r\s*\)/g)??[]).length===2 && (suggestCode.match(/\bsemanticHash\s*\(\s*r\s*\)/g)??[]).length===2, 'Result is passed to an unverified helper that could mutate SelectedColors backing storage')
    expect((suggestCode.match(new RegExp(`(?:^|\\n)\\s*r\\s*${assignment}`,'g'))??[]).length===1 && !/&r\b/.test(suggestCode) && /return r, nil\s*\}$/.test(suggestCode), 'Suggest result is aliased, replaced, or not returned intact')
    const structuralLoop=goBlock(suggest,'for _, c := range input.StructuralColors')
    const structuralCode=goLexicalMask(structuralLoop)
    expect(structuralCode.includes('r.OmittedColors = append(r.OmittedColors') && !structuralCode.includes('SelectedColors'), 'structural executable code no longer flows exclusively to omitted colors')
  }
  function replaceOnce(source: string, before: string, after: string): string {
    const first=source.indexOf(before); expect(first >= 0 && source.indexOf(before,first+before.length) < 0, `mutation target must be unique: ${before}`)
    return source.slice(0,first)+after+source.slice(first+before.length)
  }
  function fields(name: string): string[] {
    const match = contractSource.match(new RegExp(`type ${name} struct \\{([\\s\\S]*?)\\n\\}`))
    expect(Boolean(match), `missing Go struct ${name}`)
    return match![1].trim().split('\n').map((line) => {
      const field = line.trim().match(/^(\w+)\s+([^`]+?)\s+`json:"([^"]+)"`$/)
      expect(Boolean(field), `unparsed ${name} field: ${line}`)
      return `${field![1]}|${field![2].trim()}|${field![3]}`
    })
  }
  const expected: Record<string, string[]> = {
    AnalyzeResponse:['ContractVersion|string|contract_version','AnalysisID|string|analysis_id','Image|ImageFacts|image','ColorSuggestions|[]ColorSuggestion|color_suggestions','StructuralColors|[]ColorSuggestion|structural_color_suggestions','Draft|AssistantDraft|draft','Warnings|[]WarningFinding|warnings','AlgorithmVersion|string|algorithm_version'],
    ImageFacts:['Format|string|format','EncodedBytes|int64|encoded_bytes','Width|int|width','Height|int|height','PixelCount|int64|pixel_count','HasTransparency|bool|has_transparency','AlphaBackdrop|string|alpha_backdrop','SHA256|string|sha256'],
    ColorSuggestion:['ID|string|id','Hex|string|hex','PixelCount|int64|pixel_count','Fraction|float64|fraction','Producer|string|producer','AlgorithmVersion|string|algorithm_version','ReasonCodes|[]string|reason_codes','AmbiguityGroup|string|ambiguity_group,omitempty'],
    DraftColor:['ID|string|id','Hex|string|hex','Label|string|label,omitempty','Order|int|order','Source|SuggestionSource|source','State|SuggestionState|state'],
    DraftAccessibility:['ColorblindSafe|bool|colorblind_safe','PrintFriendly|bool|print_friendly','DarkBackground|bool|dark_background'],
    DraftChartApplicability:['ChartType|string|chart_type','Suitability|string|suitability','Notes|string|notes,omitempty'],
    DraftPreviewCase:['ChartType|string|chart_type','TemplateID|string|template_id','TemplateVersion|int|template_version','SchemaVersion|int|schema_version','ColorRoles|json.RawMessage|color_roles','PreviewConfig|json.RawMessage|preview_config','SeedStrategy|string|seed_strategy','SeedValue|*int|seed_value,omitempty'],
    SuggestionProvenance:['Path|string|path','Source|SuggestionSource|source','State|SuggestionState|state','Producer|string|producer','AlgorithmVersion|string|algorithm_version','ReasonCodes|[]string|reason_codes','SuggestedValue|json.RawMessage|suggested_value','AmbiguityGroup|string|ambiguity_group,omitempty'],
    WarningFinding:['ID|string|id','Code|string|code','Path|string|path,omitempty','Message|string|message','Policy|string|policy','PaletteID|string|palette_id,omitempty','Params|json.RawMessage|params','RequiresAcknowledgment|bool|requires_acknowledgment'],
    FieldIssue:['Path|string|path','Code|string|code','Message|string|message'],
    Problem:['Code|ProblemCode|code','Message|string|message','Retryable|bool|retryable','Issues|[]FieldIssue|issues,omitempty']
  }
  expected.AssistantDraft = ['ContractVersion|string|contract_version','Revision|uint64|revision','Name|string|name','Type|string|type','Colors|[]DraftColor|colors','ChartApplicability|[]DraftChartApplicability|chart_applicability','Disciplines|[]string|disciplines','UseCases|[]string|use_cases','AvoidCases|[]string|avoid_cases','Tags|[]string|tags','Accessibility|DraftAccessibility|accessibility','SourceType|string|source_type','SourceNote|string|source_note','PreviewCases|[]DraftPreviewCase|preview_cases','Provenance|[]SuggestionProvenance|provenance']
  for (const [name, signature] of Object.entries(expected)) expect(JSON.stringify(fields(name)) === JSON.stringify(signature), `${name} Go wire signature drifted`)
  expect(/AnalyzePath\s+= "\/api\/admin\/palette-assistant\/analyze"/.test(contractSource), 'AnalyzePath drifted')
  expect(/AnalyzeImageField\s+= "image"/.test(contractSource), 'AnalyzeImageField drifted')
  expect(/ContractVersion = "palette-assistant\.v1"/.test(contractSource), 'contract version drifted')
  const problemRows: Array<[string, string, number, boolean]> = [
    ['ErrAuthenticationRequired','AUTHENTICATION_REQUIRED',401,false],['ErrAdminRequired','ADMIN_REQUIRED',403,false],['ErrMalformedRequest','MALFORMED_REQUEST',400,false],
    ['ErrMissingImage','MISSING_IMAGE',400,false],['ErrMultipleImages','MULTIPLE_IMAGES',400,false],['ErrRequestTooLarge','REQUEST_TOO_LARGE',413,false],
    ['ErrUnsupportedMediaType','UNSUPPORTED_MEDIA_TYPE',415,false],['ErrImageSignatureMismatch','IMAGE_SIGNATURE_MISMATCH',415,false],['ErrImageDecodeFailed','IMAGE_DECODE_FAILED',422,false],
    ['ErrImageDimensionsExceeded','IMAGE_DIMENSIONS_EXCEEDED',422,false],['ErrImagePixelLimitExceeded','IMAGE_PIXEL_LIMIT_EXCEEDED',422,false],['ErrAnalysisTimeout','ANALYSIS_TIMEOUT',504,true],
    ['ErrAnalysisOverloaded','ANALYSIS_OVERLOADED',503,true],['ErrRequestCancelled','REQUEST_CANCELLED',499,true],['ErrInternalAnalysisFailure','INTERNAL_ANALYSIS_FAILURE',500,true]
  ]
  const constantBlock = contractSource.match(/const \(\n\s*ErrAuthenticationRequired[\s\S]*?\n\)/)
  expect(Boolean(constantBlock), 'Problem constant block must parse')
  const constants = new Map([...constantBlock![0].matchAll(/^\s*(Err\w+)\s+ProblemCode = "([A-Z_]+)"$/gm)].map((match) => [match[1], match[2]]))
  expect(constants.size === 32, 'every ProblemCode constant must parse')
  expect(new Set(constants.values()).size === constants.size, 'Problem wire codes must be unique')
  for (const [name, wire] of problemRows) expect(constants.get(name) === wire, `${name} wire code drifted`)

  const specsBlock = contractSource.match(/var ProblemSpecs = \[\.\.\.\]ProblemSpec\{([\s\S]*?)\n\}/)
  expect(Boolean(specsBlock), 'ProblemSpecs block must parse')
  const parsedSpecs = [...specsBlock![1].matchAll(/^\s*\{(Err\w+), (\d+), (true|false), (true|false), (true|false), (true|false)\},$/gm)]
    .map((match) => ({ name:match[1],status:Number(match[2]),retryable:match[3]==='true',analyze:match[4]==='true',validate:match[5]==='true',create:match[6]==='true' }))
  expect(parsedSpecs.length === 32, 'every ProblemSpecs row must parse')
  const analyzeSpecs = parsedSpecs.filter((spec) => spec.analyze)
  expect(JSON.stringify(analyzeSpecs.map((spec) => [spec.name,spec.status,spec.retryable])) === JSON.stringify(problemRows.map(([name,_wire,status,retryable]) => [name,status,retryable])), 'Go Analyze ProblemSpecs projection drifted')
  const frontendSpecs = Object.entries(ANALYZE_PROBLEM_SPECS).map(([wire,spec]) => [wire,spec.status,spec.retryable])
  expect(JSON.stringify(frontendSpecs) === JSON.stringify(problemRows.map(([_name,wire,status,retryable]) => [wire,status,retryable])), 'frontend runtime Analyze Problem map drifted')
  expect(/AlgorithmVersion = "deterministic-image-analysis\.v1"/.test(analyzerSource), 'analyzer identity drifted')
  expect(/PolicyVersion\s+= "deterministic-palette-suggestion\.v1"/.test(suggestionSource), 'suggestion policy identity drifted')
  expect(/func suggestionID\(version, classification, value string\) string \{\s*sum := sha256\.Sum256\(\[\]byte\(version \+ "\|" \+ classification \+ "\|" \+ value\)\)\s*return "color-" \+ hex\.EncodeToString\(sum\[:8\]\)\s*\}/.test(analyzerSource), 'ColorSuggestion ID projection drifted')
  expect(/func stableOrder\(items \[\]ColorEvidence\)[\s\S]*?items\[i\]\.PixelCount > items\[j\]\.PixelCount[\s\S]*?items\[i\]\.Hex < items\[j\]\.Hex/.test(analyzerSource), 'ColorSuggestion ordering drifted')
  expect(analyzerSource.includes('item.Classification, item.ReasonCodes = "data"') && analyzerSource.includes('item.Classification, item.ReasonCodes = "structural"') && analyzerSource.includes('suggestionID(a.config.AlgorithmVersion, item.Classification, item.Hex)'), 'ColorSuggestion classifications drifted')
  maximumColorsChain(suggestionSource)
  expect(analyzeServiceSource.includes('uuid.MustParse("b8264e96-9bca-4f49-a795-12397ba69e22")'), 'DraftColor UUID namespace drifted')
  expect(/func draftColorID\(algorithmVersion, imageSHA256, normalizedHex string, occurrence int\)[\s\S]*?json:"algorithm_version"[\s\S]*?json:"image_sha256"[\s\S]*?json:"normalized_hex"[\s\S]*?json:"occurrence_index"[\s\S]*?figjcs\.Canonicalize\(name\)[\s\S]*?uuid\.NewSHA1\(draftColorNamespace, canonical\)/.test(analyzeServiceSource), 'DraftColor UUIDv5 projection drifted')
  expect(/occurrence := occurrences\[source\.Hex\][\s\S]*?draftColorID\(algorithmVersion, imageSHA256, source\.Hex, occurrence\)[\s\S]*?occurrences\[source\.Hex\] = occurrence \+ 1/.test(analyzeServiceSource), 'DraftColor occurrence projection drifted')
  const analyzerAnalyze=goFunction(analyzerSource,'func (a *Analyzer) Analyze(')
  const analyzerDecode=goFunction(analyzerSource,'func (a *Analyzer) analyze(')
  const analyzerExtract=goFunction(analyzerSource,'func (a *Analyzer) extract(')
  expect(analyzerAnalyze.includes('a.analyze(ctx, data, declaredMIME)') && analyzerDecode.includes('return a.extract(ctx, data, decoded, detected, decodedConfig.Width, decodedConfig.Height)'), 'production Analyze-to-extract call path drifted')
  expect(analyzerExtract.indexOf('stableOrder(colors)') < analyzerExtract.indexOf('for _, item := range colors') && analyzerExtract.indexOf('stableOrder(excluded)') < analyzerExtract.indexOf('for _, item := range colors') && analyzerExtract.includes('suggestionID(a.config.AlgorithmVersion, item.Classification, item.Hex)'), 'production sorting-to-suggestion projection call path drifted')
  const suggest=goFunction(suggestionSource,'func (e *Engine) Suggest(')
  const suggestExecutable=goLexicalMask(suggest)
  expect(/for i, c := range input\.ColorSuggestions \{[\s\S]*?if i < e\.policy\.MaximumColors \{[\s\S]*?r\.SelectedColors = append\(r\.SelectedColors/.test(suggestExecutable), 'production first-N data truncation call path drifted')
  expect(/for _, c := range input\.StructuralColors \{[\s\S]*?r\.OmittedColors = append/.test(suggestExecutable) && !/for _, c := range input\.StructuralColors \{[\s\S]*?r\.SelectedColors = append/.test(suggestExecutable), 'structural colors entered the selected Draft input')
  const serviceAnalyze=goFunction(analyzeServiceSource,'func (s *Service) Analyze(')
  const assemble=goFunction(analyzeServiceSource,'func assembleResponse(')
  const projectDraftSource=goFunction(analyzeServiceSource,'func projectDraft(')
  expect(serviceAnalyze.includes('assembleResponse(analysis, suggestion, s.newID())') && assemble.includes('projectDraft(analysis, suggestion)') && projectDraftSource.includes('projectDraftColors(suggestion.SourceAnalyzerVersion, analysis.Image.SHA256, suggestion.SelectedColors)'), 'production Analyze-to-selected-data Draft call path drifted')
  const newService=goFunction(analyzeServiceSource,'func NewService() *Service')
  expect(newService.includes('suggester: palettesuggestion.New()') && serviceAnalyze.includes('s.suggester.Suggest(ctx, analysis)'), 'production Service does not use the verified Engine constructor/Suggest path')
  const mutations: Array<[string,string]> = [
    ['adjacent panic before data loop',replaceOnce(suggestionSource,'\n\tfor i, c := range input.ColorSuggestions {','\n\tpanic("adversarial drift")\n\tfor i, c := range input.ColorSuggestions {')],
    ['unmonitored helper before data loop',replaceOnce(suggestionSource,'\n\tfor i, c := range input.ColorSuggestions {','\n\thelper()\n\tfor i, c := range input.ColorSuggestions {')],
    ['discarded helper result before data loop',replaceOnce(suggestionSource,'\n\tfor i, c := range input.ColorSuggestions {','\n\t_ = helper()\n\tfor i, c := range input.ColorSuggestions {')],
    ['deferred helper before data loop',replaceOnce(suggestionSource,'\n\tfor i, c := range input.ColorSuggestions {','\n\tdefer helper()\n\tfor i, c := range input.ColorSuggestions {')],
    ['goroutine helper before data loop',replaceOnce(suggestionSource,'\n\tfor i, c := range input.ColorSuggestions {','\n\tgo helper()\n\tfor i, c := range input.ColorSuggestions {')],
    ['helper result binding before data loop',replaceOnce(suggestionSource,'\n\tfor i, c := range input.ColorSuggestions {','\n\tx := helper()\n\tfor i, c := range input.ColorSuggestions {')],
    ['early concrete return before data loop',replaceOnce(suggestionSource,'\n\tfor i, c := range input.ColorSuggestions {','\n\treturn Result{}, nil\n\tfor i, c := range input.ColorSuggestions {')],
    ['early Draft return intent before data loop',replaceOnce(suggestionSource,'\n\tfor i, c := range input.ColorSuggestions {','\n\treturn Draft{}\n\tfor i, c := range input.ColorSuggestions {')],
    ['conditional panic before data loop',replaceOnce(suggestionSource,'\n\tfor i, c := range input.ColorSuggestions {','\n\tif adversarialCondition { panic("adversarial drift") }\n\tfor i, c := range input.ColorSuggestions {')],
    ['loop helper before data loop',replaceOnce(suggestionSource,'\n\tfor i, c := range input.ColorSuggestions {','\n\tfor adversarialCondition { helper() }\n\tfor i, c := range input.ColorSuggestions {')],
    ['switch helper before data loop',replaceOnce(suggestionSource,'\n\tfor i, c := range input.ColorSuggestions {','\n\tswitch adversarialValue { case adversarialCase: helper() }\n\tfor i, c := range input.ColorSuggestions {')],
    ['mid-projection helper after selected append',replaceOnce(suggestionSource,'Authoritative: false})\n\t\t} else {','Authoritative: false})\n\t\t\thelper()\n\t\t} else {')],
    ['post-accumulator helper before digest binding',replaceOnce(suggestionSource,'\n\tr.SuggestionSetID = stableID(','\n\thelper()\n\tr.SuggestionSetID = stableID(')],
    ['selected accumulator clear',replaceOnce(suggestionSource,'\n\tfor _, c := range input.StructuralColors {','\n\tr.SelectedColors = nil\n\tfor _, c := range input.StructuralColors {')],
    ['omitted accumulator clear',replaceOnce(suggestionSource,'\n\tfor _, c := range input.StructuralColors {','\n\tr.OmittedColors = nil\n\tfor _, c := range input.StructuralColors {')],
    ['selected accumulator reslice',replaceOnce(suggestionSource,'\n\tfor _, c := range input.StructuralColors {','\n\tr.SelectedColors = r.SelectedColors[:0]\n\tfor _, c := range input.StructuralColors {')],
    ['omitted accumulator extra append',replaceOnce(suggestionSource,'\n\tr.SuggestionSetID = stableID(','\n\tr.OmittedColors = append(r.OmittedColors, OmittedColor{})\n\tr.SuggestionSetID = stableID(')],
    ['canonical chain retained after panic decoy',replaceOnce(suggestionSource,'\n\tfor i, c := range input.ColorSuggestions {','\n\tpanic("adversarial drift") // canonical selected/omitted chain remains below\n\tfor i, c := range input.ColorSuggestions {')],
    ['line-comment decoy followed by executable drift',replaceOnce(suggestionSource,'\n\tfor i, c := range input.ColorSuggestions {','\n\t// panic("non-executable decoy")\n\thelper()\n\tfor i, c := range input.ColorSuggestions {')],
    ['block-comment decoy followed by executable drift',replaceOnce(suggestionSource,'\n\tfor i, c := range input.ColorSuggestions {','\n\t/* helper() non-executable decoy */ panic("adversarial drift")\n\tfor i, c := range input.ColorSuggestions {')],
    ['New() literal 8',replaceOnce(suggestionSource,'MaximumColors: MaximumColors}}','MaximumColors: 8}}')],
    ['New() literal 12',replaceOnce(suggestionSource,'MaximumColors: MaximumColors}}','MaximumColors: 12}}')],
    ['guard removed',replaceOnce(suggestionSource,'if e == nil || e.policy != (Policy{Version: PolicyVersion, MinimumColors: MinimumColors, MaximumColors: MaximumColors}) {','if e == nil {')],
    ['guard wrong constant',replaceOnce(suggestionSource,'e.policy != (Policy{Version: PolicyVersion, MinimumColors: MinimumColors, MaximumColors: MaximumColors})','e.policy != (Policy{Version: PolicyVersion, MinimumColors: MinimumColors, MaximumColors: MinimumColors})')],
    ['first-N hard-coded 8',replaceOnce(suggestionSource,'if i < e.policy.MaximumColors {','if i < 8 {')],
    ['first-N wrong policy field',replaceOnce(suggestionSource,'if i < e.policy.MaximumColors {','if i < e.policy.MinimumColors {')],
    ['SelectedColors append removed',replaceOnce(suggestionSource,'r.SelectedColors = append(r.SelectedColors,','r.OmittedColors = append(r.OmittedColors,')],
    ['structural enters SelectedColors',replaceOnce(suggestionSource,'for _, c := range input.StructuralColors {\n\t\tr.OmittedColors = append(r.OmittedColors,','for _, c := range input.StructuralColors {\n\t\tr.SelectedColors = append(r.SelectedColors,')],
    ['post-loop overwrite',replaceOnce(suggestionSource,'\n\tfor _, c := range input.StructuralColors {','\n\tr.SelectedColors = input.ColorSuggestions\n\tfor _, c := range input.StructuralColors {')],
    ['post-loop slice truncation',replaceOnce(suggestionSource,'\n\tfor _, c := range input.StructuralColors {','\n\tr.SelectedColors = r.SelectedColors[:8]\n\tfor _, c := range input.StructuralColors {')],
    ['post-loop clear',replaceOnce(suggestionSource,'\n\tfor _, c := range input.StructuralColors {','\n\tr.SelectedColors = nil\n\tfor _, c := range input.StructuralColors {')],
    ['secondary continue gate',replaceOnce(suggestionSource,'for i, c := range input.ColorSuggestions {\n\t\tif i < e.policy.MaximumColors {','for i, c := range input.ColorSuggestions {\n\t\tif i >= 8 { continue }\n\t\tif i < e.policy.MaximumColors {')],
    ['secondary break gate',replaceOnce(suggestionSource,'for i, c := range input.ColorSuggestions {\n\t\tif i < e.policy.MaximumColors {','for i, c := range input.ColorSuggestions {\n\t\tif i == 8 { break }\n\t\tif i < e.policy.MaximumColors {')],
    ['second data append',replaceOnce(suggestionSource,'\n\t\tif i < e.policy.MaximumColors {','\n\t\tr.SelectedColors = append(r.SelectedColors, SuggestedColor{})\n\t\tif i < e.policy.MaximumColors {')],
    ['structural secondary append',replaceOnce(suggestionSource,'for _, c := range input.StructuralColors {\n\t\tr.OmittedColors = append(r.OmittedColors,','for _, c := range input.StructuralColors {\n\t\tr.SelectedColors = append(r.SelectedColors, SuggestedColor{})\n\t\tr.OmittedColors = append(r.OmittedColors,')],
    ['result reconstructed',replaceOnce(suggestionSource,'\n\treturn r, nil','\n\tr = Result{SelectedColors: otherColors}\n\treturn r, nil')],
    ['comment-spoofed integrity guard',replaceOnce(suggestionSource,'if e == nil || e.policy != (Policy{Version: PolicyVersion, MinimumColors: MinimumColors, MaximumColors: MaximumColors}) {','/* if e == nil || e.policy != (Policy{Version: PolicyVersion, MinimumColors: MinimumColors, MaximumColors: MaximumColors}) { return Result{}, ErrInvalidEngine } */\n\tif e == nil {')],
    ['comment-spoofed first-N branch',replaceOnce(suggestionSource,'if i < e.policy.MaximumColors {','// if i < e.policy.MaximumColors {\n\t\tif true {')],
    ['policy MaximumColors rewrite',replaceOnce(suggestionSource,'\n\tfor i, c := range input.ColorSuggestions {','\n\te.policy.MaximumColors = 8\n\tfor i, c := range input.ColorSuggestions {')],
    ['input ColorSuggestions pre-slice',replaceOnce(suggestionSource,'\n\tfor i, c := range input.ColorSuggestions {','\n\tinput.ColorSuggestions = input.ColorSuggestions[:8]\n\tfor i, c := range input.ColorSuggestions {')],
    ['range index reassignment',replaceOnce(suggestionSource,'for i, c := range input.ColorSuggestions {\n\t\tif i < e.policy.MaximumColors {','for i, c := range input.ColorSuggestions {\n\t\ti = 8\n\t\tif i < e.policy.MaximumColors {')],
    ['SelectedColors element-field mutation',replaceOnce(suggestionSource,'\n\tfor _, c := range input.StructuralColors {','\n\tr.SelectedColors[0].Hex = "#000000"\n\tfor _, c := range input.StructuralColors {')],
    ['SelectedColors slice-alias mutation',replaceOnce(suggestionSource,'\n\tfor _, c := range input.StructuralColors {','\n\talias := r.SelectedColors\n\talias[0] = SuggestedColor{}\n\tfor _, c := range input.StructuralColors {')],
    ['policy multiply assignment',replaceOnce(suggestionSource,'\n\tfor i, c := range input.ColorSuggestions {','\n\te.policy.MaximumColors *= 0\n\tfor i, c := range input.ColorSuggestions {')],
    ['whole input rewrite',replaceOnce(suggestionSource,'\n\tfor i, c := range input.ColorSuggestions {','\n\tinput = truncateInput(input)\n\tfor i, c := range input.ColorSuggestions {')],
    ['Engine helper mutation',replaceOnce(suggestionSource,'\n\tfor i, c := range input.ColorSuggestions {','\n\tmutateEngine(e)\n\tfor i, c := range input.ColorSuggestions {')],
    ['current range color mutation',replaceOnce(suggestionSource,'for i, c := range input.ColorSuggestions {\n\t\tif i < e.policy.MaximumColors {','for i, c := range input.ColorSuggestions {\n\t\tc.Hex = "#000000"\n\t\tif i < e.policy.MaximumColors {')],
    ['current range color passed to omitted helper',replaceOnce(
      suggestionSource,
      'OmittedColor{Hex: c.Hex, PixelCount: c.PixelCount, Fraction: c.Fraction, Classification: "data", ReasonCodes: []string{ReasonTruncated}}',
      'OmittedColor{Hex: driftColor(c).Hex, PixelCount: c.PixelCount, Fraction: c.Fraction, Classification: "data", ReasonCodes: []string{ReasonTruncated}}'
    )+'\nfunc driftColor(c paletteassistant.ColorSuggestion) paletteassistant.ColorSuggestion { c.Hex = "#000000"; return c }\n'],
    ['parenthesized current range color passed to omitted helper',replaceOnce(
      suggestionSource,
      'OmittedColor{Hex: c.Hex, PixelCount: c.PixelCount, Fraction: c.Fraction, Classification: "data", ReasonCodes: []string{ReasonTruncated}}',
      'OmittedColor{Hex: driftColor((c)).Hex, PixelCount: c.PixelCount, Fraction: c.Fraction, Classification: "data", ReasonCodes: []string{ReasonTruncated}}'
    )+'\nfunc driftColor(c paletteassistant.ColorSuggestion) paletteassistant.ColorSuggestion { c.Hex = "#000000"; return c }\n'],
    ['scalar helper projection',replaceOnce(
      suggestionSource,
      'OmittedColor{Hex: c.Hex, PixelCount: c.PixelCount, Fraction: c.Fraction, Classification: "data", ReasonCodes: []string{ReasonTruncated}}',
      'OmittedColor{Hex: driftHex(c), PixelCount: c.PixelCount, Fraction: c.Fraction, Classification: "data", ReasonCodes: []string{ReasonTruncated}}'
    )+'\nfunc driftHex(c paletteassistant.ColorSuggestion) string { return "#000000" }\n'],
    ['method call projection',replaceOnce(
      suggestionSource,
      'OmittedColor{Hex: c.Hex, PixelCount: c.PixelCount, Fraction: c.Fraction, Classification: "data", ReasonCodes: []string{ReasonTruncated}}',
      'OmittedColor{Hex: driftSuggestion(c).NormalizedHex(), PixelCount: c.PixelCount, Fraction: c.Fraction, Classification: "data", ReasonCodes: []string{ReasonTruncated}}'
    )+'\ntype driftSuggestion paletteassistant.ColorSuggestion\nfunc (c driftSuggestion) NormalizedHex() string { return c.Hex }\n'],
    ['anonymous function projection',replaceOnce(
      suggestionSource,
      'OmittedColor{Hex: c.Hex, PixelCount: c.PixelCount, Fraction: c.Fraction, Classification: "data", ReasonCodes: []string{ReasonTruncated}}',
      'OmittedColor{Hex: func(x paletteassistant.ColorSuggestion) string { return x.Hex }(c), PixelCount: c.PixelCount, Fraction: c.Fraction, Classification: "data", ReasonCodes: []string{ReasonTruncated}}'
    )],
    ['non-Hex field helper projection',replaceOnce(
      suggestionSource,
      'OmittedColor{Hex: c.Hex, PixelCount: c.PixelCount, Fraction: c.Fraction, Classification: "data", ReasonCodes: []string{ReasonTruncated}}',
      'OmittedColor{Hex: c.Hex, PixelCount: driftPixelCount(c), Fraction: c.Fraction, Classification: "data", ReasonCodes: []string{ReasonTruncated}}'
    )+'\nfunc driftPixelCount(c paletteassistant.ColorSuggestion) int64 { return 0 }\n'],
    ['omitted Hex slice projection',replaceOnce(suggestionSource,'OmittedColor{Hex: c.Hex, PixelCount: c.PixelCount, Fraction: c.Fraction, Classification: "data", ReasonCodes: []string{ReasonTruncated}}','OmittedColor{Hex: c.Hex[:], PixelCount: c.PixelCount, Fraction: c.Fraction, Classification: "data", ReasonCodes: []string{ReasonTruncated}}')],
    ['omitted Hex prefix concatenation projection',replaceOnce(suggestionSource,'OmittedColor{Hex: c.Hex, PixelCount: c.PixelCount, Fraction: c.Fraction, Classification: "data", ReasonCodes: []string{ReasonTruncated}}','OmittedColor{Hex: "" + c.Hex, PixelCount: c.PixelCount, Fraction: c.Fraction, Classification: "data", ReasonCodes: []string{ReasonTruncated}}')],
    ['omitted PixelCount arithmetic projection',replaceOnce(suggestionSource,'OmittedColor{Hex: c.Hex, PixelCount: c.PixelCount, Fraction: c.Fraction, Classification: "data", ReasonCodes: []string{ReasonTruncated}}','OmittedColor{Hex: c.Hex, PixelCount: c.PixelCount + 0, Fraction: c.Fraction, Classification: "data", ReasonCodes: []string{ReasonTruncated}}')],
    ['omitted Fraction arithmetic projection',replaceOnce(suggestionSource,'OmittedColor{Hex: c.Hex, PixelCount: c.PixelCount, Fraction: c.Fraction, Classification: "data", ReasonCodes: []string{ReasonTruncated}}','OmittedColor{Hex: c.Hex, PixelCount: c.PixelCount, Fraction: c.Fraction * 1, Classification: "data", ReasonCodes: []string{ReasonTruncated}}')],
    ['omitted Hex parenthesized projection',replaceOnce(suggestionSource,'OmittedColor{Hex: c.Hex, PixelCount: c.PixelCount, Fraction: c.Fraction, Classification: "data", ReasonCodes: []string{ReasonTruncated}}','OmittedColor{Hex: (c.Hex), PixelCount: c.PixelCount, Fraction: c.Fraction, Classification: "data", ReasonCodes: []string{ReasonTruncated}}')],
    ['omitted Hex suffix concatenation projection',replaceOnce(suggestionSource,'OmittedColor{Hex: c.Hex, PixelCount: c.PixelCount, Fraction: c.Fraction, Classification: "data", ReasonCodes: []string{ReasonTruncated}}','OmittedColor{Hex: c.Hex + "", PixelCount: c.PixelCount, Fraction: c.Fraction, Classification: "data", ReasonCodes: []string{ReasonTruncated}}')],
    ['omitted PixelCount parenthesized projection',replaceOnce(suggestionSource,'OmittedColor{Hex: c.Hex, PixelCount: c.PixelCount, Fraction: c.Fraction, Classification: "data", ReasonCodes: []string{ReasonTruncated}}','OmittedColor{Hex: c.Hex, PixelCount: (c.PixelCount), Fraction: c.Fraction, Classification: "data", ReasonCodes: []string{ReasonTruncated}}')],
    ['omitted Fraction parenthesized projection',replaceOnce(suggestionSource,'OmittedColor{Hex: c.Hex, PixelCount: c.PixelCount, Fraction: c.Fraction, Classification: "data", ReasonCodes: []string{ReasonTruncated}}','OmittedColor{Hex: c.Hex, PixelCount: c.PixelCount, Fraction: (c.Fraction), Classification: "data", ReasonCodes: []string{ReasonTruncated}}')],
    ['omitted Hex conversion projection',replaceOnce(suggestionSource,'OmittedColor{Hex: c.Hex, PixelCount: c.PixelCount, Fraction: c.Fraction, Classification: "data", ReasonCodes: []string{ReasonTruncated}}','OmittedColor{Hex: string(c.Hex), PixelCount: c.PixelCount, Fraction: c.Fraction, Classification: "data", ReasonCodes: []string{ReasonTruncated}}')],
    ['omitted PixelCount unary projection',replaceOnce(suggestionSource,'OmittedColor{Hex: c.Hex, PixelCount: c.PixelCount, Fraction: c.Fraction, Classification: "data", ReasonCodes: []string{ReasonTruncated}}','OmittedColor{Hex: c.Hex, PixelCount: +c.PixelCount, Fraction: c.Fraction, Classification: "data", ReasonCodes: []string{ReasonTruncated}}')],
    ['omitted Fraction division projection',replaceOnce(suggestionSource,'OmittedColor{Hex: c.Hex, PixelCount: c.PixelCount, Fraction: c.Fraction, Classification: "data", ReasonCodes: []string{ReasonTruncated}}','OmittedColor{Hex: c.Hex, PixelCount: c.PixelCount, Fraction: c.Fraction / 1, Classification: "data", ReasonCodes: []string{ReasonTruncated}}')],
    ['direct NormalizedHex method projection',replaceOnce(suggestionSource,'OmittedColor{Hex: c.Hex, PixelCount: c.PixelCount, Fraction: c.Fraction, Classification: "data", ReasonCodes: []string{ReasonTruncated}}','OmittedColor{Hex: c.NormalizedHex(), PixelCount: c.PixelCount, Fraction: c.Fraction, Classification: "data", ReasonCodes: []string{ReasonTruncated}}')],
    ['Result helper mutation',replaceOnce(suggestionSource,'\n\treturn r, nil','\n\tmutateResult(r)\n\treturn r, nil')],
    ['non-current color append projection',replaceOnce(suggestionSource,'SuggestedColor{ID: selectedColorID(e.policy, input.Evidence.OutputSHA256, c), Hex: c.Hex','SuggestedColor{ID: selectedColorID(e.policy, input.Evidence.OutputSHA256, c), Hex: other.Hex')],
    ['decoy canonical literal with incorrect real append',replaceOnce(
      suggestionSource,
      'r.SelectedColors = append(r.SelectedColors, SuggestedColor{ID: selectedColorID(e.policy, input.Evidence.OutputSHA256, c), Hex: c.Hex, PixelCount: c.PixelCount, Fraction: c.Fraction, SourceSuggestionID: c.ID, RuleID: RuleSelectRetained, ReasonCodes: []string{ReasonSelected}, Authoritative: false})',
      'r.SelectedColors = append(r.SelectedColors, SuggestedColor{})\n\t\t\t_ = func() SuggestedColor { return SuggestedColor{ID: selectedColorID(e.policy, input.Evidence.OutputSHA256, c), Hex: c.Hex, PixelCount: c.PixelCount, Fraction: c.Fraction, SourceSuggestionID: c.ID, RuleID: RuleSelectRetained, ReasonCodes: []string{ReasonSelected}, Authoritative: false} }()'
    )],
    ['data classification literal drift',replaceOnce(suggestionSource,'Classification: "data"','Classification: "metadata"')],
    ['categorical value literal drift',replaceOnce(suggestionSource,'Value: "categorical"','Value: "continuous"')],
    ['same-length data classification drift',replaceOnce(suggestionSource,'Classification: "data"','Classification: "meta"')],
    ['data raw-string spelling drift',replaceOnce(suggestionSource,'Classification: "data"','Classification: `data`')],
    ['data escaped interpreted-string spelling drift',replaceOnce(suggestionSource,'Classification: "data"','Classification: "\\x64ata"')],
    ['data concatenated literal drift',replaceOnce(suggestionSource,'Classification: "data"','Classification: "da" + "ta"')],
    ['data parenthesized literal drift',replaceOnce(suggestionSource,'Classification: "data"','Classification: ("data")')],
    ['data classification alias escape',replaceOnce(
      replaceOnce(suggestionSource,'\n\tfor i, c := range input.ColorSuggestions {','\n\tclassification := "data"\n\tfor i, c := range input.ColorSuggestions {'),
      'Classification: "data"','Classification: classification'
    )],
    ['data classification helper escape',replaceOnce(suggestionSource,'Classification: "data"','Classification: canonicalClassification()')],
    ['categorical value closure escape',replaceOnce(suggestionSource,'Value: "categorical"','Value: func() string { return "categorical" }()')],
    ['categorical value container escape',replaceOnce(suggestionSource,'Value: "categorical"','Value: values[0]')],
    ['comment decoy cannot replace data literal',replaceOnce(
      replaceOnce(suggestionSource,'Classification: "data"','Classification: "meta"'),
      '\n\tfor i, c := range input.ColorSuggestions {','\n\t// Classification: "data"\n\tfor i, c := range input.ColorSuggestions {'
    )],
    ['interpreted-string decoy cannot replace data literal',replaceOnce(
      replaceOnce(suggestionSource,'Classification: "data"','Classification: "meta"'),
      '\n\tfor i, c := range input.ColorSuggestions {','\n\t_ = "Classification: \\"data\\""\n\tfor i, c := range input.ColorSuggestions {'
    )],
    ['raw-string decoy cannot replace data literal',replaceOnce(
      replaceOnce(suggestionSource,'Classification: "data"','Classification: "meta"'),
      '\n\tfor i, c := range input.ColorSuggestions {','\n\t_ = `Classification: "data"`\n\tfor i, c := range input.ColorSuggestions {'
    )],
    ['unrelated canonical literal cannot replace data literal',replaceOnce(
      replaceOnce(suggestionSource,'Classification: "data"','Classification: "meta"'),
      '\n\tfor i, c := range input.ColorSuggestions {','\n\t_ = "data"\n\tfor i, c := range input.ColorSuggestions {'
    )],
    ['source pixel fact literal drift',replaceOnce(suggestionSource,'Code: "SOURCE_PIXEL_COUNT"','Code: "SOURCE_PIXELS"')],
    ['retained count fact literal drift',replaceOnce(suggestionSource,'Code: "WP_B2_RETAINED_DATA_COLOR_COUNT"','Code: "WP_B2_DATA_COLOR_COUNT"')],
    ['structural classification literal drift',replaceOnce(suggestionSource,'Classification: "structural"','Classification: "metadata"')],
    ['categorical reason literal drift',replaceOnce(suggestionSource,'[]string{"MULTIPLE_UNORDERED_RETAINED_DATA_COLORS"}','[]string{"ORDERED_RETAINED_DATA_COLORS"}')],
    ['palette type unresolved path literal drift',replaceOnce(suggestionSource,'removeUnresolved(r.UnresolvedDecisions, "/palette_type")','removeUnresolved(r.UnresolvedDecisions, "/type")')]
  ]
  for(const [name,mutated] of mutations) {
    expect(mutated !== suggestionSource, `MaximumColors mutation did not change production source: ${name}`)
    let rejected=false; try { maximumColorsChain(mutated) } catch { rejected=true }
    expect(rejected, `MaximumColors mutation escaped drift guard: ${name}`)
  }
  const lexicalDecoys: Array<[string,string]> = [
    ['line-comment decoy',replaceOnce(suggestionSource,'\n\tfor i, c := range input.ColorSuggestions {','\n\t// c.Hex[:] c.PixelCount + 0 c.Fraction * 1\n\tfor i, c := range input.ColorSuggestions {')],
    ['block-comment decoy',replaceOnce(suggestionSource,'\n\tfor i, c := range input.ColorSuggestions {','\n\t/* c.Hex[:] c.PixelCount + 0 c.Fraction * 1 */\n\tfor i, c := range input.ColorSuggestions {')],
    ['line-comment quote markers',replaceOnce(suggestionSource,'\n\tfor i, c := range input.ColorSuggestions {','\n\t// "different string" `raw marker` \'r\'\n\tfor i, c := range input.ColorSuggestions {')],
    ['block-comment quote markers',replaceOnce(suggestionSource,'\n\tfor i, c := range input.ColorSuggestions {','\n\t/* "different string" `raw marker` \'r\' */\n\tfor i, c := range input.ColorSuggestions {')],
    ['interpreted-string decoy',replaceOnce(suggestionSource,'\n\tfor i, c := range input.ColorSuggestions {','\n\t_ = "c.Hex[:] c.PixelCount + 0 c.Fraction * 1"\n\tfor i, c := range input.ColorSuggestions {')],
    ['raw-string decoy',replaceOnce(suggestionSource,'\n\tfor i, c := range input.ColorSuggestions {','\n\t_ = `c.Hex[:] c.PixelCount + 0 c.Fraction * 1`\n\tfor i, c := range input.ColorSuggestions {')],
    ['rune-safe decoy',replaceOnce(suggestionSource,'\n\tfor i, c := range input.ColorSuggestions {',"\n\t_ = 'c' // c.Hex[:] c.PixelCount + 0 c.Fraction * 1 cannot fit in one Go rune literal\n\tfor i, c := range input.ColorSuggestions {")],
    ['escaped quote and backslash decoy',replaceOnce(suggestionSource,'\n\tfor i, c := range input.ColorSuggestions {','\n\t_ = "panic(\\\"adversarial drift\\\") helper() \\\\ // /*"\n\tfor i, c := range input.ColorSuggestions {')],
    ['comment markers inside raw string',replaceOnce(suggestionSource,'\n\tfor i, c := range input.ColorSuggestions {','\n\t_ = `// panic("adversarial drift") /* helper() */ return Draft{}`\n\tfor i, c := range input.ColorSuggestions {')],
    ['legal escaped rune decoy',replaceOnce(suggestionSource,'\n\tfor i, c := range input.ColorSuggestions {',"\n\t_ = '\\n' // defer helper(); go helper()\n\tfor i, c := range input.ColorSuggestions {")]
  ]
  for (const [name,decoy] of lexicalDecoys) {
    expect(decoy !== suggestionSource, `lexical decoy did not change production source: ${name}`)
    maximumColorsChain(decoy)
  }
  for (const forbidden of ['source_image', 'formal_color_id', 'candidate_id']) {
    const draftBlock = contractSource.slice(contractSource.indexOf('type AssistantDraft struct {'), contractSource.indexOf('func (d AssistantDraft)'))
    expect(!draftBlock.includes(forbidden), `forbidden Draft field appeared: ${forbidden}`)
  }
}

async function isolated(run: () => void | Promise<void>): Promise<void> {
  const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch')
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  try { await run() } finally {
    if (fetchDescriptor) Object.defineProperty(globalThis, 'fetch', fetchDescriptor); else delete (globalThis as any).fetch
    if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor); else delete (globalThis as any).localStorage
  }
}

await isolated(testMultipartAuthAbortAndProjection)
await isolated(testProblemStatuses)
await isolated(testWarningProjection)
await isolated(testCategoricalProposalEligibility)
await isolated(testDeterministicIdentityOrderingAndUniqueness)
await isolated(testMalformedSuccessAndErrorFailClosed)
await isolated(testTransportFailuresPreserveIdentity)
await isolated(testTruncatedDraftProjection)
await isolated(testGoContractDriftBoundary)
