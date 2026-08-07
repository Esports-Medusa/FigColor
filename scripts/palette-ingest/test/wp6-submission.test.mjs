import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

import { CONTRACT_ROOT } from '../lib/constants.mjs'
import { atomicWriteJSON } from '../lib/files.mjs'
import { canonicalHash } from '../lib/jcs.mjs'
import { artifactPaths, runBatch } from '../lib/pipeline.mjs'
import {
  INGESTION_MAX_RESPONSE_BODY_BYTES,
  INGESTION_REQUEST_TIMEOUT_MS,
  SubmissionTransportError,
  resolveIngestionEndpoint,
  resolveSubmissionConfig,
  sendIngestionRequest,
  submitBatch,
  submitCandidate
} from '../lib/submission.mjs'

const manifestFixture = path.join(CONTRACT_ROOT, 'fixtures/valid/manual-basic/manifest.json')
const token = 'test-admin-token'

test('transport constants, URL parsing, credentials, and exact loopback policy are frozen', () => {
  assert.equal(INGESTION_REQUEST_TIMEOUT_MS, 30000)
  assert.equal(INGESTION_MAX_RESPONSE_BODY_BYTES, 65536)
  for (const value of ['https://api.figcolor.test', 'http://localhost:8080', 'http://127.0.0.1:8080', 'http://[::1]:8080']) {
    assert.match(resolveIngestionEndpoint(value), /\/api\/admin\/palette-candidates$/)
  }
  for (const value of ['http://api.figcolor.test', 'http://localhost.example.com', 'http://127.0.0.1.example.com', 'https://user:password@api.figcolor.test', 'file:///tmp/socket']) {
    assert.throws(() => resolveIngestionEndpoint(value))
  }
  assert.equal(resolveSubmissionConfig({ apiBaseUrl: 'https://cli.test' }, { FIGCOLOR_API_BASE_URL: 'https://env.test', FIGCOLOR_ADMIN_TOKEN: token }).endpoint, 'https://cli.test/api/admin/palette-candidates')
  assert.equal(resolveSubmissionConfig({}, { FIGCOLOR_API_BASE_URL: 'https://env.test', FIGCOLOR_ADMIN_TOKEN: token }).endpoint, 'https://env.test/api/admin/palette-candidates')
  assert.doesNotThrow(() => resolveSubmissionConfig({ apiBaseUrl: 'https://dry.test' }, {}, false))
  assert.throws(() => resolveSubmissionConfig({ apiBaseUrl: 'https://real.test' }, {}, true), /FIGCOLOR_ADMIN_TOKEN/)
})

test('bounded transport accepts 65536 bytes, rejects byte 65537, and uses manual redirect', async () => {
  const calls = []
  const base = { endpoint: 'https://api.test/api/admin/palette-candidates', token, idempotencyKey: uuid(1), body: Buffer.from('{}') }
  const accepted = await sendIngestionRequest(base, { fetch: async (_url, options) => {
    calls.push(options)
    return new Response(Buffer.alloc(65536), { status: 200 })
  } })
  assert.equal(accepted.body.length, 65536)
  assert.equal(calls[0].redirect, 'manual')
  await assert.rejects(
    sendIngestionRequest(base, { fetch: async () => new Response(Buffer.alloc(65537), { status: 200 }) }),
    (error) => error instanceof SubmissionTransportError && error.code === 'RESPONSE_BODY_TOO_LARGE'
  )
})

test('timeout aborts deterministically without waiting 30 seconds', async () => {
  let timeoutValue
  await assert.rejects(sendIngestionRequest({ endpoint: 'https://api.test/api/admin/palette-candidates', token, idempotencyKey: uuid(2), body: Buffer.from('{}') }, {
    setTimeout(callback, delay) { timeoutValue = delay; queueMicrotask(callback); return 1 },
    clearTimeout() {},
    fetch: async (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))))
  }), (error) => error.code === 'REQUEST_TIMEOUT')
  assert.equal(timeoutValue, 30000)
})

test('3xx is not followed and redirect target never receives Authorization', async () => {
  let targetCalls = 0
  let targetAuthorization = null
  const target = await listen((request, response) => {
    targetCalls += 1
    targetAuthorization = request.headers.authorization ?? null
    response.end('unexpected')
  })
  const redirect = await listen((_request, response) => {
    response.writeHead(302, { Location: `${target.url}/capture` })
    response.end()
  })
  try {
    await assert.rejects(sendIngestionRequest({ endpoint: `${redirect.url}/api/admin/palette-candidates`, token, idempotencyKey: uuid(3), body: Buffer.from('{}') }), (error) => error.code === 'REDIRECT_REJECTED')
    assert.equal(targetCalls, 0)
    assert.equal(targetAuthorization, null)
  } finally {
    await redirect.close()
    await target.close()
  }
})

