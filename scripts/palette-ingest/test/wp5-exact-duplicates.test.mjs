import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { CONTRACT_ROOT, PIPELINE_VERSION } from '../lib/constants.mjs'
import {
  EMPTY_CATALOG_SNAPSHOT,
  detectExactDuplicates,
  issuesForFindings,
  validateCatalogSnapshot
} from '../lib/exact-duplicates.mjs'
import { ISSUE_CODE_POLICY, duplicateIssue, isBlockingIssue } from '../lib/issue-policy.mjs'
import { canonicalHash, canonicalize } from '../lib/jcs.mjs'
import {
  buildIngestionRequest,
  hashInputFromProposal,
  prepareProposal,
  runBatch
} from '../lib/pipeline.mjs'
import { validateContract } from '../lib/schema-validation.mjs'

const manifestFixture = path.join(CONTRACT_ROOT, 'fixtures/valid/manual-basic/manifest.json')
const hashA = 'a'.repeat(64)
const hashB = 'b'.repeat(64)

test('verified normalized content hash is the only exact content fingerprint', () => {
  const base = proposalFor({ batchId: 'batch-a', sourceKey: 'source-a', sourceHash: hashA })
  const metadataChanged = proposalFor({ batchId: 'batch-b', sourceKey: 'source-b', sourceHash: hashB })
  assert.equal(base.normalized_content_hash, metadataChanged.normalized_content_hash)
  assert.equal(canonicalHash(hashInputFromProposal(base)).hash, base.normalized_content_hash)

  const originalHashInput = hashInputFromProposal(base)
  const reorderedObject = {
    preview_cases: originalHashInput.preview_cases,
    palette: originalHashInput.palette,
    colors: originalHashInput.colors,
    schema_version: originalHashInput.schema_version
  }
  assert.equal(canonicalHash(reorderedObject).hash, base.normalized_content_hash)

  const colorOrderChanged = proposalFor({ mutateManifest: (manifest) => manifest.supplied_fields.colors.reverse() })
  const metadataFieldChanged = proposalFor({ mutateManifest: (manifest) => manifest.supplied_fields.tags = ['bold'] })
  const previewChanged = proposalFor({ mutateManifest: (manifest) => manifest.supplied_preview_cases = [validPreview()] })
  assert.notEqual(colorOrderChanged.normalized_content_hash, base.normalized_content_hash)
  assert.notEqual(metadataFieldChanged.normalized_content_hash, base.normalized_content_hash)
  assert.notEqual(previewChanged.normalized_content_hash, base.normalized_content_hash)

  const diagnosticsChanged = structuredClone(base)
  diagnosticsChanged.validation.issues = [{ path: '$.note', code: 'CHANGED_MESSAGE', message: 'Changed.', severity: 'warning', source: 'domain' }]
  diagnosticsChanged.internal_evidence = { absolute_path: '/private/does-not-count', caption: 'does not count' }
  assert.equal(canonicalHash(hashInputFromProposal(diagnosticsChanged)).hash, base.normalized_content_hash)
})

test('batch clusters and pairwise findings are deterministic without choosing a winner', () => {
  const candidates = [
    candidate('batch/c', 'source-c', hashA, hashB),
    candidate('batch/a', 'source-a', hashA, hashB),
    candidate('batch/b', 'source-b', hashA, hashB),
    candidate('batch/independent', 'source-d', hashB, hashA)
  ]
  const first = detectExactDuplicates(candidates)
  const reversed = detectExactDuplicates([...candidates].reverse())
  assert.equal(first.valid, true)
  assert.equal(first.contextHash, reversed.contextHash)
  assert.equal(canonicalFindings(first), canonicalFindings(reversed))

  for (const identity of ['batch/a', 'batch/b', 'batch/c']) {
    const contentMatches = first.findingsByProposal.get(identity).filter((entry) => entry.code === 'EXACT_CONTENT_DUPLICATE')
    assert.equal(contentMatches.length, 2)
    assert.ok(contentMatches.every((entry) => entry.current_identity === identity))
  }
  assert.deepEqual(first.findingsByProposal.get('batch/independent'), [])
  assert.equal(candidates.length, 4, 'detector must not delete or merge candidates')
})

