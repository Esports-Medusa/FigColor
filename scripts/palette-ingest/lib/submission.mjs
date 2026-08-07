import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { randomUUID } from 'node:crypto'

import {
  DEFAULT_ARTIFACT_ROOT,
  MAX_MANIFEST_BYTES,
  PIPELINE_VERSION,
  SCHEMA_VERSION,
  loadVocabularies
} from './constants.mjs'
import {
  assertRealPathContained,
  atomicWriteJSON,
  atomicWriteText,
  containedPath,
  issue,
  readJSONFile,
  safeSegment
} from './files.mjs'
import { canonicalHash, canonicalHashJSON, sha256Hex } from './jcs.mjs'
import {
  artifactPaths,
  buildIngestionRequest,
  deriveBatchId,
  proposalArtifactHash
} from './pipeline.mjs'
import { isBlockingIssue } from './issue-policy.mjs'
import { validateContract } from './schema-validation.mjs'

export const INGESTION_REQUEST_TIMEOUT_MS = 30000
export const INGESTION_MAX_RESPONSE_BODY_BYTES = 65536
export const INGESTION_MAX_REQUEST_BODY_BYTES = 262144
export const INGESTION_ENDPOINT_PATH = '/api/admin/palette-candidates'
export const SUBMISSION_CHECKPOINT_VERSION = 2

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]'])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const SUCCESS_STATUSES = new Set(['submitted', 'already_submitted', 'dry_run'])
const TERMINAL_CODES = new Set([
  'IDEMPOTENCY_PAYLOAD_MISMATCH',
  'PROPOSAL_ID_CONFLICT',
  'EXACT_CONTENT_DUPLICATE',
  'INGESTION_FAILED',
  'INVALID_JSON',
  'INVALID_INGESTION_REQUEST',
  'UNSUPPORTED_SCHEMA_VERSION',
  'UNSUPPORTED_PIPELINE_VERSION',
  'UNSUPPORTED_MEDIA_TYPE',
  'REQUEST_BODY_TOO_LARGE',
  'INVALID_IDEMPOTENCY_KEY'
])
const PENDING_CODES = new Set([
  'IDEMPOTENCY_IN_PROGRESS',
  'INGESTION_RETRYABLE_FAILURE',
  'INGESTION_OUTCOME_UNKNOWN',
  'INTERNAL_ERROR'
])

export function resolveSubmissionConfig(options, env = process.env, requireToken = true) {
  const configured = options.apiBaseUrl ?? env.FIGCOLOR_API_BASE_URL
  if (!configured) throw new Error('Palette ingestion API base URL is required (--api-base-url or FIGCOLOR_API_BASE_URL).')
  const endpoint = resolveIngestionEndpoint(configured)
  const token = env.FIGCOLOR_ADMIN_TOKEN
  if (requireToken && (typeof token !== 'string' || token.length === 0)) throw new Error('FIGCOLOR_ADMIN_TOKEN is required for submission.')
  if (typeof token === 'string' && /[\r\n]/u.test(token)) throw new Error('FIGCOLOR_ADMIN_TOKEN is invalid.')
  return { endpoint, token: token ?? null }
}

export function resolveIngestionEndpoint(value) {
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('Palette ingestion API base URL is invalid.')
  }
  if (parsed.username !== '' || parsed.password !== '') throw new Error('Palette ingestion API URL must not contain credentials.')
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && LOOPBACK_HOSTNAMES.has(parsed.hostname))) {
    throw new Error('Palette ingestion API URL must use HTTPS except for an exact loopback hostname.')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('Palette ingestion API URL must use HTTP or HTTPS.')
  return new URL(INGESTION_ENDPOINT_PATH, parsed.origin).toString()
}