test('authoritative report enters the three-argument builder and key is durable before fetch', async () => withWorkspace(async (workspace) => {
  const paths = workspace.paths
  const report = JSON.parse(fs.readFileSync(paths.validation, 'utf8'))
  report.issues.push({ path: '$.palette.tags', code: 'REVIEW_TAGS', message: 'Review.', severity: 'warning', source: 'domain' })
  report.findings = [catalogFinding(`${workspace.batchId}/manual-basic@manual-basic.json`)]
  atomicWriteJSON(paths.validation, report, workspace.artifacts)
  const checkpoint = JSON.parse(fs.readFileSync(paths.checkpoint, 'utf8'))
  checkpoint.validation_report_hash = canonicalHash(report).hash
  atomicWriteJSON(paths.checkpoint, checkpoint, workspace.artifacts)
  let observed
  const result = await submitBatch(workspace.options(), {
    env: { FIGCOLOR_ADMIN_TOKEN: token },
    randomUUID: () => uuid(10),
    fetch: async (_url, request) => {
      const durable = JSON.parse(fs.readFileSync(paths.checkpoint, 'utf8'))
      observed = { durable, body: Buffer.from(request.body), key: request.headers['Idempotency-Key'] }
      const body = JSON.parse(Buffer.from(request.body).toString('utf8'))
      assert.deepEqual(body.ingestion_metadata.duplicate_evidence, report.findings)
      return receiptResponse(body, 201)
    }
  })
  assert.equal(observed.durable.stage, 'submission_pending_or_unknown')
  assert.equal(observed.durable.idempotency_key, uuid(10))
  assert.equal(observed.key, uuid(10))
  assert.equal(canonicalHash(JSON.parse(observed.body)).hash, observed.durable.request_fingerprint)
  assert.equal(result.packages[0].status, 'submitted')
  assert.equal(result.packages[0].outcome, 'created')
  const submitted = JSON.parse(fs.readFileSync(paths.checkpoint, 'utf8'))
  assert.equal(submitted.stage, 'submitted')
  assert.equal(submitted.checkpoint_version, 2)
  assert.equal(fs.readFileSync(paths.receipt, 'utf8'), JSON.stringify(result.packages[0].receipt))
  assert.equal(findSecret(workspace.artifacts, token), false)
}))

test('transport unknown survives restart and resume reuses identical key and canonical bytes', async () => withWorkspace(async (workspace) => {
  const firstBodies = []
  const first = await submitBatch(workspace.options(), {
    env: { FIGCOLOR_ADMIN_TOKEN: token }, randomUUID: () => uuid(11),
    fetch: async (_url, request) => { firstBodies.push(Buffer.from(request.body)); throw new TypeError('connection reset with secret ' + token) }
  })
  assert.equal(first.packages[0].status, 'submission_pending_or_unknown')
  const pending = JSON.parse(fs.readFileSync(workspace.paths.checkpoint, 'utf8'))
  assert.equal(pending.idempotency_key, uuid(11))
  assert.equal(pending.submission_code, 'TRANSPORT_FAILURE')
  let resumedKey
  let resumedBody
  const second = await submitBatch(workspace.options({ resume: true }), {
    env: { FIGCOLOR_ADMIN_TOKEN: token }, randomUUID: () => { throw new Error('must not rotate key') },
    fetch: async (_url, request) => {
      resumedKey = request.headers['Idempotency-Key']
      resumedBody = Buffer.from(request.body)
      return receiptResponse(JSON.parse(resumedBody.toString('utf8')), 200)
    }
  })
  assert.equal(second.packages[0].status, 'submitted')
  assert.equal(second.packages[0].outcome, 'replayed_or_recovered')
  assert.equal(resumedKey, uuid(11))
  assert.deepEqual(resumedBody, firstBodies[0])
  assert.equal(findSecret(workspace.artifacts, token), false)
}))

