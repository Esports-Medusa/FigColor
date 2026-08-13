import type { AnalyzeResponse, DraftPreviewCase } from '@/api/paletteAssistant'
import { compile } from '@vue/compiler-dom'
import { parse } from '@vue/compiler-sfc'
import * as Vue from 'vue'
import ts from 'typescript'
import workbenchSfcSource from './AdminPaletteAssistantWorkbench.vue?raw'
import routerSourceText from '../../../router/index.ts?raw'
import {
  AnalyzeWarningList, CHART_SUITABILITIES, MAX_ASSISTANT_IMAGE_BYTES, PALETTE_TYPES, PHASE_1_CHART_TYPES, PaletteAssistantWorkbench, addChartApplicability, addDraftPreviewCase, allocateDraftPreviewSeed,
  auditFromAnalyze, confirmCurrentDraft, confirmDraftAbandonment, confirmWorkbenchAbandonment, createInitialState,
  clearDraftPreviewCases, createPaletteAssistantRoute,
  draftFromAnalyze, editChartApplicability, hasPendingCreate, hasUnconfirmedDraft, isCurrentRevisionConfirmed, mutateDraft, protectWorkbenchBeforeUnload, replaceDraftPreviewChart, shouldProtectWorkbenchLeave,
  mutateDraftPreviewCase, newAdminColor, removeChartApplicability, replaceDraftPreviewCases, resetDraftToAnalyze, validateAssistantImage,
  validateDraft, warningOccurrences, canCreateCandidate, createCandidateAndNavigate, issueControlPath, setWarningAcknowledgment, submissionDraft
} from './workbench'

function expect(condition: boolean, message: string): void { if (!condition) throw new Error(message) }

type RenderNode = { type?: unknown; props?: Record<string, unknown> | null; children?: unknown }

function renderWorkbenchTemplate(context: Record<string, unknown>): RenderNode {
  const descriptor = parse(workbenchSfcSource, { filename: 'AdminPaletteAssistantWorkbench.vue' }).descriptor
  expect(Boolean(descriptor.template), 'production Workbench SFC must have a template')
  const { code } = compile(descriptor.template!.content, { mode: 'function', filename: 'AdminPaletteAssistantWorkbench.vue' })
  const render = new Function('Vue', code)(Vue) as (context: Record<string, unknown>) => RenderNode
  return render({
    isDragging: false,
    openFilePicker: () => undefined,
    onDragEnter: () => undefined,
    onDragOver: () => undefined,
    onDragLeave: () => undefined,
    onDrop: () => undefined,
    imageDimensionsLabel: '',
    imageFormatLabel: '',
    pickerActive: false,
    imageReady: false,
    hoverSample: null,
    pickerReadoutStyle: {},
    pickerMessage: '',
    pendingPickedHex: '',
    selectedColorId: null,
    onImagePointerMove: () => undefined,
    hidePickerPreview: () => undefined,
    pickImageColor: () => undefined,
    onSourceImageLoad: () => undefined,
    onSourceImageError: () => undefined,
    togglePicker: () => undefined,
    addPickedColor: () => undefined,
    replaceSelectedColor: () => undefined,
    cancelPickedColor: () => undefined,
    setColorInputRef: () => undefined,
    selectColor: () => undefined,
    setVocabulary: () => undefined,
    showLeaveConfirmation: false,
    leaveConfirmationMessage: '',
    confirmLeave: () => undefined,
    cancelLeave: () => undefined,
    showImageReplacementConfirmation: false,
    confirmImageReplacement: () => undefined,
    cancelImageReplacement: () => undefined,
    ...context
  })
}

function descendants(node: unknown): RenderNode[] {
  if (Array.isArray(node)) return node.flatMap(descendants)
  if (!node || typeof node !== 'object') return []
  const current = node as RenderNode
  const children = Array.isArray(current.children) ? current.children.flatMap(descendants) : []
  return [current, ...children]
}

function nodeText(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(nodeText).join('')
  if (!node || typeof node !== 'object') return ''
  return nodeText((node as RenderNode).children)
}

function sameDescriptor(left: PropertyDescriptor | undefined, right: PropertyDescriptor | undefined): boolean {
  if (!left || !right) return left === right
  return left.configurable === right.configurable && left.enumerable === right.enumerable &&
    left.writable === right.writable && left.value === right.value && left.get === right.get && left.set === right.set
}

async function withGlobalIsolation(run: () => void | Promise<void>): Promise<void> {
  const snapshots: Array<[object, PropertyKey, PropertyDescriptor | undefined]> = [
    [URL, 'createObjectURL', Object.getOwnPropertyDescriptor(URL, 'createObjectURL')],
    [URL, 'revokeObjectURL', Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')],
    [globalThis, 'fetch', Object.getOwnPropertyDescriptor(globalThis, 'fetch')],
    [globalThis, 'localStorage', Object.getOwnPropertyDescriptor(globalThis, 'localStorage')]
  ]
  try {
    await run()
  } finally {
    for (const [target, property, descriptor] of snapshots) {
      if (descriptor) Object.defineProperty(target, property, descriptor)
      else delete (target as Record<PropertyKey, unknown>)[property]
    }
  }
  for (const [target, property, descriptor] of snapshots) {
    expect(sameDescriptor(Object.getOwnPropertyDescriptor(target, property), descriptor), `${String(property)} descriptor must be restored`)
  }
}

function analyzeResponse(variant: 'old' | 'new' = 'old'): AnalyzeResponse {
  const old = variant === 'old'
  const hex = old ? '#112233' : '#000000'
  return {
    contract_version: 'palette-assistant.v1', analysis_id: old ? '123e4567-e89b-42d3-a456-426614174000' : '223e4567-e89b-42d3-a456-426614174000',
    image: { format: 'png', encoded_bytes: 123, width: 2, height: 1, pixel_count: 2, has_transparency: false, alpha_backdrop: '#FFFFFF', sha256: 'a'.repeat(64) },
    color_suggestions: [{ id: old ? 'color-51bd3d4a26033bd9' : 'color-370ebb088749173b', hex, pixel_count: 1, fraction: .5, producer: 'deterministic_extractor', algorithm_version: 'deterministic-image-analysis.v1', reason_codes: ['DETERMINISTIC_PIXEL_SUPPORT'] }],
    structural_color_suggestions: [{ id: 'color-2e8f2aa94cac55f4', hex: '#FFFFFF', pixel_count: 1, fraction: .5, producer: 'deterministic_extractor', algorithm_version: 'deterministic-image-analysis.v1', reason_codes: ['LIKELY_NEUTRAL_STRUCTURAL_COLOR'] }],
    draft: { contract_version: 'palette-assistant.v1', revision: 1, name: '', type: '', colors: [{ id: old ? '2559aff2-2f7b-5f17-9d9f-e505654c4ae5' : '621bec94-c917-5be8-877d-1fcf5bb08e1c', hex, order: 0, source: 'assistant', state: 'unconfirmed' }], chart_applicability: [], disciplines: [], use_cases: [], avoid_cases: [], tags: [], accessibility: { colorblind_safe: false, print_friendly: false, dark_background: false }, source_type: 'figure_extracted', source_note: '', preview_cases: [], provenance: [] },
    warnings: old
      ? [{ id: 'e4460a068dd58fd623166a95a3bc603844eeba409061159c4716987685d11ca3', code: 'HEURISTIC_SUGGESTION_REQUIRES_ADMIN_REVIEW', message: 'Assistant suggestions are heuristic and require Admin review.', policy: 'deterministic-palette-suggestion.v1', params: { producer: 'palettesuggestion' }, requires_acknowledgment: false }]
      : [{ id: '528ef80e640b07175b66da18ac98ac9348666dd04ccd282921c1846cd223c1e1', code: 'TRANSPARENCY_COMPOSITED_TO_WHITE', message: 'Transparency was composited onto white before analysis.', policy: 'deterministic-image-analysis.v1', params: { producer: 'imageanalysis' }, requires_acknowledgment: false }],
    algorithm_version: 'deterministic-image-analysis.v1'
  }
}

function jsonResponse(body: unknown, status = 200): Response { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }) }