export async function submitBatch(options, dependencies = {}) {
  const batchRoot = fs.realpathSync(options.batch)
  const artifactRoot = path.resolve(options.artifacts ?? DEFAULT_ARTIFACT_ROOT)
  const batchId = deriveBatchId(batchRoot)
  const config = resolveSubmissionConfig(options, dependencies.env ?? process.env, !options.dryRun)
  const proposalRoot = containedPath(artifactRoot, batchId, 'proposals')
  if (!fs.existsSync(proposalRoot)) return submissionSummary(batchId, [])
  const stat = fs.lstatSync(proposalRoot)
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Proposal artifact directory must be a real directory')
  assertRealPathContained(artifactRoot, proposalRoot)
  const files = fs.readdirSync(proposalRoot).filter((entry) => entry.endsWith('.json')).sort()
  const packages = []
  for (const name of files) {
    const result = await submitCandidate({ artifactRoot, batchId, name, config, options, dependencies })
    packages.push(result)
    if (options.failFast && !SUCCESS_STATUSES.has(result.status)) break
  }
  const summary = submissionSummary(batchId, packages)
  if (!options.dryRun) writeBatchState(artifactRoot, batchId, packages, dependencies)
  return summary
}

export async function submitCandidate({ artifactRoot, batchId, name, config, options = {}, dependencies = {} }) {
  const sourceKey = path.basename(name, '.json')
  try {
    safeSegment(sourceKey, 'source key')
    const paths = artifactPaths(artifactRoot, batchId, sourceKey)
    const prepared = prepareSubmission(paths, artifactRoot, batchId, name)
    if (options.dryRun) {
      return publicResult(sourceKey, 'dry_run', prepared, { endpoint: config.endpoint })
    }
    let checkpoint = prepared.checkpoint
    if (checkpoint.stage === 'submitted') {
      verifySubmittedCheckpoint(checkpoint, prepared, paths, artifactRoot)
      return publicResult(sourceKey, 'already_submitted', prepared, { resumed: true })
    }
    if (checkpoint.stage === 'submission_failed_terminal') {
      return publicResult(sourceKey, 'submission_failed_terminal', prepared, { code: checkpoint.submission_code, resumed: true })
    }
    const hasSubmissionBinding = isSubmissionStage(checkpoint.stage)
    if (hasSubmissionBinding && !options.resume) {
      return failureResult(sourceKey, 'local_validation_failed', 'RESUME_REQUIRED', 'A durable submission exists; use --resume to reuse its idempotency key.')
    }
    if (hasSubmissionBinding) {
      verifySubmissionBinding(checkpoint, prepared, paths, artifactRoot)
    } else {
      checkpoint = bindSubmission(checkpoint, prepared, paths, artifactRoot, dependencies)
    }
    checkpoint = transitionCheckpoint(checkpoint, {
      stage: 'submission_pending_or_unknown',
      submission_code: 'REQUEST_DISPATCHED'
    }, paths, artifactRoot, dependencies)
    let response
    try {
      response = await sendIngestionRequest({
        endpoint: config.endpoint,
        token: config.token,
        idempotencyKey: checkpoint.idempotency_key,
        body: prepared.requestBytes
      }, dependencies)
    } catch (error) {
      if (!(error instanceof SubmissionTransportError)) throw error
      transitionUnknown(checkpoint, error.code, undefined, null, paths, artifactRoot, dependencies)
      return failureResult(sourceKey, 'submission_pending_or_unknown', error.code, error.publicMessage)
    }
    return handleSubmissionResponse(response, { sourceKey, checkpoint, prepared, paths, artifactRoot, dependencies })
  } catch (error) {
    if (error instanceof SubmissionTransportError) {
      return failureResult(sourceKey, 'submission_pending_or_unknown', error.code, error.publicMessage)
    }
    return failureResult(sourceKey, 'local_validation_failed', 'SUBMISSION_PREPARATION_FAILED', safeLocalMessage(error))
  }
}