test('submitted checkpoint skips HTTP and dry-run has no artifact side effects', async () => withWorkspace(async (workspace) => {
  let calls = 0
  await submitBatch(workspace.options(), { env: { FIGCOLOR_ADMIN_TOKEN: token }, randomUUID: () => uuid(12), fetch: async (_url, request) => { calls += 1; return receiptResponse(JSON.parse(Buffer.from(request.body)), 201) } })
  const replay = await submitBatch(workspace.options({ resume: true }), { env: { FIGCOLOR_ADMIN_TOKEN: token }, fetch: async () => { calls += 1; throw new Error('must not fetch') } })
  assert.equal(replay.packages[0].status, 'already_submitted')
  assert.equal(calls, 1)
  assert.equal(runBatch('status', { batch: workspace.batch, artifacts: workspace.artifacts }).packages[0].status, 'already_submitted')

  const dryWorkspace = createWorkspace()
  try {
    const before = snapshot(dryWorkspace.artifacts)
    const dry = await submitBatch(dryWorkspace.options({ dryRun: true }), { env: {}, fetch: async () => { throw new Error('must not fetch') } })
    assert.equal(dry.packages[0].status, 'dry_run')
    assert.deepEqual(snapshot(dryWorkspace.artifacts), before)
  } finally { dryWorkspace.cleanup() }
}))

test('CLI submit dry-run is secret-free and real submit requires URL and environment token', () => withWorkspace((workspace) => {
  const dry = runCLI(['submit', '--batch', workspace.batch, '--artifacts', workspace.artifacts, '--api-base-url', 'http://localhost:8080', '--dry-run', '--json'], {})
  assert.equal(dry.status, 0, dry.stderr)
  assert.equal(JSON.parse(dry.stdout).packages[0].status, 'dry_run')
  assert.doesNotMatch(dry.stdout + dry.stderr, /Authorization|Bearer/u)
  const noURL = runCLI(['submit', '--batch', workspace.batch, '--artifacts', workspace.artifacts, '--json'], { FIGCOLOR_ADMIN_TOKEN: token })
  assert.equal(noURL.status, 2)
  assert.match(noURL.stderr, /API base URL is required/)
  const noToken = runCLI(['submit', '--batch', workspace.batch, '--artifacts', workspace.artifacts, '--api-base-url', 'http://localhost:8080', '--json'], {})
  assert.equal(noToken.status, 2)
  assert.match(noToken.stderr, /FIGCOLOR_ADMIN_TOKEN is required/)
  const forbiddenOption = runCLI(['submit', '--batch', workspace.batch, '--token', token], {})
  assert.equal(forbiddenOption.status, 2)
  assert.match(forbiddenOption.stderr, /unknown option: --token/)
}))

test('batch submission isolates failures and --fail-fast stops at the first unsuccessful candidate', async () => {
  const workspace = createWorkspace({ second: true })
  try {
    let calls = 0
    const result = await submitBatch(workspace.options(), {
      env: { FIGCOLOR_ADMIN_TOKEN: token },
      randomUUID: () => uuid(60 + calls),
      fetch: async (_url, request) => {
        calls += 1
        const body = JSON.parse(Buffer.from(request.body))
        if (body.ingestion_metadata.source_key === 'manual-basic') return new Response(JSON.stringify(problem('INTERNAL_ERROR')), { status: 500 })
        return receiptResponse(body, 201)
      }
    })
    assert.equal(calls, 2)
    assert.deepEqual(result.packages.map((entry) => entry.status), ['submission_pending_or_unknown', 'submitted'])
  } finally { workspace.cleanup() }

  const failFast = createWorkspace({ second: true })
  try {
    let calls = 0
    const result = await submitBatch(failFast.options({ failFast: true }), {
      env: { FIGCOLOR_ADMIN_TOKEN: token }, randomUUID: () => uuid(70),
      fetch: async () => { calls += 1; return new Response(JSON.stringify(problem('INTERNAL_ERROR')), { status: 500 }) }
    })
    assert.equal(calls, 1)
    assert.equal(result.packages.length, 1)
  } finally { failFast.cleanup() }
})

