import {
  archiveAdminPreviewCase,
  createAdminPreviewCase,
  listAdminPreviewCases,
  publishAdminPreviewCase,
  setPrimaryAdminPreviewCase,
  updateAdminPreviewCase
} from './adminPreviewCases'
import type { AdminPreviewCasePayload } from './adminPreviewCases'

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

const basePayload: AdminPreviewCasePayload = {
  chart_type: 'bar_error',
  template_id: 'bar_error_v1',
  template_version: 1,
  schema_version: 1,
  color_roles: { groups: [], elements: {} },
  preview_config: {
    orientation: 'vertical',
    sample_size: 24,
    error_type: 'sem',
    data_pattern: 'treatment_higher'
  },
  seed_strategy: 'stable_id',
  seed_value: null
}

function installLocalStorage(): void {
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key)
    }
  })
}

function mockFetch(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Response | Promise<Response>
): void {
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: handler
  })
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    ...init
  })
}

async function testListUsesPaletteRoute(): Promise<void> {
  installLocalStorage()
  localStorage.setItem('auth_token', 'token-1')

  let requestedUrl = ''
  mockFetch((input, init) => {
    requestedUrl = String(input)
    expect(init?.method === undefined, 'list should use GET')
    expect((init?.headers as Record<string, string>).Authorization === 'Bearer token-1', 'auth header should be included')
    return jsonResponse({ items: [], total: 0 }, { status: 200 })
  })

  const result = await listAdminPreviewCases('palette 1', { includeArchived: true })
  expect(result.ok, 'list should succeed')
  expect(requestedUrl === '/api/admin/palettes/palette%201/preview-cases?include_archived=true', 'list should call palette preview-case route')
}

async function testMutationRoutes(): Promise<void> {
  const calls: Array<{ url: string; method: string | undefined; body?: string }> = []
  mockFetch((input, init) => {
    calls.push({ url: String(input), method: init?.method, body: init?.body as string | undefined })
    return jsonResponse({ id: 'preview-1' }, { status: init?.method === 'POST' && String(input).endsWith('/preview-cases') ? 201 : 200 })
  })

  await createAdminPreviewCase('palette-1', basePayload)
  await updateAdminPreviewCase('preview-1', { preview_config: basePayload.preview_config })
  await publishAdminPreviewCase('preview-1')
  await archiveAdminPreviewCase('preview-1')
  await setPrimaryAdminPreviewCase('preview-1')

  expect(calls[0].url === '/api/admin/palettes/palette-1/preview-cases', 'create route should match backend contract')
  expect(calls[0].method === 'POST', 'create should use POST')
  expect(calls[1].url === '/api/admin/preview-cases/preview-1', 'update route should match backend contract')
  expect(calls[1].method === 'PATCH', 'update should use PATCH')
  expect(calls[2].url.endsWith('/publish'), 'publish route should match backend contract')
  expect(calls[3].url.endsWith('/archive'), 'archive route should match backend contract')
  expect(calls[4].url.endsWith('/set-primary'), 'set primary route should match backend contract')
}

async function testStructuredErrorsPreserved(): Promise<void> {
  const issues = [{ path: 'color_roles.groups', code: 'INVALID_COLOR_ROLES', message: 'At least 3 groups are required.' }]
  mockFetch(() => jsonResponse({ error: 'validation failed', issues }, { status: 422 }))

  const result = await createAdminPreviewCase('palette-1', basePayload)
  expect(!result.ok, 'validation response should fail')
  if (!result.ok) {
    expect(result.status === 422, 'validation status should be preserved')
    expect(result.kind === 'validation', '422 should map to validation')
    expect(result.issues?.[0].path === 'color_roles.groups', 'structured issues should be preserved')
  }
}

async function testConflictNotFoundAndNetworkKinds(): Promise<void> {
  mockFetch(() => jsonResponse({ error: 'invalid lifecycle transition' }, { status: 409 }))
  const conflict = await publishAdminPreviewCase('preview-1')
  expect(!conflict.ok && conflict.kind === 'conflict', '409 should map to conflict')

  mockFetch(() => jsonResponse({ error: 'not found' }, { status: 404 }))
  const missing = await publishAdminPreviewCase('preview-1')
  expect(!missing.ok && missing.kind === 'not_found', '404 should map to not_found')

  mockFetch(() => {
    throw new Error('offline')
  })
  const network = await publishAdminPreviewCase('preview-1')
  expect(!network.ok && network.kind === 'network' && network.status === 0, 'network failures should not masquerade as HTTP errors')
}

await testListUsesPaletteRoute()
await testMutationRoutes()
await testStructuredErrorsPreserved()
await testConflictNotFoundAndNetworkKinds()