function prepareSubmission(paths, artifactRoot, batchId, name) {
  const checkpoint = readJSONFile(paths.checkpoint, MAX_MANIFEST_BYTES, artifactRoot)
  const proposal = readJSONFile(paths.proposal, 2 * 1024 * 1024, artifactRoot)
  const validationPath = containedPath(artifactRoot, batchId, 'validation', name)
  const report = readJSONFile(validationPath, 2 * 1024 * 1024, artifactRoot)
  assertContract('checkpoint', checkpoint, 'Checkpoint')
  assertContract('proposal', proposal, 'Proposal')
  assertContract('validationReport', report, 'Validation report')
  if (!['reported', 'prepared_for_submission', 'submission_pending_or_unknown', 'submitted', 'submission_failed_terminal'].includes(checkpoint.stage)) {
    throw new Error('Checkpoint has not reached the authoritative reported stage.')
  }
  if (proposal.batch_id !== batchId || proposal.source_key !== path.basename(name, '.json') || proposal.proposal_id !== `${batchId}/${proposal.source_key}`) {
    throw new Error('Proposal identity does not match the selected batch and artifact path.')
  }
  if (checkpoint.batch_id !== batchId || checkpoint.source_key !== proposal.source_key || checkpoint.source_hash !== proposal.source_hash || checkpoint.normalized_content_hash !== proposal.normalized_content_hash) {
    throw new Error('Checkpoint identity does not match the current proposal.')
  }
  if (checkpoint.pipeline_version !== PIPELINE_VERSION || checkpoint.schema_version !== SCHEMA_VERSION || proposal.pipeline_version !== PIPELINE_VERSION || proposal.schema_version !== SCHEMA_VERSION) {
    throw new Error('Unsupported proposal or checkpoint version.')
  }
  if (checkpoint.proposal_artifact_hash !== proposalArtifactHash(proposal)) throw new Error('Proposal artifact changed after validation.')
  if (checkpoint.validation_path !== `validation/${name}` || checkpoint.validation_report_hash !== canonicalHash(report).hash) {
    throw new Error('Authoritative validation report binding is stale or mismatched.')
  }
  if (report.valid !== true || report.issues.some(isBlockingIssue)) throw new Error('Authoritative validation report contains blocking findings.')
  const expectedIdentity = `${proposal.proposal_id}@${name}`
  if ((report.findings ?? []).some((finding) => finding.current_identity !== expectedIdentity)) throw new Error('Validation finding is bound to another candidate.')
  const request = buildIngestionRequest(proposal, loadVocabularies(), report)
  const { canonical, hash: requestFingerprint } = canonicalHash(request)
  const requestBytes = Buffer.from(canonical, 'utf8')
  if (requestBytes.length > INGESTION_MAX_REQUEST_BODY_BYTES) throw new Error('Canonical ingestion request exceeds the server request-body contract.')
  assertContract('ingestionRequest', JSON.parse(canonical), 'Canonical ingestion request')
  return { checkpoint, proposal, report, request, requestBytes, requestFingerprint }
}

function bindSubmission(checkpoint, prepared, paths, artifactRoot, dependencies) {
  const idempotencyKey = (dependencies.randomUUID ?? randomUUID)()
  if (!UUID_PATTERN.test(idempotencyKey)) throw new Error('Generated idempotency key is not a UUID.')
  writeText(dependencies, paths.request, prepared.requestBytes.toString('utf8'), artifactRoot)
  const next = cleanSubmissionFields({
    ...checkpoint,
    checkpoint_version: SUBMISSION_CHECKPOINT_VERSION,
    stage: 'prepared_for_submission',
    request_path: relativeArtifact(paths.batch, paths.request),
    request_fingerprint: prepared.requestFingerprint,
    idempotency_key: idempotencyKey
  })
  writeCheckpoint(next, paths, artifactRoot, dependencies)
  return next
}

function transitionCheckpoint(checkpoint, changes, paths, artifactRoot, dependencies) {
  const base = { ...checkpoint }
  delete base.submission_code
  delete base.http_status
  delete base.retry_after_seconds
  const next = cleanSubmissionFields({ ...base, ...changes })
  if (changes.stage !== 'submitted') {
    delete next.receipt_path
    delete next.receipt_hash
  }
  writeCheckpoint(next, paths, artifactRoot, dependencies)
  return next
}

function cleanSubmissionFields(checkpoint) {
  const copy = { ...checkpoint }
  for (const key of ['submission_code', 'http_status', 'retry_after_seconds']) {
    if (copy[key] === undefined || copy[key] === null) delete copy[key]
  }
  return copy
}

function writeCheckpoint(checkpoint, paths, artifactRoot, dependencies) {
  assertContract('checkpoint', checkpoint, 'Submission checkpoint')
  writeJSON(dependencies, paths.checkpoint, checkpoint, artifactRoot)
}

