import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { CONTRACT_ROOT, PIPELINE_VERSION } from '../lib/constants.mjs'
import { detectExactDuplicates, EMPTY_CATALOG_SNAPSHOT } from '../lib/exact-duplicates.mjs'
import { canonicalHash } from '../lib/jcs.mjs'
import { duplicateIssue, ISSUE_CODE_POLICY } from '../lib/issue-policy.mjs'
import { detectPerceptualSimilarities } from '../lib/perceptual-similarity.mjs'
import { prepareProposal, runBatch } from '../lib/pipeline.mjs'
import { renderValidationSummary, validationSummaryHash, ValidationSummaryError } from '../lib/validation-summary.mjs'

const fixture = path.join(CONTRACT_ROOT, 'fixtures/valid/manual-basic/manifest.json')

test('review summary renders authoritative exact/perceptual evidence and empty sections', () => {
  const input = reportingInput()
  const markdown = renderValidationSummary(input)
  assert.match(markdown, /# Palette ingestion validation summary/)
  assert.match(markdown, /\| Pipeline version \| palette-ingest-wp5-reporting\.1 \|/)
  assert.match(markdown, /## Candidate: report-batch\/near-a@a\.json/)
  assert.match(markdown, /\| Ordered HEX colors \| #4E79A7, #F28E2B, #59A14F \|/)
  assert.match(markdown, /### Exact duplicate evidence\n\n_None\._/)
  assert.match(markdown, /#### NEAR_DUPLICATE_CONTENT → report-batch\/near-b@b\.json/)
  assert.match(markdown, /\| Mean threshold \| 0\.035 \|/)
  assert.match(markdown, /\| 0 \| 0 \| #4E79A7 \| #4F7AA8 \|/)
  assert.match(markdown, /\| Review\/import policy \| deferred_wp6 \|/)
  assert.equal(validationSummaryHash(markdown), validationSummaryHash(renderValidationSummary(input)))
})

test('summary ordering is byte-equivalent for reversed candidates, findings, catalog, and matched pairs', () => {
  const input = reportingInput()
  const expected = renderValidationSummary(input)
  const reversed = structuredClone(input)
  reversed.candidates.reverse()
  reversed.catalogSnapshot.records.reverse()
  reversed.exactIndex.findings.reverse()
  reversed.similarityIndex.findings.reverse()
  for (const candidate of reversed.candidates) {
    candidate.report.findings.reverse()
    for (const finding of candidate.report.findings) finding.matched_pairs?.reverse()
  }
  refreshHashes(reversed)
  assert.equal(renderValidationSummary(reversed), expected)
})

test('display text is escaped, controls are visible, unicode is stable, and long names truncate deterministically', () => {
  const input = reportingInput({ single: true })
  input.candidates[0].proposal.palette.name.value = `# fake | \`cell\`\n\u202E${'x'.repeat(200)} café`
  input.candidates[0].proposal.normalized_content_hash = canonicalHash(canonicalProposalContent(input.candidates[0].proposal)).hash
  input.candidates[0].report.issues = [{ path: '$.name', code: 'DISPLAY_TEST', message: 'line|break\n\u0001 café', severity: 'warning', source: 'domain' }]
  input.candidates[0].report.valid = true
  refreshHashes(input)
  const markdown = renderValidationSummary(input)
  assert.match(markdown, /# fake \\| \\`cell\\`\\u000a\\u202e/)
  assert.match(markdown, /line\\\|break\\u000a\\u0001/)
  assert.match(markdown, /…/)
  assert.match(markdown, /café|café/u)
  assert.doesNotMatch(markdown, /\n# fake/u)
})

test('reporter fails closed for unknown policy, mismatched classification, identity ambiguity, evidence, schema, and hashes', () => {
  for (const mutate of [
    (input) => { input.similarityIndex.findings[0].code = 'UNKNOWN_FINDING' },
    (input) => { input.similarityIndex.findings[0].severity = 'error' },
    (input) => { input.candidates[1].identity = input.candidates[0].identity },
    (input) => { input.similarityIndex.findings[0].matched_pairs = [] },
    (input) => { delete input.candidates[0].report.valid },
    (input) => { input.hashes.exactIndex = 'f'.repeat(64) },
    (input) => { input.similarityIndex.findings[0].current_identity = 'missing/candidate' }
  ]) {
    const input = reportingInput()
    mutate(input)
    assert.throws(() => renderValidationSummary(input), ValidationSummaryError)
  }
})

test('duplicate issue policy uses own properties and rejects unknown codes and severity mismatch before rendering', () => {
  for (const [code, mutate, expectedPath] of [
    ['REPORT_UNKNOWN_DUPLICATE_ISSUE_CODE', (input) => input.candidates[0].report.issues.push({ path: '$.colors', code: 'UNKNOWN_DUPLICATE', message: 'unknown', severity: 'warning', source: 'duplicate' }), '$.candidates[0].report.issues[1].code'],
    ['REPORT_ISSUE_POLICY_MISMATCH', (input) => { input.candidates[0].report.issues[0].severity = 'error' }, '$.candidates[0].report.issues[0].severity']
  ]) {
    const input = reportingInput()
    mutate(input)
    refreshHashes(input)
    const issue = reporterIssue(input, code)
    assert.equal(issue.path, expectedPath)
  }
})

test('lowercase prototype-chain issue code is rejected by the authoritative issue Schema', () => {
  const input = reportingInput()
  input.candidates[0].report.issues[0].code = 'constructor'
  refreshHashes(input)
  const issue = reporterIssue(input, 'REPORT_DEPENDENCY_SCHEMA_INVALID')
  assert.equal(issue.path, '$.candidates[0].report')
})

test('rejects findings attached to the wrong candidate with an exact candidate path', () => {
  const input = reportingInput()
  const [candidateA, candidateB] = input.candidates
  ;[candidateA.report.findings, candidateB.report.findings] = [candidateB.report.findings, candidateA.report.findings]
  ;[candidateA.report.issues, candidateB.report.issues] = [candidateB.report.issues, candidateA.report.issues]
  refreshHashes(input)
  const issue = reporterIssue(input, 'REPORT_FINDING_CANDIDATE_MISMATCH')
  assert.equal(issue.path, '$.candidates[0].report.findings[0].current_identity')
  assert.match(issue.message, /belongs to "report-batch\/near-b@b\.json", not containing candidate "report-batch\/near-a@a\.json"/)
})

test('finding-to-issue multiset rejects missing, orphan, count mismatch, and exact/perceptual cross-match', () => {
  const cases = [
    (input) => { input.candidates[0].report.issues = [] },
    (input) => { input.candidates[0].report.findings = []; input.similarityIndex.findings = input.similarityIndex.findings.filter((finding) => finding.current_identity !== input.candidates[0].identity) },
    (input) => { input.candidates[0].report.findings.push(structuredClone(input.candidates[0].report.findings[0])); input.similarityIndex.findings.push(structuredClone(input.candidates[0].report.findings[0])) },
    (input) => { input.candidates[0].report.issues[0] = duplicateIssue('EXACT_CONTENT_DUPLICATE', '$.normalized_content_hash', 'not parsed'); input.candidates[0].report.valid = false },
    (input) => { input.candidates[0].report.issues[0] = duplicateIssue('NEAR_CATALOG_CONTENT_MATCH', '$.colors', 'scope is represented by code') }
  ]
  for (const mutate of cases) {
    const input = reportingInput()
    mutate(input)
    refreshHashes(input)
    const issue = reporterIssue(input, 'REPORT_FINDING_ISSUE_COUNT_MISMATCH')
    assert.equal(issue.path, '$.candidates[0].report')
    assert.match(issue.message, /Structured findings require \d+ duplicate issue\(s\).+contains \d+/)
  }

  const exact = reportingInput({ exact: true })
  exact.candidates[0].report.issues = []
  exact.candidates[0].report.valid = true
  refreshHashes(exact)
  assert.equal(reporterIssue(exact, 'REPORT_FINDING_ISSUE_COUNT_MISMATCH').path, '$.candidates[0].report')
})

test('rejected reporter input writes neither a successful report nor a reported checkpoint', () => withWorkspace(({ artifacts }) => {
  const input = reportingInput()
  input.candidates[0].report.issues = []
  refreshHashes(input)
  assert.throws(() => renderValidationSummary(input), ValidationSummaryError)
  assert.equal(fs.existsSync(path.join(artifacts, 'report-batch', 'reports', 'validation-summary.md')), false)
  assert.equal(fs.existsSync(path.join(artifacts, 'report-batch', 'checkpoints')), false)
}))

test('report.valid must exactly equal absence of blocking issues in both directions', () => {
  const noBlocking = reportingInput()
  noBlocking.candidates[0].report.valid = false
  refreshHashes(noBlocking)
  assert.equal(reporterIssue(noBlocking, 'REPORT_VALID_OUTCOME_MISMATCH').path, '$.candidates[0].report.valid')

  const blocking = reportingInput({ exact: true })
  assert.equal(blocking.candidates[0].report.valid, false)
  blocking.candidates[0].report.valid = true
  refreshHashes(blocking)
  assert.equal(reporterIssue(blocking, 'REPORT_VALID_OUTCOME_MISMATCH').path, '$.candidates[0].report.valid')
})

test('valid multiple same-code findings require the same issue multiplicity and remain deterministic when reversed', () => {
  const input = reportingInput({ threeNear: true })
  assert.equal(input.candidates[0].report.findings.filter((finding) => finding.code === 'NEAR_DUPLICATE_CONTENT').length, 2)
  assert.equal(input.candidates[0].report.issues.filter((issue) => issue.code === 'NEAR_DUPLICATE_CONTENT').length, 2)
  const expected = renderValidationSummary(input)
  const reversed = structuredClone(input)
  reversed.candidates.reverse()
  for (const entry of reversed.candidates) { entry.report.findings.reverse(); entry.report.issues.reverse() }
  reversed.similarityIndex.findings.reverse()
  refreshHashes(reversed)
  assert.equal(renderValidationSummary(reversed), expected)
})

test('report generation deeply preserves caller-owned proposals, reports, indexes, snapshot, and pair evidence', () => {
  const input = reportingInput()
  const before = structuredClone(input)
  renderValidationSummary(input)
  assert.deepEqual(input, before)
})

test('pipeline binds report hash to batch/checkpoints and repairs missing or tampered reports on resume', () => withWorkspace(({ batch, artifacts }) => {
  const batchId = path.basename(batch)
  writeProposal(artifacts, batchId, 'a.json', proposal(batchId, 'near-a', ['#4E79A7', '#F28E2B', '#59A14F']))
  writeProposal(artifacts, batchId, 'b.json', proposal(batchId, 'near-b', ['#4F7AA8', '#F18D2A', '#5AA250']))
  const first = runBatch('validate', { batch, artifacts, catalogSnapshot: EMPTY_CATALOG_SNAPSHOT })
  const reportPath = path.join(artifacts, batchId, 'reports', 'validation-summary.md')
  const pristine = fs.readFileSync(reportPath, 'utf8')
  const pristineHash = validationSummaryHash(pristine)
  assert.equal(first.report_path, 'reports/validation-summary.md')
  assert.equal(first.report_hash, pristineHash)
  const checkpoint = JSON.parse(fs.readFileSync(path.join(artifacts, batchId, 'checkpoints', 'a.json'), 'utf8'))
  assert.equal(checkpoint.stage, 'reported')
  assert.equal(checkpoint.report_hash, pristineHash)
  assert.ok(runBatch('validate', { batch, artifacts, catalogSnapshot: EMPTY_CATALOG_SNAPSHOT, resume: true }).packages.every((item) => item.resumed))

  fs.writeFileSync(reportPath, `${pristine}tampered\n`)
  assert.ok(runBatch('validate', { batch, artifacts, catalogSnapshot: EMPTY_CATALOG_SNAPSHOT, resume: true }).packages.every((item) => !item.resumed))
  assert.equal(fs.readFileSync(reportPath, 'utf8'), pristine)
  fs.rmSync(reportPath)
  assert.ok(runBatch('validate', { batch, artifacts, catalogSnapshot: EMPTY_CATALOG_SNAPSHOT, resume: true }).packages.every((item) => !item.resumed))
  assert.equal(fs.readFileSync(reportPath, 'utf8'), pristine)
}))

test('pipeline report presents blocking batch exact, catalog exact, and catalog perceptual scopes without selecting a winner', () => withWorkspace(({ batch, artifacts }) => {
  const batchId = path.basename(batch)
  const exactA = proposal(batchId, 'exact-a', ['#4E79A7', '#F28E2B'])
  const exactB = proposal(batchId, 'exact-b', ['#4E79A7', '#F28E2B'])
  const near = proposal(batchId, 'near-a', ['#59A14F', '#E15759'])
  writeProposal(artifacts, batchId, 'a.json', exactA)
  writeProposal(artifacts, batchId, 'b.json', exactB)
  writeProposal(artifacts, batchId, 'c.json', near)
  const catalogSnapshot = {
    snapshot_version: 1, fingerprint_version: 1, records: [
      { record_id: 'catalog-near', normalized_content_hash: 'c'.repeat(64), colors: ['#5AA250', '#E2585A'], visibility: 'public', status: 'published', origin: 'curated', owner_user_id: null },
      { record_id: 'catalog-exact', normalized_content_hash: exactA.normalized_content_hash, colors: exactA.colors.map((color) => color.hex), visibility: 'public', status: 'candidate', origin: 'curated', owner_user_id: null }
    ]
  }
  runBatch('validate', { batch, artifacts, catalogSnapshot })
  const markdown = fs.readFileSync(path.join(artifacts, batchId, 'reports', 'validation-summary.md'), 'utf8')
  assert.match(markdown, /\| EXACT_CONTENT_DUPLICATE \| error \| true \| current_batch \|/)
  assert.match(markdown, /\| EXACT_CATALOG_CONTENT_MATCH \| warning \| false \| catalog_snapshot \| catalog-exact \|/)
  assert.match(markdown, /#### NEAR_CATALOG_CONTENT_MATCH → catalog-near/)
  assert.match(markdown, /\| Overall validation status \| invalid \|/)
  assert.doesNotMatch(markdown, /winner|merge|override|skip|import action/iu)
}))

function reportingInput(options = {}) {
  const batchId = 'report-batch'
  const proposals = options.single
    ? [proposal(batchId, 'near-a', ['#4E79A7', '#F28E2B', '#59A14F'])]
    : options.exact
      ? [proposal(batchId, 'exact-a', ['#4E79A7', '#F28E2B']), proposal(batchId, 'exact-b', ['#4E79A7', '#F28E2B'])]
      : options.threeNear
        ? [proposal(batchId, 'near-a', ['#4E79A7', '#F28E2B', '#59A14F']), proposal(batchId, 'near-b', ['#4F7AA8', '#F18D2A', '#5AA250']), proposal(batchId, 'near-c', ['#507BA9', '#F08C29', '#5BA351'])]
        : [proposal(batchId, 'near-a', ['#4E79A7', '#F28E2B', '#59A14F']), proposal(batchId, 'near-b', ['#4F7AA8', '#F18D2A', '#5AA250'])]
  const candidates = proposals.map((value, index) => ({
    identity: `${value.proposal_id}@${String.fromCharCode(97 + index)}.json`, proposal_id: value.proposal_id, source_key: value.source_key,
    source_hash: value.source_hash, normalized_content_hash: value.normalized_content_hash, colors: value.colors.map((color) => color.hex)
  }))
  const catalogSnapshot = structuredClone(EMPTY_CATALOG_SNAPSHOT)
  const exact = detectExactDuplicates(candidates, catalogSnapshot)
  const perceptual = detectPerceptualSimilarities(candidates, catalogSnapshot)
  const exactIndex = { schema_version: 1, fingerprint_version: 1, issue_policy_version: 1, context_hash: exact.contextHash, findings: [...exact.findingsByProposal.values()].flat() }
  const similarityIndex = { schema_version: 1, perceptual_policy_version: 1, color_conversion_version: 1, issue_policy_version: 1, context_hash: perceptual.contextHash, findings: [...perceptual.findingsByProposal.values()].flat() }
  const entries = candidates.map((candidate, index) => {
    const findings = [...(exact.findingsByProposal.get(candidate.identity) ?? []), ...(perceptual.findingsByProposal.get(candidate.identity) ?? [])]
    const issues = findings.map((finding) => duplicateIssue(finding.code, finding.path, finding.message))
    return { identity: candidate.identity, proposal: proposals[index], report: { valid: !issues.some((item) => ISSUE_CODE_POLICY[item.code].blocking), issues, findings } }
  })
  const input = { batchId, pipelineVersion: PIPELINE_VERSION, schemaVersion: 1, catalogSnapshot, exactIndex, similarityIndex, candidates: entries, hashes: {} }
  refreshHashes(input)
  return input
}

function refreshHashes(input) {
  input.hashes = {
    catalogSnapshot: canonicalHash({ ...input.catalogSnapshot, records: [...input.catalogSnapshot.records].sort((a, b) => a.record_id < b.record_id ? -1 : 1) }).hash,
    exactIndex: canonicalHash(input.exactIndex).hash,
    similarityIndex: canonicalHash(input.similarityIndex).hash,
    validationReports: canonicalHash(input.candidates.map(({ identity, report }) => ({ identity, report })).sort((a, b) => a.identity < b.identity ? -1 : 1)).hash
  }
}

function reporterIssue(input, code) {
  try { renderValidationSummary(input) } catch (error) {
    assert.ok(error instanceof ValidationSummaryError)
    const found = error.issues.find((issue) => issue.code === code)
    assert.ok(found, `expected structured reporter issue ${code}: ${JSON.stringify(error.issues)}`)
    return found
  }
  assert.fail(`expected reporter to fail with ${code}`)
}

function proposal(batchId, sourceKey, colors) {
  const manifest = JSON.parse(fs.readFileSync(fixture, 'utf8'))
  manifest.source_key = sourceKey
  manifest.supplied_fields.colors = colors
  return prepareProposal({ manifest, batchId, sourceHash: (sourceKey.endsWith('a') ? 'a' : 'b').repeat(64) }).proposal
}

function canonicalProposalContent(value) {
  return { schema_version: value.schema_version, colors: value.colors.map(({ provisional_id, hex, order }) => ({ provisional_id, hex, order })), palette: Object.fromEntries(Object.entries(value.palette).map(([key, suggestion]) => [key, structuredClone(suggestion.value)])), preview_cases: value.preview_case_suggestions }
}

function withWorkspace(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'figcolor-reporting-'))
  const batch = path.join(root, 'report-batch')
  const artifacts = path.join(root, 'artifacts')
  fs.mkdirSync(batch, { recursive: true })
  try { return run({ batch, artifacts }) } finally { fs.rmSync(root, { recursive: true, force: true }) }
}

function writeProposal(artifacts, batchId, name, value) {
  const directory = path.join(artifacts, batchId, 'proposals')
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`)
}