async function testAdminBoundaryAndNoWrites(): Promise<void> {
  const component = { name: 'AdminPaletteAssistantWorkbench' }
  const route = createPaletteAssistantRoute(component)
  expect(route.path === '/admin/palette-assistant' && route.meta?.requiresAuth === true && route.meta.requiresAdmin === true, 'production route factory must use the existing Admin guard metadata')
  expect(route.component === component, 'production route factory must preserve the AdminPaletteAssistantWorkbench component')
  const productionWorkbench = { name: 'AdminPaletteAssistantWorkbench.vue' }
  const productionRoute = createPaletteAssistantRoute(productionWorkbench)
  expect(productionRoute.path === '/admin/palette-assistant', 'production route path must remain frozen')
  expect(productionRoute.name === 'admin-palette-assistant', 'production route name must remain frozen')
  expect(productionRoute.meta?.requiresAuth === true && productionRoute.meta.requiresAdmin === true, 'production route must retain Auth and Admin guards')
  expect(productionRoute.component === productionWorkbench, 'production route factory must preserve the real Workbench component identity')

  const routerSource = ts.createSourceFile('src/router/index.ts', routerSourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  let importsWorkbench = false; let exportsFactoryRoute = false; let registersExportedRoute = false; let usesEnvironmentHistory = false
  function inspect(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === '@/views/admin/palette-assistant/AdminPaletteAssistantWorkbench.vue') {
      importsWorkbench = node.importClause?.name?.text === 'AdminPaletteAssistantWorkbench'
    }
    if (ts.isVariableStatement(node)) {
      const exported = node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
      for (const declaration of node.declarationList.declarations) {
        if (exported && ts.isIdentifier(declaration.name) && declaration.name.text === 'adminPaletteAssistantRoute' && declaration.initializer && ts.isCallExpression(declaration.initializer)) {
          exportsFactoryRoute = ts.isIdentifier(declaration.initializer.expression) && declaration.initializer.expression.text === 'createPaletteAssistantRoute' &&
            declaration.initializer.arguments.length === 1 && ts.isIdentifier(declaration.initializer.arguments[0]) && declaration.initializer.arguments[0].text === 'AdminPaletteAssistantWorkbench'
        }
        if (ts.isIdentifier(declaration.name) && declaration.name.text === 'routes' && declaration.initializer && ts.isArrayLiteralExpression(declaration.initializer)) {
          registersExportedRoute = declaration.initializer.elements.some((element) => ts.isIdentifier(element) && element.text === 'adminPaletteAssistantRoute')
        }
      }
    }
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === 'history' && ts.isConditionalExpression(node.initializer)) {
      const calls = [node.initializer.whenTrue, node.initializer.whenFalse].filter(ts.isCallExpression).map((call) => ts.isIdentifier(call.expression) ? call.expression.text : '')
      usesEnvironmentHistory = calls.includes('createMemoryHistory') && calls.includes('createWebHistory')
    }
    ts.forEachChild(node, inspect)
  }
  inspect(routerSource)
  expect(importsWorkbench && exportsFactoryRoute, 'production router must export the factory-created route with the real Workbench SFC import')
  expect(registersExportedRoute, 'production router must register and consume adminPaletteAssistantRoute')
  expect(usesEnvironmentHistory, 'production router must retain memory history for Node and web history for browsers')
}

function testCustomLeaveConfirmation(): void {
  expect(workbenchSfcSource.includes('<ConfirmDialog'), 'Workbench leave protection must use the shared confirmation dialog')
  expect(workbenchSfcSource.includes('confirm-text="Yes, discard"'), 'discard dialog must expose an explicit destructive action')
  expect(workbenchSfcSource.includes('@confirm="confirmLeave"') && workbenchSfcSource.includes('@cancel="cancelLeave"'), 'discard dialog must support confirm and cancel')
  expect(!workbenchSfcSource.includes('window.confirm('), 'route leave must not use the browser-native confirmation dialog')
}

async function testProductionAdminRouteRuntime(): Promise<void> {
  const [{ default: router, adminPaletteAssistantRoute }, { default: AdminPaletteAssistantWorkbench }] = await Promise.all([
    import('@/router'),
    import('./AdminPaletteAssistantWorkbench.vue')
  ])

  expect(adminPaletteAssistantRoute.path === '/admin/palette-assistant', 'real exported Admin route path must remain frozen')
  expect(adminPaletteAssistantRoute.name === 'admin-palette-assistant', 'real exported Admin route name must remain frozen')
  expect(adminPaletteAssistantRoute.meta?.requiresAuth === true, 'real exported Admin route must require authentication')
  expect(adminPaletteAssistantRoute.meta?.requiresAdmin === true, 'real exported Admin route must require Admin role')
  expect(adminPaletteAssistantRoute.component === AdminPaletteAssistantWorkbench, 'real exported Admin route must reference the real Workbench component')

  const registeredMatches = router.getRoutes().filter((record) => record.name === 'admin-palette-assistant')
  expect(registeredMatches.length === 1, 'default production router must register exactly one Admin Palette Assistant route')
  const registered = registeredMatches[0]
  expect(registered.path === adminPaletteAssistantRoute.path, 'registered route path must match the real exported route')
  expect(registered.name === adminPaletteAssistantRoute.name, 'registered route name must match the real exported route')
  expect(registered.meta.requiresAuth === true, 'registered route must preserve authentication metadata')
  expect(registered.meta.requiresAdmin === true, 'registered route must preserve Admin metadata')
  expect(registered.components?.default === AdminPaletteAssistantWorkbench, 'registered route must preserve the real Workbench component')

  const resolved = router.resolve('/admin/palette-assistant')
  const matched = resolved.matched[resolved.matched.length - 1]
  expect(resolved.name === 'admin-palette-assistant', 'path resolution must return the Admin Palette Assistant route name')
  expect(resolved.path === '/admin/palette-assistant', 'path resolution must preserve the Admin Palette Assistant path')
  expect(resolved.meta.requiresAuth === true, 'path resolution must merge authentication metadata')
  expect(resolved.meta.requiresAdmin === true, 'path resolution must merge Admin metadata')
  expect(matched?.name === registered.name && matched.path === registered.path, 'path resolution must match the registered production record')
  expect(matched?.components?.default === AdminPaletteAssistantWorkbench, 'resolved record must preserve the real Workbench component')

  const resolvedByName = router.resolve({ name: 'admin-palette-assistant' })
  const namedMatch = resolvedByName.matched[resolvedByName.matched.length - 1]
  expect(resolvedByName.path === '/admin/palette-assistant', 'named resolution must return the frozen Admin Palette Assistant path')
  expect(namedMatch?.components?.default === AdminPaletteAssistantWorkbench, 'named resolution must preserve the real Workbench component')
}

