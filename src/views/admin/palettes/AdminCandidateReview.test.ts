import { AdminPaletteApiError, getPalettes, publishPalette } from '@/api/admin'
import listSource from './AdminPalettesList.vue?raw'
import formSource from './AdminPaletteForm.vue?raw'

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

async function testCandidateFilterSearchAndPaginationSerialization(): Promise<void> {
  let requested = ''
  const previousFetch = globalThis.fetch
  const previousStorage = globalThis.localStorage
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => 'admin-token' }
  })
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requested = String(input)
    return new Response(JSON.stringify({ palettes: [], total: 0, page: 3, page_size: 20 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }) as typeof fetch

  try {
    const result = await getPalettes({
      status: 'candidate',
      search: 'ocean',
      chart_type: 'bar_error',
      page: 3,
      page_size: 20
    })
    const query = new URL(requested, 'http://figcolor.local').searchParams
    expect(query.get('status') === 'candidate', 'candidate status filter must serialize')
    expect(query.get('search') === 'ocean', 'search must serialize')
    expect(query.get('chart_type') === 'bar_error', 'chart filter must serialize')
    expect(query.get('page') === '3' && query.get('page_size') === '20', 'pagination must serialize with filters')
    expect(result.page === 3 && result.items.length === 0, 'admin list response must normalize without treating empty as failure')
  } finally {
    globalThis.fetch = previousFetch
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: previousStorage })
  }
}

function testCandidateReviewPresentationAndSafety(): void {
  expect(listSource.includes("status === 'candidate' ? 'Candidate'"), 'candidate badge must have an explicit label')
  expect(listSource.includes("palette.status === 'draft'"), 'only draft rows may expose the legacy publish action')
  expect(listSource.includes('No candidates found.'), 'candidate-only empty state must be explicit')
  expect(listSource.includes('No palettes match the current filters.'), 'filtered empty state must be distinct')
  expect(listSource.includes('>Retry</button>'), 'list failures must expose retry')
  expect(formSource.includes('getPalette(paletteId.value)'), 'candidate details must load from the admin detail endpoint')
  expect(formSource.includes("loadedStatus.value === 'candidate'"), 'candidate forms must retain loaded canonical status')
  expect(formSource.includes('status: isCandidate.value ? undefined : form.status'), 'candidate save payload must omit publication status')
  expect(formSource.includes('Publish to public catalog'), 'candidate form must expose an explicit publication action')
  expect(formSource.includes('createCandidatePublicationController'), 'candidate form must wire the executable publication controller')
  expect(formSource.includes('candidatePublicationController.attempt()'), 'Publish action must delegate to the publication controller')
  expect(formSource.includes('transitionCoordinator: candidateTransitionCoordinator'), 'Publish and Reject must share the form-level transition coordinator')
  expect(formSource.includes('candidateTransitionActive !== null'), 'the competing transition button must disable during confirmation and request')
  expect(formSource.includes('await loadPreviewCases(false)'), 'canonical Reject application must reconcile the preview aggregate')
  expect(!formSource.includes('handleUnpublish'), 'candidate workflow must not add an unpublish action')
  expect(formSource.includes(':public-only="false"'), 'admin form must continue using the shared preview renderer')
}

async function testCandidatePublicationRequestAndStructuredFailure(): Promise<void> {
  const previousFetch = globalThis.fetch
  const previousStorage = globalThis.localStorage
  let request: { url: string; init?: RequestInit } | undefined
  let responseStatus = 422
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => 'admin-token' }
  })
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    request = { url: String(input), init }
    return new Response(JSON.stringify({
      error: 'publication validation failed',
      issues: [{ path: 'colors', code: 'COLORS_INVALID', message: 'Colors are invalid.' }]
    }), { status: responseStatus, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch

  try {
    let failure: unknown
    try {
      await publishPalette('candidate-1')
    } catch (error) {
      failure = error
    }
    expect(request?.url === '/api/admin/palettes/candidate-1/publish', 'publication must use the dedicated endpoint')
    expect(request?.init?.method === 'POST' && request?.init?.body === undefined, 'publication must be a payload-free POST')
    expect(failure instanceof AdminPaletteApiError, 'publication failures must retain structured API error data')
    expect((failure as AdminPaletteApiError).status === 422, 'publication validation status must be retained')
    expect((failure as AdminPaletteApiError).issues[0]?.code === 'COLORS_INVALID', 'publication validation issues must be retained')
    for (const status of [401, 403, 409]) {
      responseStatus = status
      try {
        await publishPalette('candidate-1')
        throw new Error(`publication status ${status} unexpectedly succeeded`)
      } catch (error) {
        expect(error instanceof AdminPaletteApiError && error.status === status, `publication status ${status} must be retained`)
      }
    }
  } finally {
    globalThis.fetch = previousFetch
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: previousStorage })
  }
}

await testCandidateFilterSearchAndPaginationSerialization()
await testCandidatePublicationRequestAndStructuredFailure()
testCandidateReviewPresentationAndSafety()