test('candidate identity is required and unique before Map construction', () => {
  for (const candidates of [
    [candidate('', 'source-a', hashA, hashB)],
    [{ source_key: 'source-a', source_hash: hashA, normalized_content_hash: hashB }],
    [candidate('batch/same', 'source-a', hashA, hashB), candidate('batch/same', 'source-b', hashB, hashA)],
    [
      { ...candidate('fallback-a', 'source-a', hashA, hashB), identity: 'explicit-same' },
      { ...candidate('fallback-b', 'source-b', hashB, hashA), identity: 'explicit-same' }
    ]
  ]) {
    const result = detectExactDuplicates(candidates)
    assert.equal(result.valid, false)
    assert.equal(result.contextHash, null)
    assert.equal(result.findingsByProposal.size, 0)
    assert.ok(result.issues.some((entry) => entry.code === 'INVALID_CANDIDATE_IDENTITY' || entry.code === 'DUPLICATE_CANDIDATE_IDENTITY'))
  }
})

test('explicit candidate identity uses own-property presence and never nullish fallback', () => {
  for (const explicitIdentity of [null, '', '   ', 123]) {
    const result = detectExactDuplicates([{
      identity: explicitIdentity,
      proposal_id: 'valid-fallback',
      source_key: 'source-a',
      source_hash: hashA,
      normalized_content_hash: hashB
    }])
    assert.equal(result.valid, false)
    assert.equal(result.contextHash, null)
    assert.equal(result.findingsByProposal.size, 0)
    assert.deepEqual(result.issues.map((entry) => entry.code), ['INVALID_CANDIDATE_IDENTITY'])
    assert.equal(result.issues[0].path, '$[0].identity')
  }

  const invalidBeforeDuplicateCheck = detectExactDuplicates([
    { identity: null, proposal_id: 'shared-fallback', source_key: 'source-a', source_hash: hashA, normalized_content_hash: hashB },
    { proposal_id: 'shared-fallback', source_key: 'source-b', source_hash: hashB, normalized_content_hash: hashB }
  ])
  assert.deepEqual(invalidBeforeDuplicateCheck.issues.map((entry) => entry.code), ['INVALID_CANDIDATE_IDENTITY'])
  assert.equal(invalidBeforeDuplicateCheck.findingsByProposal.size, 0)

  const fallbackOnly = detectExactDuplicates([
    candidate('fallback-a', 'source-a', hashA, hashB),
    candidate('fallback-b', 'source-b', hashB, hashB)
  ])
  assert.equal(fallbackOnly.valid, true)
  assert.deepEqual([...fallbackOnly.findingsByProposal.keys()], ['fallback-a', 'fallback-b'])

  const explicit = [
    { ...candidate('ignored-proposal-z', 'source-a', hashA, hashB), identity: 'explicit-a' },
    { ...candidate('ignored-proposal-a', 'source-b', hashB, hashB), identity: 'explicit-b' }
  ]
  const explicitResult = detectExactDuplicates(explicit)
  assert.deepEqual([...explicitResult.findingsByProposal.keys()], ['explicit-a', 'explicit-b'])
  assert.equal(explicitResult.findingsByProposal.get('explicit-a')[0].matched_identity, 'explicit-b')
  const changedFallbacks = explicit.map((entry, index) => ({ ...entry, proposal_id: `changed-${index}` }))
  assert.equal(detectExactDuplicates(changedFallbacks).contextHash, explicitResult.contextHash)

  const inherited = Object.create({ identity: 'inherited-must-not-win' })
  Object.assign(inherited, candidate('own-fallback', 'source-c', hashA, hashA))
  const inheritedResult = detectExactDuplicates([inherited])
  assert.equal(inheritedResult.valid, true)
  assert.deepEqual([...inheritedResult.findingsByProposal.keys()], ['own-fallback'])
})