function testFileValidation(): void {
  expect(validateAssistantImage(new File(['x'], 'x.png', { type: 'image/png' })) === null, 'PNG should be accepted')
  expect(validateAssistantImage(new File(['x'], 'x.jpg', { type: 'image/jpeg' })) === null, 'JPEG should be accepted')
  expect(Boolean(validateAssistantImage(new File(['x'], 'x.gif', { type: 'image/gif' }))), 'unsupported types should be rejected')
  expect(Boolean(validateAssistantImage(new File([], 'x.png', { type: 'image/png' }))), 'empty images should be rejected')
  expect(Boolean(validateAssistantImage(new File([new Uint8Array(MAX_ASSISTANT_IMAGE_BYTES + 1)], 'x.png', { type: 'image/png' }))), 'oversized images should be rejected')
}

function testDraftInitializationAuditAndRevision(): void {
  const response = analyzeResponse()
  const draft = draftFromAnalyze(response)
  const audit = auditFromAnalyze(response)
  response.draft.colors[0].hex = '#999999'
  response.warnings[0].message = 'changed'
  expect(draft.colors[0].hex === '#112233' && draft.colors[0].classification === 'data', 'Draft must be an independent editable copy with data classification')
  expect(audit.warnings[0].message.includes('heuristic') && audit.omittedStructuralColors[0].hex === '#FFFFFF', 'warnings and omitted structural evidence must be immutable copies')
  expect(draft.colors.length === 1 && audit.omittedStructuralColors.length === 1, 'omitted structural colors must not count as retained colors')

  const state = createInitialState(); state.draft = draft; state.latestDraftRevision = 1
  mutateDraft(state, (current) => { current.name = 'Figure palette'; current.type = 'categorical'; current.colors.push(newAdminColor(1)) })
  const firstId = draft.colors[0].id; const addedId = draft.colors[1].id
  expect(draft.revision === 2 && firstId !== addedId, 'mutation must bump revision and added colors need stable unique IDs')
  expect(confirmCurrentDraft(state) && isCurrentRevisionConfirmed(state), 'valid current revision should be confirmable')
  mutateDraft(state, (current) => { current.colors[0].hex = '#AABBCC' })
  expect(draft.colors[0].id === firstId && !isCurrentRevisionConfirmed(state), 'HEX edits must preserve identity and invalidate confirmation')
  mutateDraft(state, (current) => { const [color] = current.colors.splice(0, 1); current.colors.splice(1, 0, color) })
  expect(draft.colors[1].id === firstId && draft.colors[1].order === 1, 'reorder must preserve identity and normalize order')
  mutateDraft(state, (current) => { current.colors[0].classification = 'structural' })
  expect(validateDraft(draft).some((item) => item.code === 'STRUCTURAL_COLOR_RETAINED'), 'data and structural classifications must not be conflated')
  state.audit = audit
  const changedRevision = state.draft.revision
  expect(resetDraftToAnalyze(state) && state.draft.revision === changedRevision + 1 && state.draft.colors[0].hex === '#112233', 'reset must restore immutable Analyze suggestions as a new revision')
}

function draftPreviewCase(colorId: string): DraftPreviewCase {
  return {
    chart_type: 'bar_error', template_id: 'bar_error_v1', template_version: 1, schema_version: 1,
    color_roles: {
      groups: [{ key: 'group', label: 'Group', fill: { source: 'palette', color_id: colorId } }],
      elements: { axis: { source: 'theme', token: 'foreground' }, grid: { source: 'theme', token: 'grid' }, text: { source: 'theme', token: 'muted_foreground' }, error_bar: { source: 'theme', token: 'foreground' }, background: { source: 'theme', token: 'background' } }
    },
    preview_config: { orientation: 'vertical', sample_size: 24, error_type: 'sem', data_pattern: 'mixed' }, seed_strategy: 'stable_id'
  }
}

function testAdminUuidAndPreviewLifecycle(): void {
  const response = analyzeResponse()
  const state = createInitialState(); state.draft = draftFromAnalyze(response); state.latestDraftRevision = 1
  expect(state.draft.colors[0].id === response.draft.colors[0].id && state.draft.colors[0].id[14] === '5', 'Analyze-created UUIDv5 identity must be preserved')
  const first = newAdminColor(1); const second = newAdminColor(2)
  const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  expect(uuidV4.test(first.id) && uuidV4.test(second.id) && first.id !== second.id, 'admin adds must create distinct UUIDv4 IDs with standard version and variant bits')
  mutateDraft(state, (draft) => { draft.colors.push(first, second); draft.name = 'Draft'; draft.type = 'categorical' })
  const firstId = first.id
  mutateDraft(state, (draft) => { const [moved] = draft.colors.splice(1, 1); draft.colors.push(moved) })
  expect(state.draft.colors[2].id === firstId, 'reorder must preserve an admin color UUID')
  mutateDraft(state, (draft) => { draft.colors[2].hex = '#AABBCC' })
  expect(state.draft.colors[2].id === firstId, 'ordinary HEX edit must preserve an admin color UUID')

  replaceDraftPreviewCases(state, [draftPreviewCase(firstId)])
  state.confirmedRevision = state.draft.revision
  const before = state.draft.revision
  mutateDraftPreviewCase(state, (previewCase) => {
    previewCase.preview_config = { orientation: 'horizontal', sample_size: 12, error_type: 'sd', data_pattern: 'treatment_higher' }
    previewCase.seed_strategy = 'fixed'; previewCase.seed_value = 7
  })
  expect(state.draft.revision === before + 1 && state.confirmedRevision === null, 'one compound Preview mutation must increment revision once and clear confirmation')
  const previewReference = ((state.draft.preview_cases[0].color_roles as any).groups[0].fill.color_id)
  mutateDraft(state, (draft) => { draft.colors.splice(draft.colors.findIndex((color) => color.id === firstId), 1) })
  const replacement = newAdminColor(state.draft.colors.length)
  mutateDraft(state, (draft) => { draft.colors.push(replacement) })
  state.draft.name = ''
  const mergedIssues = validateDraft(state.draft)
  expect(replacement.id !== firstId && previewReference === firstId && mergedIssues.some((item) => item.code === 'DRAFT_COLOR_NOT_FOUND'), 'delete-plus-add must create a new UUID and must not rebind the old Preview reference')
  expect(mergedIssues.some((item) => item.path === 'name' && item.code === 'REQUIRED'), 'Preview issues must merge with existing Draft validation issues')
  clearDraftPreviewCases(state)
  expect(state.draft.preview_cases.length === 0, 'clear must replace the authoritative Preview Case array')

  replaceDraftPreviewCases(state, [draftPreviewCase(state.draft.colors[0].id)])
  state.audit = auditFromAnalyze(response)
  expect(resetDraftToAnalyze(state) && state.draft.preview_cases.length === 0, 'reset must discard subsequent Preview mutations')
}

