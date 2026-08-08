import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { CONTRACT_ROOT, PIPELINE_VERSION, loadVocabularies } from '../lib/constants.mjs'
import { canonicalHash } from '../lib/jcs.mjs'
import { IngestionRequestValidationError, buildIngestionRequest, computeSourceHash, prepareProposal } from '../lib/pipeline.mjs'
import { validateContract } from '../lib/schema-validation.mjs'

const vocabularies = loadVocabularies()
const manifest = JSON.parse(fs.readFileSync(path.join(CONTRACT_ROOT, 'fixtures/valid/manual-basic/manifest.json'), 'utf8'))

function proposal() {
  const value = structuredClone(manifest)
  return prepareProposal({ manifest: value, batchId: 'wp6-evidence', sourceHash: computeSourceHash(value) }).proposal
}

function exactFinding(currentIdentity) {
  return {
    kind: 'canonical_content', fingerprint_type: 'normalized_content_hash', fingerprint_version: 1,
    fingerprint: 'a'.repeat(64), current_identity: currentIdentity, matched_identity: 'catalog/palette-1',
    scope: 'catalog_snapshot', path: '$.normalized_content_hash', code: 'EXACT_CATALOG_CONTENT_MATCH',
    message: 'Exact catalog content match.', severity: 'warning', source: 'duplicate'
  }
}

test('builder places authoritative evidence in canonical metadata without mutating inputs', () => {
  const input = proposal()
  input.internal_evidence.source_reference = 'protected://figure/1'
  const report = {
    valid: true,
    issues: [{ path: '$.palette.tags', code: 'REVIEW_TAGS', message: 'Review tags.', severity: 'warning', source: 'domain' }],
    findings: [exactFinding(input.proposal_id)]
  }
  const beforeProposal = structuredClone(input)
  const beforeReport = structuredClone(report)
  const request = buildIngestionRequest(input, vocabularies, report)
  assert.deepEqual(request.ingestion_metadata.validation_issues, report.issues)
  assert.deepEqual(request.ingestion_metadata.duplicate_evidence, report.findings)
  assert.equal(request.ingestion_metadata.source_reference, 'protected://figure/1')
  assert.equal(request.ingestion_metadata.pipeline_version, PIPELINE_VERSION)
  assert.equal(validateContract('ingestionRequest', request).valid, true)
  assert.deepEqual(input, beforeProposal)
  assert.deepEqual(report, beforeReport)
})

test('missing legacy evidence arrays become explicit empty arrays and absent source stays omitted', () => {
  const request = buildIngestionRequest(proposal(), vocabularies, { valid: true })
  assert.deepEqual(request.ingestion_metadata.validation_issues, [])
  assert.deepEqual(request.ingestion_metadata.duplicate_evidence, [])
  assert.equal(Object.hasOwn(request.ingestion_metadata, 'source_reference'), false)
  assert.equal(validateContract('ingestionRequest', request).valid, true)
})

test('malformed evidence and null source reference fail closed', () => {
  for (const report of [{ valid: true, issues: {} }, { valid: true, findings: 'none' }]) {
    assert.throws(() => buildIngestionRequest(proposal(), vocabularies, report), IngestionRequestValidationError)
  }
  const input = proposal()
  input.internal_evidence.source_reference = null
  assert.throws(() => buildIngestionRequest(input), IngestionRequestValidationError)
})

test('all evidence participates in deterministic JCS request fingerprint', () => {
  const input = proposal()
  const base = buildIngestionRequest(input)
  const issue = structuredClone(base)
  issue.ingestion_metadata.validation_issues.push({ path: '$.x', code: 'REVIEW_X', message: 'Review.', severity: 'warning', source: 'domain' })
  const finding = structuredClone(base)
  finding.ingestion_metadata.duplicate_evidence.push(exactFinding(input.proposal_id))
  const source = structuredClone(base)
  source.ingestion_metadata.source_reference = 'protected://figure/1'
  assert.notEqual(canonicalHash(base).hash, canonicalHash(issue).hash)
  assert.notEqual(canonicalHash(base).hash, canonicalHash(finding).hash)
  assert.notEqual(canonicalHash(base).hash, canonicalHash(source).hash)
  assert.equal(canonicalHash(base).hash, canonicalHash(JSON.parse(JSON.stringify(base))).hash)
})

test('receipt and error response contracts are strict', () => {
  const receipt = { proposal_id: 'p', normalized_content_hash: 'a'.repeat(64), request_fingerprint: 'b'.repeat(64), palette_id: 'palette', slug: 'palette', status: 'candidate', preview_case_ids: [] }
  assert.equal(validateContract('receipt', receipt).valid, true)
  const missing = structuredClone(receipt); delete missing.request_fingerprint
  assert.equal(validateContract('receipt', missing).valid, false)
  assert.equal(validateContract('receipt', { ...receipt, outcome: 'REPLAY' }).valid, false)
  assert.equal(validateContract('errorResponse', { code: 'INVALID_JSON', message: 'Invalid JSON.' }).valid, true)
  assert.equal(validateContract('errorResponse', { code: 'INTERNAL_ERROR', message: 'Failed.', sql: 'SELECT secret' }).valid, false)
})