test('source identity findings stay distinct from canonical content findings', () => {
  const sameSourceDifferentContent = detectExactDuplicates([
    candidate('batch/a', 'same-key', hashA, hashA),
    candidate('batch/b', 'same-key', hashA, hashB)
  ])
  const codes = sameSourceDifferentContent.findingsByProposal.get('batch/a').map((entry) => entry.code)
  assert.ok(codes.includes('DUPLICATE_SOURCE_KEY'))
  assert.ok(codes.includes('EXACT_SOURCE_HASH_DUPLICATE'))
  assert.ok(!codes.includes('EXACT_CONTENT_DUPLICATE'))

  const sameContentDifferentSource = detectExactDuplicates([
    candidate('batch/a', 'source-a', hashA, hashB),
    candidate('batch/b', 'source-b', hashB, hashB)
  ])
  assert.deepEqual(sameContentDifferentSource.findingsByProposal.get('batch/a').map((entry) => entry.code), ['EXACT_CONTENT_DUPLICATE'])
})

test('catalog snapshot is a strict official read-only comparison boundary', () => {
  const candidateInput = [candidate('batch/a', 'source-a', hashA, hashB)]
  const snapshot = {
    snapshot_version: 1,
    fingerprint_version: 1,
    records: [
      catalogRecord('draft-record', hashB, 'draft'),
      catalogRecord('candidate-record', hashB, 'candidate'),
      catalogRecord('published-record', hashB, 'published'),
      catalogRecord('similar-record', `${hashB.slice(0, -1)}c`, 'published')
    ]
  }
  assert.equal(validateCatalogSnapshot(snapshot).valid, true)
  const result = detectExactDuplicates(candidateInput, snapshot)
  assert.deepEqual(
    result.findingsByProposal.get('batch/a').map((entry) => entry.matched_identity),
    ['candidate-record', 'published-record']
  )
  assert.ok(result.findingsByProposal.get('batch/a').every((entry) => entry.code === 'EXACT_CATALOG_CONTENT_MATCH'))

  for (const invalid of [
    { records: [] },
    { snapshot_version: 1, fingerprint_version: 1, records: [{ ...catalogRecord('private', hashB, 'published'), visibility: 'private' }] },
    { snapshot_version: 1, fingerprint_version: 1, records: [{ ...catalogRecord('owned', hashB, 'published'), owner_user_id: 'user-1' }] },
    { snapshot_version: 1, fingerprint_version: 1, records: [{ ...catalogRecord('default', hashB, 'published'), origin: 'default' }] }
  ]) assert.equal(validateCatalogSnapshot(invalid).valid, false)
  assert.equal(validateCatalogSnapshot(readJSON(path.join(CONTRACT_ROOT, 'fixtures/catalog/valid-official.json'))).valid, true)
  assert.equal(validateCatalogSnapshot(readJSON(path.join(CONTRACT_ROOT, 'fixtures/catalog/invalid-private.json'))).valid, false)
})

test('duplicate report and batch index fixtures execute against versioned schemas', () => {
  const detected = detectExactDuplicates([
    candidate('batch/a', 'source-a', hashA, hashB),
    candidate('batch/b', 'source-b', hashB, hashB)
  ])
  const findings = detected.findingsByProposal.get('batch/a')
  const issues = issuesForFindings(findings)
  assert.equal(validateContract('validationReport', { valid: false, issues, findings }).valid, true)
  assert.equal(validateContract('exactDuplicateIndex', {
    schema_version: 1,
    fingerprint_version: 1,
    issue_policy_version: 1,
    context_hash: detected.contextHash,
    findings: [...detected.findingsByProposal.values()].flat()
  }).valid, true)
})