function testAbandonmentGuard(): void {
  const state = createInitialState()
  let prompts = 0
  expect(confirmDraftAbandonment(state, () => { prompts++; return false }), 'no Draft should allow navigation')
  state.draft = draftFromAnalyze(analyzeResponse()); state.latestDraftRevision = 1
  const originalDraft = state.draft; const originalRevision = state.draft.revision
  expect(!confirmDraftAbandonment(state, () => { prompts++; return false }), 'cancel must block navigation for an unconfirmed Draft')
  expect(state.draft === originalDraft && state.draft.revision === originalRevision, 'cancelled navigation must preserve Draft and revision')
  expect(confirmDraftAbandonment(state, () => { prompts++; return true }), 'confirmation must allow navigation')
  state.confirmedRevision = state.draft.revision
  expect(confirmDraftAbandonment(state, () => { prompts++; return false }), 'confirmed Draft must allow navigation without prompting')
  expect(prompts === 2, 'only unconfirmed Draft navigation should prompt')
  state.submission.status = 'creating'
  expect(hasPendingCreate(state) && shouldProtectWorkbenchLeave(state), 'confirmed Draft with pending Create must remain protected')
  let pendingMessage = ''
  expect(!confirmWorkbenchAbandonment(state, (message) => { pendingMessage=message; return false }) && pendingMessage.includes('still in progress'), 'route leave must clearly confirm and block pending Create when declined')
  let prevented = false
  expect(protectWorkbenchBeforeUnload(state, { preventDefault:()=>{prevented=true} }) && prevented, 'beforeunload must activate for a confirmed Draft with pending Create')
}

async function testDuplicateWarningRendering(): Promise<void> {
  const warning = analyzeResponse().warnings[0]
  const occurrences = warningOccurrences([warning, structuredClone(warning)])
  const render = (AnalyzeWarningList.setup as Function)({ warnings: [warning, structuredClone(warning)] }, {})
  const list = render()
  const renderedItems = list.children as Array<{ key: PropertyKey; children: Array<{ children: string } | string> }>
  const messages = renderedItems.map((item) => item.children.map((child) => typeof child === 'string' ? child : child.children).join(''))
  expect(occurrences[0].key !== occurrences[1].key, 'duplicate warning occurrences need unique render keys')
  expect(renderedItems.length === 2 && renderedItems[0].key !== renderedItems[1].key, 'production warning component must render both occurrences with unique VNode keys')
  expect(messages[0].includes(warning.message) && messages[1].includes(warning.message), 'duplicate warnings must both render in original order with messages visible')
  const audit = auditFromAnalyze(analyzeResponse())
  expect(audit.omittedStructuralColors[0].hex === '#FFFFFF' && audit.dataSuggestions[0].hex === '#112233', 'render inputs must keep omitted structural and retained data colors separate')
}

function testProductionEvidenceRendering(): void {
  const response = analyzeResponse()
  response.draft.provenance = [{ path: '/type', source: 'assistant', state: 'unconfirmed', producer: 'deterministic_rule_engine', algorithm_version: 'deterministic-palette-suggestion.v1', reason_codes: ['MULTIPLE_UNORDERED_RETAINED_DATA_COLORS'], suggested_value: 'categorical' }]
  const state = createInitialState(); state.audit = auditFromAnalyze(response); state.draft = draftFromAnalyze(response)
  state.draft.colors[0].hex = '#AABBCC'
  const common = {
    state, fileError: '', issues: [], confirmed: false, PALETTE_TYPES: [], PHASE_1_CHART_TYPES: [], CHART_SUITABILITIES: [], AnalyzeWarningList,
    formatBytes: (value: number) => `${value}`, percent: (value: number) => `${value}`, validHex: () => true,
    workbench: { cancel: () => undefined }, onFileChange: () => undefined, removeImage: () => undefined, runAnalyze: () => undefined,
    setName: () => undefined, setType: () => undefined, setHex: () => undefined, setClassification: () => undefined,
    acceptColor: () => undefined,
    addColor: () => undefined, removeColor: () => undefined, moveColor: () => undefined, addChart: () => undefined,
    removeChart: () => undefined, setChart: () => undefined, resetDraft: () => undefined, confirmDraft: () => undefined,
    setList: () => undefined, setSourceNote: () => undefined, setAccessibility: () => undefined,
    runValidate: () => undefined, acknowledge: () => undefined, runCreate: () => undefined, canCreate: false, creating: false, issueControlPath,
    currentPreview: null, pendingPreviewChart: 'bar_error', previewActionError: '', previewRender: null,
    createPreview: () => undefined, setPendingPreviewChart: () => undefined, removePreview: () => undefined, changePreviewChart: () => undefined, setPreviewJson: () => undefined,
    JSON
  }
  const rendered = descendants(renderWorkbenchTemplate(common))
  const text = nodeText(rendered)
  expect(text.includes('Omitted structural colors') && text.includes('#FFFFFF'), 'production render must show omitted structural color HEX')
  const omitted = rendered.find((node) => node.props?.title === 'deterministic_extractor / deterministic-image-analysis.v1 / LIKELY_NEUTRAL_STRUCTURAL_COLOR')
  expect(Boolean(omitted), 'production render must show omitted structural diagnostics')
  expect(text.includes('Suggestion provenance') && text.includes('/type') && text.includes('categorical'), 'production render must show provenance path and suggested value')
  expect(text.includes('deterministic_rule_engine / deterministic-palette-suggestion.v1') && text.includes('MULTIPLE_UNORDERED_RETAINED_DATA_COLORS'), 'production render must show provenance metadata')
  expect(text.includes('assistant · unconfirmed') && workbenchSfcSource.includes('Accept suggestion'), 'production UI must distinguish assistant suggestion, acceptance, and modification state')
  const strip = rendered.find((node) => node.props?.['aria-label'] === 'Current Draft color order')
  const stripColors = descendants(strip?.children).map((node) => (node.props?.style as { backgroundColor?: string } | undefined)?.backgroundColor).filter(Boolean)
  expect(stripColors.length === 1 && stripColors[0] === '#AABBCC' && !stripColors.includes('#FFFFFF'), 'retained strip must use edited Draft colors and exclude omitted colors')

  state.audit!.omittedStructuralColors = []; state.audit!.provenance = []
  const emptyText = nodeText(descendants(renderWorkbenchTemplate(common)))
  expect(!emptyText.includes('Omitted structural colors') && !emptyText.includes('Suggestion provenance'), 'empty omitted/provenance collections must hide their sections')
}

