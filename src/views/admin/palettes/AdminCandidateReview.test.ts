import { getPalettes } from '@/api/admin'
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
  expect(formSource.includes('v-if="isEditing && !isCandidate"'), 'candidate form must not expose palette publish')
  expect(formSource.includes(':public-only="false"'), 'admin form must continue using the shared preview renderer')
}

await testCandidateFilterSearchAndPaginationSerialization()
testCandidateReviewPresentationAndSafety()