test('central policy controls severity/blocking and fails closed for unknown duplicate codes', () => {
  assert.deepEqual(ISSUE_CODE_POLICY.EXACT_CONTENT_DUPLICATE, {
    severity: 'error', source: 'duplicate', blocking: true, review_import_policy_status: 'blocked_current_batch'
  })
  assert.equal(isBlockingIssue(duplicateIssue('EXACT_CONTENT_DUPLICATE', '$.normalized_content_hash', 'wording one')), true)
  assert.equal(isBlockingIssue(duplicateIssue('EXACT_CATALOG_CONTENT_MATCH', '$.normalized_content_hash', 'different wording')), false)
  assert.throws(() => duplicateIssue('UNKNOWN_DUPLICATE', '$', 'unknown'), /Unknown duplicate issue code/)
})

test('validate pipeline excludes invalid hashes, blocks batch duplicates, and preserves independent proposals', () => withWorkspace(({ batch, artifacts }) => {
  const batchId = path.basename(batch)
  const duplicateA = proposalFor({ batchId, sourceKey: 'duplicate-a', sourceHash: hashA })
  const duplicateB = proposalFor({ batchId, sourceKey: 'duplicate-b', sourceHash: hashB })
  const independent = proposalFor({ batchId, sourceKey: 'independent', sourceHash: 'c'.repeat(64), mutateManifest: (manifest) => manifest.supplied_fields.colors.reverse() })
  const forged = proposalFor({ batchId, sourceKey: 'forged', sourceHash: 'd'.repeat(64) })
  forged.normalized_content_hash = hashA
  writeProposal(artifacts, batchId, 'z-duplicate.json', duplicateB)
  writeProposal(artifacts, batchId, 'a-duplicate.json', duplicateA)
  writeProposal(artifacts, batchId, 'independent.json', independent)
  writeProposal(artifacts, batchId, 'forged.json', forged)

  const first = runBatch('validate', { batch, artifacts })
  assert.equal(first.counts.validation_failed, 3)
  assert.equal(first.counts.validated, 1)
  assert.equal(first.packages.find((entry) => entry.source_key === 'forged').findings.length, 0)
  assert.ok(first.packages.find((entry) => entry.source_key === 'forged').issues.some((entry) => entry.code === 'NORMALIZED_HASH_MISMATCH'))
  assert.equal(first.packages.find((entry) => entry.source_key === 'independent').status, 'validated')
  for (const sourceKey of ['duplicate-a', 'duplicate-b']) {
    const result = first.packages.find((entry) => entry.source_key === sourceKey)
    assert.ok(result.issues.some((entry) => entry.code === 'EXACT_CONTENT_DUPLICATE'))
    assert.equal(validateContract('validationReport', result.report).valid, true)
  }

  const stateBefore = fs.readFileSync(path.join(artifacts, batchId, 'batch.json'), 'utf8')
  const reportsBefore = readReports(artifacts, batchId)
  const second = runBatch('validate', { batch, artifacts, resume: true })
  assert.equal(canonicalize(second.packages.map(stripRuntime)), canonicalize(first.packages.map(stripRuntime)))
  assert.ok(second.packages.filter((entry) => entry.report).every((entry) => entry.resumed === true))
  assert.equal(fs.readFileSync(path.join(artifacts, batchId, 'batch.json'), 'utf8'), stateBefore)
  assert.deepEqual(readReports(artifacts, batchId), reportsBefore)

  const tamperedReportPath = path.join(artifacts, batchId, 'validation', 'independent.json')
  const tamperedReport = readJSON(tamperedReportPath)
  tamperedReport.issues.push({ path: '$.tampered', code: 'TAMPERED', message: 'Tampered.', severity: 'warning', source: 'domain' })
  fs.writeFileSync(tamperedReportPath, `${JSON.stringify(tamperedReport, null, 2)}\n`)
  const repaired = runBatch('validate', { batch, artifacts, resume: true })
  assert.equal(repaired.packages.find((entry) => entry.source_key === 'independent').resumed, false)
  assert.equal(fs.readFileSync(tamperedReportPath, 'utf8'), reportsBefore['independent.json'])
}) )