function testDraftPreviewCreationAndReplacementLifecycle(): void {
  const state = createInitialState(); state.draft = draftFromAnalyze(analyzeResponse()); state.latestDraftRevision = 1
  state.draft.name = 'Preview Draft'; state.draft.type = 'categorical'; state.draft.colors.push(newAdminColor(1)); state.confirmedRevision = 1
  let allocations = 0
  const added = addDraftPreviewCase(state, 'bar_error', () => { allocations++; return 0 })
  expect(added.ok && allocations === 1, 'explicit valid Add must allocate exactly one fixed seed')
  expect(state.draft.preview_cases.length === 1 && state.draft.preview_cases[0].seed_strategy === 'fixed' && state.draft.preview_cases[0].seed_value === 0, 'Add must create one fixed-seed Preview and permit zero')
  expect(state.draft.revision === 2 && state.confirmedRevision === null, 'Add must increment revision once and clear confirmation')
  const seed = state.draft.preview_cases[0].seed_value
  const beforeReplace = state.draft.revision
  expect(replaceDraftPreviewChart(state, 'line_multiseries').ok, 'registered chart replacement should succeed')
  expect(state.draft.revision === beforeReplace + 1 && state.draft.preview_cases[0].seed_value === seed && state.draft.preview_cases[0].template_id === 'line_multiseries_v1', 'chart replacement must be one revision, replace metadata, and preserve seed')
  const beforeEdit = state.draft.revision
  mutateDraftPreviewCase(state, (preview) => { preview.preview_config = { ...preview.preview_config, point_count: 9 } })
  expect(state.draft.revision === beforeEdit + 1 && state.draft.preview_cases[0].seed_value === seed, 'Preview config edit must increment once and preserve seed')
  const beforeRemove = state.draft.revision; clearDraftPreviewCases(state)
  expect(state.draft.revision === beforeRemove + 1 && state.draft.preview_cases.length === 0, 'Remove must increment once and remove Preview and seed')
  expect(addDraftPreviewCase(state, 'bar_error', () => { allocations++; return 7 }).ok && allocations === 2 && state.draft.preview_cases[0].seed_value === 7, 'Remove then Add must allocate one new seed')

  const insufficient = createInitialState(); insufficient.draft = draftFromAnalyze(analyzeResponse()); insufficient.draft.colors = []; insufficient.latestDraftRevision = 1
  let insufficientAllocations = 0
  const failed = addDraftPreviewCase(insufficient, 'bar_error', () => { insufficientAllocations++; return 1 })
  expect(!failed.ok && insufficientAllocations === 0 && insufficient.draft.revision === 1 && insufficient.draft.preview_cases.length === 0, 'insufficient colors must not allocate, mutate, or increment revision')
}

function testSignedSeedAllocatorBoundaries(): void {
  const source = (value: number): Pick<Crypto, 'getRandomValues'> => ({
    getRandomValues<T extends ArrayBufferView | null>(array: T): T {
      ;(array as Int32Array)[0] = value
      return array
    }
  })
  expect(allocateDraftPreviewSeed(source(-2147483648)) === -2147483648, 'secure allocator must preserve signed minimum')
  expect(allocateDraftPreviewSeed(source(0)) === 0, 'secure allocator must permit zero')
  expect(allocateDraftPreviewSeed(source(2147483647)) === 2147483647, 'secure allocator must preserve signed maximum')
}

function testPreviewUiStateContract(): void {
  expect(workbenchSfcSource.includes('No preview added.') && workbenchSfcSource.includes('Add Preview'), 'production UI must expose an explicit absent state and Add action')
  expect(workbenchSfcSource.includes("previewRender?.state === 'svg'") && workbenchSfcSource.includes('v-html="previewRender.markup"'), 'valid state must display real renderer SVG')
  expect(workbenchSfcSource.includes('Preview {{ previewRender.state }}') && workbenchSfcSource.includes('previewRender.issues'), 'invalid, unsupported, and render-error states must be explicit and field-addressable')
  expect(!workbenchSfcSource.includes('<PaletteChartPreview'), 'Draft Preview UI must not use the generic/public fallback component')
  expect(!workbenchSfcSource.includes('watch('), 'Draft Preview UI must not use a watcher that can create a revision loop')
}

function testChartApplicabilityRevisionPath(): void {
  const state = createInitialState(); state.draft = draftFromAnalyze(analyzeResponse()); state.latestDraftRevision = 1
  state.draft.name = 'Chart palette'; state.draft.type = 'categorical'; state.draft.colors.push(newAdminColor(1))
  state.confirmedRevision = 1
  addChartApplicability(state)
  expect(state.draft.revision === 2 && state.confirmedRevision === null, 'add applicability must increment revision and invalidate confirmation')
  state.confirmedRevision = 2; editChartApplicability(state, 0, 'chart_type', 'bar_error')
  expect(state.draft.revision === 3 && state.confirmedRevision === null, 'chart type edit must increment revision and invalidate confirmation')
  state.confirmedRevision = 3; editChartApplicability(state, 0, 'suitability', 'recommended')
  expect(state.draft.revision === 4 && state.confirmedRevision === null, 'suitability edit must increment revision and invalidate confirmation')
  const chartType = state.draft.chart_applicability[0].chart_type; const suitability = state.draft.chart_applicability[0].suitability
  state.confirmedRevision = 4; editChartApplicability(state, 0, 'notes', 'Best for grouped measurements')
  expect(state.draft.chart_applicability[0].notes === 'Best for grouped measurements' && state.draft.revision === 5, 'notes edit must update notes and increment revision exactly once')
  expect(state.confirmedRevision === null && hasUnconfirmedDraft(state), 'notes edit must invalidate confirmation and protect the Draft')
  expect(state.draft.chart_applicability[0].chart_type === chartType && state.draft.chart_applicability[0].suitability === suitability, 'notes edit must preserve other applicability fields')
  addChartApplicability(state); editChartApplicability(state, 1, 'chart_type', 'bar_error')
  expect(validateDraft(state.draft).some((item) => item.code === 'DUPLICATE_CHART_TYPE'), 'duplicate chart types must fail local validation')
  editChartApplicability(state, 1, 'chart_type', 'unsupported')
  expect(validateDraft(state.draft).some((item) => item.code === 'INVALID_CHART_TYPE'), 'unsupported chart types must fail local validation')
  const beforeRemove = state.draft.revision; state.confirmedRevision = beforeRemove; removeChartApplicability(state, 1)
  expect(state.draft.revision === beforeRemove + 1 && state.confirmedRevision === null, 'remove applicability must increment revision and invalidate confirmation')
}