test('invalid report, stale binding, blocking issue, corrupt checkpoint, and changed fingerprint never fetch', async () => {
  for (const mutate of [
    (workspace) => fs.unlinkSync(workspace.paths.validation),
    (workspace) => { const report = JSON.parse(fs.readFileSync(workspace.paths.validation)); report.issues.push({ path: '$', code: 'BLOCKED', message: 'Blocked.', severity: 'error', source: 'domain' }); report.valid = false; atomicWriteJSON(workspace.paths.validation, report, workspace.artifacts) },
    (workspace) => fs.writeFileSync(workspace.paths.checkpoint, '{broken'),
    (workspace) => { const checkpoint = JSON.parse(fs.readFileSync(workspace.paths.checkpoint)); checkpoint.validation_report_hash = 'f'.repeat(64); atomicWriteJSON(workspace.paths.checkpoint, checkpoint, workspace.artifacts) }
  ]) {
    const workspace = createWorkspace()
    try {
      mutate(workspace)
      let calls = 0
      const result = await submitBatch(workspace.options(), { env: { FIGCOLOR_ADMIN_TOKEN: token }, fetch: async () => { calls += 1 } })
      assert.equal(result.packages[0].status, 'local_validation_failed')
      assert.equal(calls, 0)
    } finally { workspace.cleanup() }
  }

  await withWorkspace(async (workspace) => {
    await submitBatch(workspace.options(), { env: { FIGCOLOR_ADMIN_TOKEN: token }, randomUUID: () => uuid(13), fetch: async () => { throw new TypeError('reset') } })
    const report = JSON.parse(fs.readFileSync(workspace.paths.validation))
    report.issues.push({ path: '$.palette.name', code: 'REVIEW_NAME', message: 'Changed evidence.', severity: 'warning', source: 'domain' })
    atomicWriteJSON(workspace.paths.validation, report, workspace.artifacts)
    const checkpoint = JSON.parse(fs.readFileSync(workspace.paths.checkpoint))
    checkpoint.validation_report_hash = canonicalHash(report).hash
    atomicWriteJSON(workspace.paths.checkpoint, checkpoint, workspace.artifacts)
    let calls = 0
    const result = await submitBatch(workspace.options({ resume: true }), { env: { FIGCOLOR_ADMIN_TOKEN: token }, fetch: async () => { calls += 1 } })
    assert.equal(result.packages[0].status, 'local_validation_failed')
    assert.equal(calls, 0)
  })
})

test('atomic checkpoint failure prevents the first HTTP request', async () => withWorkspace(async (workspace) => {
  let calls = 0
  const result = await submitCandidate({
    artifactRoot: workspace.artifacts, batchId: workspace.batchId, name: 'manual-basic.json',
    config: { endpoint: 'http://localhost:8080/api/admin/palette-candidates', token }, options: {},
    dependencies: {
      randomUUID: () => uuid(14),
      atomicWriteJSON(file, value, root) {
        if (file === workspace.paths.checkpoint && value.stage === 'prepared_for_submission') throw new Error('disk full')
        atomicWriteJSON(file, value, root)
      },
      fetch: async () => { calls += 1 }
    }
  })
  assert.equal(result.status, 'local_validation_failed')
  assert.equal(calls, 0)
}))

test('response mapping validates receipt binding, auth exception, errors, Retry-After, and unknown pairs', async () => {
  const cases = [
    { status: 401, body: { error: 'invalid token' }, expected: 'authentication_failed' },
    { status: 403, body: { error: 'access denied' }, expected: 'authorization_failed' },
    { status: 409, body: problem('IDEMPOTENCY_IN_PROGRESS'), retry: '7', expected: 'submission_pending_or_unknown', checkpoint: 'submission_pending_or_unknown' },
    { status: 503, body: problem('INGESTION_RETRYABLE_FAILURE'), retry: '5', expected: 'submission_pending_or_unknown' },
    { status: 503, body: problem('INGESTION_OUTCOME_UNKNOWN'), retry: '5', expected: 'submission_pending_or_unknown' },
    { status: 409, body: problem('PROPOSAL_ID_CONFLICT'), expected: 'submission_failed_terminal' },
    { status: 409, body: problem('EXACT_CONTENT_DUPLICATE'), expected: 'submission_failed_terminal' },
    { status: 422, body: problem('INVALID_INGESTION_REQUEST'), expected: 'submission_failed_terminal' },
    { status: 500, body: problem('INTERNAL_ERROR'), expected: 'submission_pending_or_unknown' },
    { status: 418, body: problem('INTERNAL_ERROR'), expected: 'submission_pending_or_unknown' }
  ]
  for (let index = 0; index < cases.length; index += 1) {
    const tc = cases[index]
    const workspace = createWorkspace()
    try {
      const result = await submitBatch(workspace.options(), {
        env: { FIGCOLOR_ADMIN_TOKEN: token }, randomUUID: () => uuid(20 + index),
        fetch: async () => new Response(JSON.stringify(tc.body), { status: tc.status, headers: tc.retry ? { 'Retry-After': tc.retry } : {} })
      })
      assert.equal(result.packages[0].status, tc.expected, `${tc.status} ${tc.body.code}`)
      if (tc.retry) assert.equal(result.packages[0].retry_after_seconds, Number(tc.retry))
      const checkpoint = JSON.parse(fs.readFileSync(workspace.paths.checkpoint))
      assert.notEqual(checkpoint.stage, 'submitted')
    } finally { workspace.cleanup() }
  }
})