test('validate pipeline blocks duplicate source keys without conflating different content', () => withWorkspace(({ batch, artifacts }) => {
  const batchId = path.basename(batch)
  const first = proposalFor({ batchId, sourceKey: 'same-source', sourceHash: hashA })
  const second = proposalFor({ batchId, sourceKey: 'same-source', sourceHash: hashB, mutateManifest: (manifest) => manifest.supplied_fields.colors.reverse() })
  writeProposal(artifacts, batchId, 'first.json', first)
  writeProposal(artifacts, batchId, 'second.json', second)
  const result = runBatch('validate', { batch, artifacts })
  assert.equal(result.counts.validation_failed, 2)
  for (const entry of result.packages) {
    assert.ok(entry.issues.some((issue) => issue.code === 'DUPLICATE_SOURCE_KEY'))
    assert.ok(!entry.issues.some((issue) => issue.code === 'EXACT_SOURCE_HASH_DUPLICATE' || issue.code === 'EXACT_CONTENT_DUPLICATE'))
  }
}))

test('catalog exact findings remain auditable non-blocking warnings in validate reports', () => withWorkspace(({ batch, artifacts }) => {
  const batchId = path.basename(batch)
  const proposal = proposalFor({ batchId, sourceKey: 'catalog-match', sourceHash: hashA })
  writeProposal(artifacts, batchId, 'catalog-match.json', proposal)
  const catalogSnapshot = {
    snapshot_version: 1,
    fingerprint_version: 1,
    records: [catalogRecord('existing-candidate', proposal.normalized_content_hash, 'candidate')]
  }
  const result = runBatch('validate', { batch, artifacts, catalogSnapshot })
  assert.equal(result.counts.validated, 1)
  assert.equal(result.packages[0].report.valid, true)
  assert.equal(result.packages[0].issues[0].code, 'EXACT_CATALOG_CONTENT_MATCH')
  assert.equal(result.packages[0].issues[0].severity, 'warning')
  assert.equal(result.packages[0].findings[0].matched_identity, 'existing-candidate')
}))

test('catalog record order leaves context, index, reports, and resume unchanged', () => withWorkspace(({ batch, artifacts }) => {
  const batchId = path.basename(batch)
  const proposal = proposalFor({ batchId, sourceKey: 'catalog-order', sourceHash: hashA })
  writeProposal(artifacts, batchId, 'catalog-order.json', proposal)
  const records = [
    catalogRecord('catalog-a', proposal.normalized_content_hash, 'published'),
    catalogRecord('catalog-b', proposal.normalized_content_hash, 'candidate')
  ]
  const snapshot = { snapshot_version: 1, fingerprint_version: 1, records }
  const reversedSnapshot = { ...snapshot, records: [...records].reverse() }
  const direct = detectExactDuplicates([candidate('batch/catalog-order', 'catalog-order', hashA, proposal.normalized_content_hash)], snapshot)
  const directReversed = detectExactDuplicates([candidate('batch/catalog-order', 'catalog-order', hashA, proposal.normalized_content_hash)], reversedSnapshot)
  assert.equal(direct.contextHash, directReversed.contextHash)
  assert.equal(canonicalFindings(direct), canonicalFindings(directReversed))

  const first = runBatch('validate', { batch, artifacts, catalogSnapshot: snapshot })
  const reportBefore = fs.readFileSync(path.join(artifacts, batchId, 'validation', 'catalog-order.json'), 'utf8')
  const indexBefore = fs.readFileSync(path.join(artifacts, batchId, 'duplicates', 'exact-index.json'), 'utf8')
  const second = runBatch('validate', { batch, artifacts, catalogSnapshot: reversedSnapshot, resume: true })
  assert.equal(first.packages[0].report.valid, true)
  assert.equal(second.packages[0].resumed, true)
  assert.equal(fs.readFileSync(path.join(artifacts, batchId, 'validation', 'catalog-order.json'), 'utf8'), reportBefore)
  assert.equal(fs.readFileSync(path.join(artifacts, batchId, 'duplicates', 'exact-index.json'), 'utf8'), indexBefore)
}))