async function testObjectUrlLifecycleAndStateReset(): Promise<void> {
  const created: string[] = []; const revoked: string[] = []
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: () => { const value = `blob:test-${created.length + 1}`; created.push(value); return value } })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: (value: string) => revoked.push(value) })
  const workbench = new PaletteAssistantWorkbench()
  const first = new File(['one'], 'one.png', { type: 'image/png' }); const second = new File(['two'], 'two.png', { type: 'image/png' })
  expect(workbench.selectImage(first) === null, 'valid image selection should succeed')
  workbench.state.draft = draftFromAnalyze(analyzeResponse()); workbench.state.audit = auditFromAnalyze(analyzeResponse()); workbench.state.error = { code: 'OLD', message: 'old', retryable: true }; workbench.state.confirmedRevision = 1; workbench.state.latestDraftRevision = 1
  workbench.selectImage(second)
  expect(revoked[0] === created[0] && workbench.state.draft === null && workbench.state.audit === null && workbench.state.error === null && workbench.state.confirmedRevision === null, 'replacement must revoke old URL and clear all dependent state')
  workbench.removeImage()
  expect(revoked[1] === created[1] && workbench.state.image === null && workbench.state.draft === null && workbench.state.audit === null && workbench.state.error === null && workbench.state.confirmedRevision === null, 'removal must revoke current URL and clear dependent state')
  workbench.selectImage(first); workbench.dispose()
  expect(revoked[2] === created[2], 'dispose must revoke the current URL')
}

async function testAnalyzeSuccessRetryAbortAndStaleProtection(): Promise<void> {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => 'admin-token' } })
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: () => 'blob:analysis' })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => undefined })
  const workbench = new PaletteAssistantWorkbench(); workbench.selectImage(new File(['x'], 'x.png', { type: 'image/png' }))
  let rejectFirst!: (error: unknown) => void
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: () => new Promise<Response>((_, reject) => { rejectFirst = reject }) })
  const cancelled = workbench.analyze(); expect(workbench.state.status === 'analyzing', 'Analyze should expose loading state')
  workbench.cancel(); rejectFirst(new DOMException('aborted', 'AbortError')); await cancelled
  expect(workbench.state.status === 'cancelled' && workbench.state.draft === null && workbench.state.audit === null && workbench.state.latestDraftRevision === 0, 'cancel-late rejection must not create Draft/audit or consume revision')

  let attempts = 0
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: () => { attempts++; return attempts === 1 ? Promise.reject(new TypeError('offline')) : Promise.resolve(jsonResponse(analyzeResponse())) } })
  await workbench.analyze(); expect(workbench.state.status === 'error' && workbench.state.error?.retryable === true, 'transport errors must be retryable and visible')
  await workbench.analyze(); expect(workbench.state.status === 'success' && workbench.state.draft?.colors[0].hex === '#112233' && workbench.state.draft.revision === 1, 'retry success must create the first local revision without rollback')
  mutateDraft(workbench.state, (draft) => { draft.name = 'Edited'; draft.preview_cases = [draftPreviewCase(draft.colors[0].id)] })
  workbench.state.confirmedRevision = 2
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: () => Promise.resolve(jsonResponse(analyzeResponse('new'))) })
  await workbench.analyze()
  expect(workbench.state.draft?.revision === 3 && workbench.state.confirmedRevision === null && workbench.state.draft.colors[0].hex === '#000000' && workbench.state.draft.preview_cases.length === 0, 'Analyze again must allocate old revision + 1, clear confirmation, and discard old Preview Cases')

  let resolveCancelled!: (response: Response) => void
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: () => new Promise<Response>((resolve) => { resolveCancelled = resolve }) })
  const lateCancelled = workbench.analyze(); workbench.cancel(); resolveCancelled(jsonResponse(analyzeResponse())) ; await lateCancelled
  expect(workbench.state.status === 'cancelled' && workbench.state.draft === null && workbench.state.audit === null && workbench.state.confirmedRevision === null && workbench.state.latestDraftRevision === 3, 'cancel-late success must not restore Draft/audit/confirmation or consume revision')

  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: () => Promise.reject(new TypeError('retry me')) })
  await workbench.analyze()
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: () => Promise.resolve(jsonResponse(analyzeResponse('new'))) })
  await workbench.analyze()
  expect(workbench.state.draft?.revision === 4, 'failure followed by retry must continue the monotonic revision source')

  replaceDraftPreviewCases(workbench.state, [draftPreviewCase(workbench.state.draft!.colors[0].id)])
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: () => Promise.reject(new TypeError('failed re-analyze')) })
  await workbench.analyze()
  expect(workbench.state.status === 'error' && workbench.state.draft === null && workbench.state.audit === null, 'failed re-Analyze must leave the old Draft and its Preview Case cleared')
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: () => Promise.resolve(jsonResponse(analyzeResponse('new'))) })
  await workbench.analyze()

  let resolveOld!: (response: Response) => void
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: () => new Promise<Response>((resolve) => { resolveOld = resolve }) })
  replaceDraftPreviewCases(workbench.state, [draftPreviewCase(workbench.state.draft!.colors[0].id)])
  const old = workbench.analyze()
  expect(workbench.state.draft === null && workbench.state.audit === null, 'Analyze request start must clear the old Draft, including its Preview Case')
  workbench.selectImage(new File(['y'], 'y.png', { type: 'image/png' }))
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: () => Promise.resolve(jsonResponse(analyzeResponse('new'))) })
  await workbench.analyze(); const latestRevision = workbench.state.draft?.revision; resolveOld(jsonResponse(analyzeResponse('old'))); await old
  expect(workbench.state.status === 'success' && workbench.state.image?.file.name === 'y.png', 'stale Analyze completion must not overwrite newer image state')
  expect(workbench.state.draft?.colors[0].hex === '#000000' && workbench.state.audit?.analysisId === '223e4567-e89b-42d3-a456-426614174000' && workbench.state.audit.warnings[0].code === 'TRANSPARENCY_COMPOSITED_TO_WHITE' && workbench.state.draft?.revision === latestRevision, 'late old response must not overwrite latest Draft, audit, warnings, or revision')
}

async function testGlobalIsolationRestoresAfterThrow(): Promise<void> {
  const before = [
    Object.getOwnPropertyDescriptor(URL, 'createObjectURL'), Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL'),
    Object.getOwnPropertyDescriptor(globalThis, 'fetch'), Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  ]
  let caught = false
  try {
    await withGlobalIsolation(() => {
      Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: () => 'blob:throw' })
      Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => undefined })
      Object.defineProperty(globalThis, 'fetch', { configurable: true, value: () => Promise.reject(new Error('unused')) })
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => 'throw' } })
      throw new Error('expected isolation probe')
    })
  } catch (error) {
    caught = error instanceof Error && error.message === 'expected isolation probe'
  }
  const after = [
    Object.getOwnPropertyDescriptor(URL, 'createObjectURL'), Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL'),
    Object.getOwnPropertyDescriptor(globalThis, 'fetch'), Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  ]
  expect(caught && before.every((descriptor, index) => sameDescriptor(descriptor, after[index])), 'global descriptors must be restored when an isolated test throws')
}