function verifySubmissionBinding(checkpoint, prepared, paths, artifactRoot) {
  if (checkpoint.checkpoint_version !== SUBMISSION_CHECKPOINT_VERSION || checkpoint.request_fingerprint !== prepared.requestFingerprint) {
    throw new Error('Submission checkpoint fingerprint does not match the current canonical request.')
  }
  if (!UUID_PATTERN.test(checkpoint.idempotency_key)) throw new Error('Submission checkpoint idempotency key is invalid.')
  if (checkpoint.request_path !== relativeArtifact(paths.batch, paths.request)) throw new Error('Submission request path is invalid.')
  const stored = readBoundText(paths.request, INGESTION_MAX_REQUEST_BODY_BYTES, artifactRoot)
  if (!Buffer.from(stored, 'utf8').equals(prepared.requestBytes) || canonicalHashJSON(stored).hash !== prepared.requestFingerprint) {
    throw new Error('Stored canonical request does not match its durable fingerprint binding.')
  }
}

function verifySubmittedCheckpoint(checkpoint, prepared, paths, artifactRoot) {
  verifySubmissionBinding(checkpoint, prepared, paths, artifactRoot)
  if (checkpoint.receipt_path !== relativeArtifact(paths.batch, paths.receipt)) throw new Error('Submission receipt path is invalid.')
  const raw = readBoundText(paths.receipt, INGESTION_MAX_RESPONSE_BODY_BYTES, artifactRoot)
  if (sha256Hex(Buffer.from(raw, 'utf8')) !== checkpoint.receipt_hash) throw new Error('Stable receipt artifact hash mismatch.')
  validateReceiptBytes(Buffer.from(raw, 'utf8'), prepared)
}

export async function sendIngestionRequest(input, dependencies = {}) {
  const controller = new AbortController()
  const schedule = dependencies.setTimeout ?? setTimeout
  const unschedule = dependencies.clearTimeout ?? clearTimeout
  const timer = schedule(() => controller.abort(), INGESTION_REQUEST_TIMEOUT_MS)
  try {
    const response = await (dependencies.fetch ?? fetch)(input.endpoint, {
      method: 'POST',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotencyKey,
        Authorization: `Bearer ${input.token}`
      },
      body: input.body
    })
    if (response.status >= 300 && response.status < 400) throw new SubmissionTransportError('REDIRECT_REJECTED', 'The ingestion endpoint returned a redirect; submission outcome remains unresolved.')
    const body = await readBoundedResponse(response)
    return { status: response.status, headers: response.headers, body }
  } catch (error) {
    if (error instanceof SubmissionTransportError) throw error
    if (controller.signal.aborted || error?.name === 'AbortError') throw new SubmissionTransportError('REQUEST_TIMEOUT', 'The ingestion request timed out; resume with the same submission binding.')
    throw new SubmissionTransportError('TRANSPORT_FAILURE', 'The ingestion transport failed before a final response was verified.')
  } finally {
    unschedule(timer)
  }
}

async function readBoundedResponse(response) {
  if (!response.body) return Buffer.alloc(0)
  const reader = response.body.getReader()
  const chunks = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = Buffer.from(value)
      length += chunk.length
      if (length > INGESTION_MAX_RESPONSE_BODY_BYTES) {
        await reader.cancel().catch(() => {})
        throw new SubmissionTransportError('RESPONSE_BODY_TOO_LARGE', 'The ingestion response exceeded the bounded response contract.')
      }
      chunks.push(chunk)
    }
  } catch (error) {
    if (error instanceof SubmissionTransportError) throw error
    throw new SubmissionTransportError('RESPONSE_TRUNCATED', 'The ingestion response ended before it could be verified.')
  }
  return Buffer.concat(chunks, length)
}