test('duplicate evidence never changes proposal, request, or normalized identity', () => {
  const proposal = proposalFor({})
  const before = structuredClone(proposal)
  const requestBefore = buildIngestionRequest(proposal)
  const result = detectExactDuplicates([
    candidate('batch/a', 'source-a', hashA, proposal.normalized_content_hash),
    candidate('batch/b', 'source-b', hashB, proposal.normalized_content_hash)
  ])
  const issues = issuesForFindings(result.findingsByProposal.get('batch/a'))
  assert.ok(issues.length > 0)
  assert.deepEqual(proposal, before)
  assert.equal(canonicalize(buildIngestionRequest(proposal)), canonicalize(requestBefore))
  assert.equal(canonicalHash(hashInputFromProposal(proposal)).hash, proposal.normalized_content_hash)
})

function proposalFor({ batchId = 'fixture-batch', sourceKey = 'manual-basic', sourceHash = hashA, mutateManifest = () => {} }) {
  const manifest = readJSON(manifestFixture)
  manifest.source_key = sourceKey
  mutateManifest(manifest)
  return prepareProposal({ manifest, batchId, sourceHash }).proposal
}

function candidate(proposal_id, source_key, source_hash, normalized_content_hash) {
  return { proposal_id, source_key, source_hash, normalized_content_hash }
}

function catalogRecord(record_id, normalized_content_hash, status) {
  return { record_id, normalized_content_hash, visibility: 'public', status, origin: 'curated', owner_user_id: null }
}

function canonicalFindings(result) {
  return canonicalize([...result.findingsByProposal.entries()].sort(([left], [right]) => left.localeCompare(right)))
}

function validPreview() {
  return {
    chart_type: 'bar_error', template_id: 'bar_error_v1', template_version: 1, schema_version: 1,
    color_roles: {
      groups: [{ key: 'g1', label: 'G1', fill: { source: 'palette', color_id: 'color-1' } }],
      elements: Object.fromEntries(['axis', 'grid', 'text', 'error_bar', 'background'].map((key) => [key, { source: 'theme', token: key === 'grid' ? 'grid' : key === 'background' ? 'background' : 'foreground' }]))
    },
    preview_config: { orientation: 'vertical', sample_size: 12, error_type: 'sem', data_pattern: 'mixed' }, seed_strategy: 'stable_id'
  }
}

function withWorkspace(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'figcolor-wp5-'))
  const batch = path.join(root, 'exact-batch')
  const artifacts = path.join(root, 'artifacts')
  fs.mkdirSync(batch, { recursive: true })
  try { return run({ batch, artifacts }) } finally { fs.rmSync(root, { recursive: true, force: true }) }
}

function writeProposal(artifacts, batchId, name, proposal) {
  const directory = path.join(artifacts, batchId, 'proposals')
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, name), `${JSON.stringify(proposal, null, 2)}\n`)
}

function readReports(artifacts, batchId) {
  const directory = path.join(artifacts, batchId, 'validation')
  return Object.fromEntries(fs.readdirSync(directory).sort().map((name) => [name, fs.readFileSync(path.join(directory, name), 'utf8')]))
}

function stripRuntime(result) {
  const { proposal: _proposal, report: _report, resumed: _resumed, ...rest } = result
  return JSON.parse(JSON.stringify(rest))
}

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}