async function testValidateCreateStateMachine(): Promise<void> {
  Object.defineProperty(globalThis, 'localStorage', { configurable:true, value:{ getItem:()=> 'admin-token' } })
  const workbench = new PaletteAssistantWorkbench()
  const draft = draftFromAnalyze(analyzeResponse())
  draft.revision=1; draft.name='Candidate'; draft.type='categorical'; draft.colors.push({ ...newAdminColor(1), hex:'#445566' }); draft.chart_applicability=[{chart_type:'bar_error',suitability:'best_fit'}]
  workbench.state.draft=draft; workbench.state.latestDraftRevision=1
  expect(confirmCurrentDraft(workbench.state), 'valid Draft must confirm before Validate')
  const warningId='b'.repeat(64)
  let createCalls=0; const keys:string[]=[]; let failCreate=true
  Object.defineProperty(globalThis, 'fetch', { configurable:true, value: async (input:RequestInfo|URL, init?:RequestInit) => {
    const body=JSON.parse(String(init?.body))
    if (String(input).endsWith('/validate')) return jsonResponse({ contract_version:'palette-assistant.v1', normalized_draft:body.draft, validated_revision:1, draft_digest:'a'.repeat(64), validation_policy:'draft-v1', registry_version:'registry', vocabulary_version:'vocabulary', warnings:[{id:warningId,code:'SIMILAR_PALETTE',message:'Similar.',policy:'oklab_d65_v1',params:{mean_distance:.02},requires_acknowledgment:true,palette_id:'p1'}], duplicates:[], similarities:[{id:warningId,palette_id:'p1',score:.02,policy:'oklab_d65_v1',params:{mean_distance:.02}}], validation_receipt:'payload.signature', receipt_expires_at:'2026-08-13T12:00:00Z' })
    createCalls++; keys.push(new Headers(init?.headers).get('Idempotency-Key') || '')
    expect(!('classification' in body.draft.colors[0]), 'frontend-only classification must never cross strict submission boundary')
    if (failCreate) return jsonResponse({code:'CANDIDATE_TRANSACTION_FAILED',message:'Retry.',retryable:true},503)
    return jsonResponse({contract_version:'palette-assistant.v1',receipt_id:'r1',candidate_id:'c1',status:'candidate',preview_case_ids:[],admin_review_path:'/admin/palettes/c1/edit',created_at:'2026-08-13T11:00:00Z',replay:false},201)
  } })
  await workbench.validate()
  expect(workbench.state.submission.validation?.similarities.length===1 && !canCreateCandidate(workbench.state), 'similarity warning must display separately and require acknowledgment')
  setWarningAcknowledgment(workbench.state, warningId, true); expect(canCreateCandidate(workbench.state), 'all warning IDs must be acknowledged')
  await workbench.createCandidate(); expect(workbench.state.submission.status==='create_error' && createCalls===1, 'failed Create must expose retry state')
  const retryKey=keys[0]; failCreate=false
  const first=workbench.createCandidate(); const duplicate=workbench.createCandidate(); expect(await duplicate===null, 'in-flight duplicate click must be ignored'); const receipt=await first
  expect(createCalls===2 && keys[1]===retryKey && /^[0-9a-f-]{36}$/.test(retryKey), 'safe retry must reuse its canonical UUID key')
  expect(receipt?.admin_review_path==='/admin/palettes/c1/edit' && receipt.status==='candidate', 'success must retain CandidateReceipt review destination without publish')
  setWarningAcknowledgment(workbench.state,warningId,false); setWarningAcknowledgment(workbench.state,warningId,true)
  await workbench.createCandidate()
  expect(createCalls===3 && keys[2]!==retryKey,'acknowledgment change must create a new intent with a new Idempotency-Key')
  mutateDraft(workbench.state, (value)=>{ value.name='Changed' })
  expect(workbench.state.submission.validation===null && workbench.state.submission.acknowledgments.length===0 && workbench.state.submission.idempotencyKey===null, 'Draft edit must invalidate receipt, findings, acknowledgments, and create intent')
  expect(issueControlPath('/draft/colors/0/hex')==='colors.0.hex' && !('classification' in submissionDraft(draft).colors[0]), 'JSON Pointer mapping and strict Draft projection must be stable')

  workbench.state.draft=draft; workbench.state.confirmedRevision=1
  workbench.state.submission.validation={ contract_version:'palette-assistant.v1',normalized_draft:submissionDraft(draft),validated_revision:1,draft_digest:'a'.repeat(64),validation_policy:'v',registry_version:'r',vocabulary_version:'v',warnings:[],duplicates:[{id:'c'.repeat(64),kind:'exact_duplicate'}],similarities:[],validation_receipt:'p.s',receipt_expires_at:'2026-08-13T12:00:00Z' }
  workbench.state.submission.validatedRevision=1; workbench.state.submission.status='validated'
  expect(!canCreateCandidate(workbench.state), 'exact duplicate must block Create and cannot be acknowledged')
}

async function testCreateStaleResponsesAndUiLock(): Promise<void> {
  Object.defineProperty(globalThis, 'localStorage', { configurable:true, value:{ getItem:()=> 'admin-token' } })
  const workbench = new PaletteAssistantWorkbench()
  const draft = draftFromAnalyze(analyzeResponse()); draft.revision=1; draft.name='Candidate'; draft.type='categorical'; draft.colors.push({ ...newAdminColor(1),hex:'#445566' }); draft.chart_applicability=[{chart_type:'bar_error',suitability:'best_fit'}]
  workbench.state.draft=draft; workbench.state.audit=auditFromAnalyze(analyzeResponse()); workbench.state.latestDraftRevision=1; workbench.state.confirmedRevision=1
  const validation = { contract_version:'palette-assistant.v1' as const,normalized_draft:submissionDraft(draft),validated_revision:1,draft_digest:'a'.repeat(64),validation_policy:'v',registry_version:'r',vocabulary_version:'v',warnings:[],duplicates:[],similarities:[],validation_receipt:'p.s',receipt_expires_at:'2026-08-13T12:00:00Z' }
  Object.assign(workbench.state.submission,{status:'validated',validatedRevision:1,validation,acknowledgments:[],idempotencyKey:null,error:null,receipt:null})
  let resolveSuccess!:(response:Response)=>void
  Object.defineProperty(globalThis,'fetch',{configurable:true,value:()=>new Promise<Response>((resolve)=>{resolveSuccess=resolve})})
  const navigations:string[]=[]; const staleSuccess=createCandidateAndNavigate(workbench,(path)=>{navigations.push(path)})
  expect(workbench.state.submission.status==='creating','Create must enter creating before its response')

  const lockState=structuredClone(workbench.state); const lockContext={ state:lockState,fileError:'',issues:[],confirmed:true,PALETTE_TYPES,PHASE_1_CHART_TYPES,CHART_SUITABILITIES,AnalyzeWarningList,formatBytes:(v:number)=>String(v),percent:(v:number)=>String(v),validHex:()=>true,workbench:{cancel:()=>undefined},onFileChange:()=>undefined,removeImage:()=>undefined,runAnalyze:()=>undefined,setName:()=>undefined,setType:()=>undefined,setHex:()=>undefined,setClassification:()=>undefined,acceptColor:()=>undefined,addColor:()=>undefined,removeColor:()=>undefined,moveColor:()=>undefined,addChart:()=>undefined,removeChart:()=>undefined,setChart:()=>undefined,setList:()=>undefined,setSourceNote:()=>undefined,setAccessibility:()=>undefined,resetDraft:()=>undefined,confirmDraft:()=>undefined,currentPreview:null,pendingPreviewChart:'bar_error',previewActionError:'',previewRender:null,createPreview:()=>undefined,setPendingPreviewChart:()=>undefined,removePreview:()=>undefined,changePreviewChart:()=>undefined,setPreviewJson:()=>undefined,runValidate:()=>undefined,acknowledge:()=>undefined,runCreate:()=>undefined,canCreate:false,creating:true,issueControlPath,JSON }
  const controls=descendants(renderWorkbenchTemplate(lockContext)).filter((node)=>['input','select','textarea','button','fieldset'].includes(String(node.type)))
  expect(controls.length>=20 && controls.every((node)=>node.props?.disabled===true),'every rendered Candidate-relevant control must be disabled while creating')

  mutateDraft(workbench.state,(value)=>{value.name='Revision 2'})
  resolveSuccess(jsonResponse({contract_version:'palette-assistant.v1',receipt_id:'stale',candidate_id:'stale',status:'candidate',preview_case_ids:[],admin_review_path:'/admin/palettes/stale/edit',created_at:'2026-08-13T11:00:00Z',replay:false},201))
  expect(await staleSuccess===false && navigations.length===0,'stale success must return no navigation result')
  expect(workbench.state.draft.revision===2 && workbench.state.confirmedRevision===null && workbench.state.submission.status==='idle' && workbench.state.submission.receipt===null && workbench.state.submission.validation===null && workbench.state.submission.idempotencyKey===null,'stale success must not restore invalidated submission state')

  workbench.state.confirmedRevision=2; const validation2={...validation,normalized_draft:submissionDraft(workbench.state.draft),validated_revision:2,validation_receipt:'p2.s2'}
  Object.assign(workbench.state.submission,{status:'validated',validatedRevision:2,validation:validation2,acknowledgments:[],idempotencyKey:null,error:null,receipt:null})
  let rejectOld!:(error:unknown)=>void
  Object.defineProperty(globalThis,'fetch',{configurable:true,value:()=>new Promise<Response>((_resolve,reject)=>{rejectOld=reject})})
  const staleRejection=workbench.createCandidate(); mutateDraft(workbench.state,(value)=>{value.source_note='newer'})
  rejectOld(new TypeError('old failure')); expect(await staleRejection===null,'stale rejection must return null')
  expect(workbench.state.submission.status==='idle' && workbench.state.submission.error===null && workbench.state.draft.revision===3,'stale rejection must not overwrite the newer invalidated state')
}