function handleSubmissionResponse(response, context) {
  const { sourceKey, checkpoint, prepared, paths, artifactRoot, dependencies } = context
  if (response.status === 200 || response.status === 201) {
    try {
      const receipt = validateReceiptBytes(response.body, prepared)
      writeText(dependencies, paths.receipt, response.body.toString('utf8'), artifactRoot)
      const next = transitionCheckpoint({
        ...checkpoint,
        receipt_path: relativeArtifact(paths.batch, paths.receipt),
        receipt_hash: sha256Hex(response.body)
      }, { stage: 'submitted', http_status: response.status }, paths, artifactRoot, dependencies)
      return publicResult(sourceKey, 'submitted', prepared, {
        outcome: response.status === 201 ? 'created' : 'replayed_or_recovered',
        receipt,
        resumed: checkpoint.stage === 'submission_pending_or_unknown'
      })
    } catch {
      transitionUnknown(checkpoint, 'INVALID_SUCCESS_RESPONSE', response.status, null, paths, artifactRoot, dependencies)
      return failureResult(sourceKey, 'submission_pending_or_unknown', 'INVALID_SUCCESS_RESPONSE', 'The success response could not be bound to this submission.')
    }
  }
  if (response.status === 401 || response.status === 403) {
    transitionCheckpoint(checkpoint, { stage: 'prepared_for_submission' }, paths, artifactRoot, dependencies)
    return failureResult(sourceKey, response.status === 401 ? 'authentication_failed' : 'authorization_failed', response.status === 401 ? 'AUTHENTICATION_FAILED' : 'AUTHORIZATION_FAILED', response.status === 401 ? 'Authentication failed before ingestion.' : 'Authorization failed before ingestion.')
  }
  let problem
  try {
    problem = parseStrictJSON(response.body)
    assertContract('errorResponse', problem, 'Ingestion error response')
  } catch {
    transitionUnknown(checkpoint, 'INVALID_ERROR_RESPONSE', response.status, null, paths, artifactRoot, dependencies)
    return failureResult(sourceKey, 'submission_pending_or_unknown', 'INVALID_ERROR_RESPONSE', 'The ingestion error response could not be verified.')
  }
  const retryAfter = parseRetryAfter(response.headers.get('retry-after'))
  if (!validStatusCodePair(response.status, problem.code) || ((problem.code === 'IDEMPOTENCY_IN_PROGRESS' || problem.code === 'INGESTION_RETRYABLE_FAILURE' || problem.code === 'INGESTION_OUTCOME_UNKNOWN') && retryAfter === null)) {
    transitionUnknown(checkpoint, 'UNKNOWN_HTTP_OUTCOME', response.status, null, paths, artifactRoot, dependencies)
    return failureResult(sourceKey, 'submission_pending_or_unknown', 'UNKNOWN_HTTP_OUTCOME', 'The ingestion response status and code were not a frozen combination.')
  }
  if (TERMINAL_CODES.has(problem.code)) {
    transitionCheckpoint(checkpoint, { stage: 'submission_failed_terminal', submission_code: problem.code, http_status: response.status }, paths, artifactRoot, dependencies)
    return failureResult(sourceKey, 'submission_failed_terminal', problem.code, problem.message)
  }
  if (PENDING_CODES.has(problem.code)) {
    transitionUnknown(checkpoint, problem.code, response.status, retryAfter, paths, artifactRoot, dependencies)
    return failureResult(sourceKey, 'submission_pending_or_unknown', problem.code, problem.message, retryAfter)
  }
  transitionUnknown(checkpoint, 'UNKNOWN_HTTP_OUTCOME', response.status, null, paths, artifactRoot, dependencies)
  return failureResult(sourceKey, 'submission_pending_or_unknown', 'UNKNOWN_HTTP_OUTCOME', 'The ingestion outcome remains unresolved.')
}

function transitionUnknown(checkpoint, code, status, retryAfter, paths, artifactRoot, dependencies) {
  transitionCheckpoint(checkpoint, {
    stage: 'submission_pending_or_unknown',
    submission_code: code,
    http_status: status,
    retry_after_seconds: retryAfter ?? undefined
  }, paths, artifactRoot, dependencies)
}

function validateReceiptBytes(raw, prepared) {
  const receipt = parseStrictJSON(raw)
  assertContract('receipt', receipt, 'Stable receipt')
  if (receipt.request_fingerprint !== prepared.requestFingerprint || receipt.proposal_id !== prepared.proposal.proposal_id || receipt.normalized_content_hash !== prepared.proposal.normalized_content_hash || receipt.status !== 'candidate') {
    throw new Error('Stable receipt does not match the canonical submission identity.')
  }
  return receipt
}

function parseStrictJSON(raw) {
  const text = Buffer.from(raw).toString('utf8')
  canonicalHashJSON(text)
  return JSON.parse(text)
}