test('malformed, truncated, oversized, and fingerprint-mismatched success remain unknown with the same key', async () => {
  const responders = [
    async () => new Response('{broken', { status: 201 }),
    async () => new Response(Buffer.alloc(65537), { status: 201 }),
    async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(Buffer.from('{')); controller.error(new Error('reset')) } }), { status: 201 }),
    async (_url, request) => { const body = JSON.parse(Buffer.from(request.body)); const response = await receiptResponse(body, 201); const receipt = await response.json(); receipt.request_fingerprint = 'f'.repeat(64); return new Response(JSON.stringify(receipt), { status: 201 }) }
  ]
  for (let index = 0; index < responders.length; index += 1) {
    const workspace = createWorkspace()
    try {
      const key = uuid(40 + index)
      const result = await submitBatch(workspace.options(), { env: { FIGCOLOR_ADMIN_TOKEN: token }, randomUUID: () => key, fetch: responders[index] })
      assert.equal(result.packages[0].status, 'submission_pending_or_unknown')
      const checkpoint = JSON.parse(fs.readFileSync(workspace.paths.checkpoint))
      assert.equal(checkpoint.idempotency_key, key)
      assert.equal(checkpoint.stage, 'submission_pending_or_unknown')
    } finally { workspace.cleanup() }
  }
})

function createWorkspace(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'figcolor-submit-'))
  const batch = path.join(root, 'submit-batch')
  const source = path.join(batch, 'manual-basic')
  const artifacts = path.join(root, 'artifacts')
  fs.mkdirSync(source, { recursive: true })
  fs.copyFileSync(manifestFixture, path.join(source, 'manifest.json'))
  if (options.second) {
    const secondSource = path.join(batch, 'second')
    const second = JSON.parse(fs.readFileSync(manifestFixture, 'utf8'))
    second.source_key = 'second'
    second.supplied_fields.colors[0] = '#102030'
    fs.mkdirSync(secondSource, { recursive: true })
    fs.writeFileSync(path.join(secondSource, 'manifest.json'), `${JSON.stringify(second, null, 2)}\n`)
  }
  runBatch('prepare', { batch, artifacts })
  runBatch('validate', { batch, artifacts })
  const batchId = 'submit-batch'
  return {
    root, batch, artifacts, batchId,
    paths: artifactPaths(artifacts, batchId, 'manual-basic'),
    options(extra = {}) { return { batch, artifacts, apiBaseUrl: 'http://localhost:8080', ...extra } },
    cleanup() { fs.rmSync(root, { recursive: true, force: true }) }
  }
}

async function withWorkspace(callback) {
  const workspace = createWorkspace()
  try { return await callback(workspace) } finally { workspace.cleanup() }
}

function receiptResponse(request, status) {
  const metadata = request.ingestion_metadata
  const receipt = {
    proposal_id: metadata.proposal_id,
    normalized_content_hash: metadata.normalized_content_hash,
    request_fingerprint: canonicalHash(request).hash,
    palette_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    slug: 'submitted-palette',
    status: 'candidate',
    preview_case_ids: []
  }
  return new Response(JSON.stringify(receipt), { status })
}

function problem(code) { return { code, message: `${code} safe message.` } }

function catalogFinding(currentIdentity) {
  return {
    kind: 'canonical_content', fingerprint_type: 'normalized_content_hash', fingerprint_version: 1,
    fingerprint: 'a'.repeat(64), current_identity: currentIdentity, matched_identity: 'catalog/palette-1',
    scope: 'catalog_snapshot', path: '$.normalized_content_hash', code: 'EXACT_CATALOG_CONTENT_MATCH',
    message: 'Exact catalog content match.', severity: 'warning', source: 'duplicate'
  }
}

function uuid(seed) { return `123e4567-e89b-42d3-a456-${String(seed).padStart(12, '0')}` }

async function listen(handler) {
  const server = http.createServer(handler)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  return { url: `http://127.0.0.1:${address.port}`, close: () => new Promise((resolve) => server.close(resolve)) }
}

function snapshot(root) {
  const entries = []
  const walk = (directory) => {
    for (const name of fs.readdirSync(directory).sort()) {
      const target = path.join(directory, name)
      const stat = fs.statSync(target)
      if (stat.isDirectory()) walk(target)
      else entries.push([path.relative(root, target), fs.readFileSync(target, 'hex')])
    }
  }
  walk(root)
  return entries
}

function findSecret(root, secret) {
  return snapshot(root).some(([, hex]) => Buffer.from(hex, 'hex').toString('utf8').includes(secret))
}

function runCLI(args, env) {
  return spawnSync(process.execPath, [path.resolve('scripts/palette-ingest/cli.mjs'), ...args], {
    cwd: path.resolve('.'), encoding: 'utf8', env: { PATH: process.env.PATH, ...env }
  })
}