async function testDisposeInvalidatesPendingCreate(): Promise<void> {
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=> 'admin-token'}})
  const prepared = () => {
    const workbench=new PaletteAssistantWorkbench(); const draft=draftFromAnalyze(analyzeResponse())
    draft.revision=1; draft.name='Candidate'; draft.type='categorical'; draft.colors.push({...newAdminColor(1),hex:'#445566'}); draft.chart_applicability=[{chart_type:'bar_error',suitability:'best_fit'}]
    workbench.state.draft=draft; workbench.state.latestDraftRevision=1; workbench.state.confirmedRevision=1
    const validation={contract_version:'palette-assistant.v1' as const,normalized_draft:submissionDraft(draft),validated_revision:1,draft_digest:'a'.repeat(64),validation_policy:'v',registry_version:'r',vocabulary_version:'v',warnings:[],duplicates:[],similarities:[],validation_receipt:'p.s',receipt_expires_at:'2026-08-13T12:00:00Z'}
    Object.assign(workbench.state.submission,{status:'validated',validatedRevision:1,validation,acknowledgments:[],idempotencyKey:null,error:null,receipt:null})
    return workbench
  }
  const successWorkbench=prepared(); let resolveDisposed!:(response:Response)=>void; const disposedNavigations:string[]=[]
  Object.defineProperty(globalThis,'fetch',{configurable:true,value:()=>new Promise<Response>((resolve)=>{resolveDisposed=resolve})})
  const disposedSuccess=createCandidateAndNavigate(successWorkbench,(path)=>{disposedNavigations.push(path)})
  const generationBeforeDispose=successWorkbench.state.submission.generation
  successWorkbench.dispose()
  expect(successWorkbench.state.submission.generation===generationBeforeDispose+1,'dispose must increment and invalidate submission generation')
  resolveDisposed(jsonResponse({contract_version:'palette-assistant.v1',receipt_id:'stale',candidate_id:'stale',status:'candidate',preview_case_ids:[],admin_review_path:'/admin/palettes/stale/edit',created_at:'2026-08-13T11:00:00Z',replay:false},201))
  expect(await disposedSuccess===false && disposedNavigations.length===0,'disposed stale success must not navigate')
  expect(successWorkbench.state.submission.receipt===null && successWorkbench.state.submission.status!=='created','disposed stale success must not write receipt or created state')

  const rejectionWorkbench=prepared(); let rejectDisposed!:(error:unknown)=>void
  Object.defineProperty(globalThis,'fetch',{configurable:true,value:()=>new Promise<Response>((_resolve,reject)=>{rejectDisposed=reject})})
  const disposedRejection=rejectionWorkbench.createCandidate(); rejectionWorkbench.dispose(); rejectDisposed(new TypeError('disposed failure'))
  expect(await disposedRejection===null && rejectionWorkbench.state.submission.status!=='create_error' && rejectionWorkbench.state.submission.error===null,'disposed stale rejection must not write create_error or Problem')

  const currentWorkbench=prepared(); const currentNavigations:string[]=[]
  Object.defineProperty(globalThis,'fetch',{configurable:true,value:()=>Promise.resolve(jsonResponse({contract_version:'palette-assistant.v1',receipt_id:'current',candidate_id:'current',status:'candidate',preview_case_ids:[],admin_review_path:'/admin/palettes/current/edit',created_at:'2026-08-13T11:00:00Z',replay:false},201))})
  expect(await createCandidateAndNavigate(currentWorkbench,(path)=>{currentNavigations.push(path)}),'current Create must complete and navigate')
  expect(currentWorkbench.state.submission.status==='created' && currentWorkbench.state.submission.receipt?.candidate_id==='current' && currentNavigations.length===1 && currentNavigations[0]==='/admin/palettes/current/edit','normal success must store receipt and navigate exactly once')
}

await testAdminBoundaryAndNoWrites()
testCustomLeaveConfirmation()
await testProductionAdminRouteRuntime()
testFileValidation()
testDraftInitializationAuditAndRevision()
testAdminUuidAndPreviewLifecycle()
testAbandonmentGuard()
await testDuplicateWarningRendering()
testProductionEvidenceRendering()
testDraftPreviewCreationAndReplacementLifecycle()
testSignedSeedAllocatorBoundaries()
testPreviewUiStateContract()
testChartApplicabilityRevisionPath()
await withGlobalIsolation(testObjectUrlLifecycleAndStateReset)
await withGlobalIsolation(testAnalyzeSuccessRetryAbortAndStaleProtection)
await testGlobalIsolationRestoresAfterThrow()
await withGlobalIsolation(testValidateCreateStateMachine)
await withGlobalIsolation(testCreateStaleResponsesAndUiLock)
await withGlobalIsolation(testDisposeInvalidatesPendingCreate)