function parseRetryAfter(value) {
  if (value === null || !/^[1-9][0-9]*$/u.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function validStatusCodePair(status, code) {
  if (status === 409) return ['IDEMPOTENCY_IN_PROGRESS', 'IDEMPOTENCY_PAYLOAD_MISMATCH', 'PROPOSAL_ID_CONFLICT', 'EXACT_CONTENT_DUPLICATE', 'INGESTION_FAILED'].includes(code)
  if (status === 422) return ['INVALID_INGESTION_REQUEST', 'UNSUPPORTED_SCHEMA_VERSION', 'UNSUPPORTED_PIPELINE_VERSION'].includes(code)
  if (status === 503) return ['INGESTION_RETRYABLE_FAILURE', 'INGESTION_OUTCOME_UNKNOWN'].includes(code)
  if (status === 500) return code === 'INTERNAL_ERROR'
  if (status === 400) return ['INVALID_JSON', 'INVALID_IDEMPOTENCY_KEY'].includes(code)
  if (status === 413) return code === 'REQUEST_BODY_TOO_LARGE'
  if (status === 415) return code === 'UNSUPPORTED_MEDIA_TYPE'
  return false
}

function writeBatchState(artifactRoot, batchId, packages, dependencies) {
  const state = {
    schema_version: SCHEMA_VERSION,
    pipeline_version: PIPELINE_VERSION,
    batch_id: batchId,
    packages: packages.map(({ source_key, status, issues }) => ({ source_key, status, issues }))
  }
  assertContract('batchState', state, 'Submission batch state')
  const paths = artifactPaths(artifactRoot, batchId, 'batch-state')
  writeJSON(dependencies, paths.batchState, state, artifactRoot)
}

function submissionSummary(batchId, packages) {
  return {
    schema_version: SCHEMA_VERSION,
    pipeline_version: PIPELINE_VERSION,
    batch_id: batchId,
    counts: packages.reduce((counts, entry) => ({ ...counts, [entry.status]: (counts[entry.status] ?? 0) + 1 }), {}),
    packages
  }
}

function publicResult(sourceKey, status, prepared, extra = {}) {
  return {
    source_key: sourceKey,
    status,
    issues: [],
    proposal_id: prepared.proposal.proposal_id,
    request_fingerprint: prepared.requestFingerprint,
    ...extra
  }
}

function failureResult(sourceKey, status, code, message, retryAfter = null) {
  const result = { source_key: sourceKey, status, issues: [issue('$', code, message, 'import')], code }
  if (retryAfter !== null) result.retry_after_seconds = retryAfter
  return result
}

function assertContract(name, value, label) {
  const validation = validateContract(name, value)
  if (!validation.valid) throw new Error(`${label} violates its contract: ${validation.issues.map((entry) => `${entry.path} ${entry.code}`).join(', ')}`)
}

function readBoundText(filePath, maxBytes, artifactRoot) {
  const stat = fs.lstatSync(filePath)
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Bound submission artifact must be a regular non-symbolic file.')
  assertRealPathContained(artifactRoot, filePath)
  if (stat.size > maxBytes) throw new Error('Bound submission artifact exceeds its contract limit.')
  return fs.readFileSync(filePath, 'utf8')
}

function relativeArtifact(root, filePath) {
  return path.relative(path.resolve(root), filePath).split(path.sep).join('/')
}

function isSubmissionStage(stage) {
  return ['prepared_for_submission', 'submission_pending_or_unknown', 'submitted', 'submission_failed_terminal'].includes(stage)
}

function writeJSON(dependencies, filePath, value, artifactRoot) {
  return (dependencies.atomicWriteJSON ?? atomicWriteJSON)(filePath, value, artifactRoot)
}

function writeText(dependencies, filePath, value, artifactRoot) {
  return (dependencies.atomicWriteText ?? atomicWriteText)(filePath, value, artifactRoot)
}

function safeLocalMessage(error) {
  return error instanceof Error ? error.message : 'Submission preparation failed.'
}

export class SubmissionTransportError extends Error {
  constructor(code, publicMessage) {
    super(publicMessage)
    this.name = 'SubmissionTransportError'
    this.code = code
    this.publicMessage = publicMessage
  }
}
