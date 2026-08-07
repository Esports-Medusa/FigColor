import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { CONTRACT_ROOT } from '../lib/constants.mjs'
import { detectExactDuplicates } from '../lib/exact-duplicates.mjs'
import { canonicalize } from '../lib/jcs.mjs'
import {
  PERCEPTUAL_POLICY,
  classifyPerceptualDistances,
  deltaEOk,
  detectPerceptualSimilarities,
  srgbHexToOklab
} from '../lib/perceptual-similarity.mjs'
import { prepareProposal, runBatch } from '../lib/pipeline.mjs'
import { validateContract } from '../lib/schema-validation.mjs'

const manifestFixture = path.join(CONTRACT_ROOT, 'fixtures/valid/manual-basic/manifest.json')
const hashA = 'a'.repeat(64)
const hashB = 'b'.repeat(64)

test('sRGB HEX conversion to OKLab v1 is fixed, case-insensitive, and immutable', () => {
  const black = srgbHexToOklab('#000000')
  const white = srgbHexToOklab('#FFFFFF')
  const red = srgbHexToOklab('#FF0000')
  assert.deepEqual(black, { l: 0, a: 0, b: 0 })
  assert.ok(Math.abs(white.l - 1) < 1e-7 && Math.abs(white.a) < 1e-7 && Math.abs(white.b) < 1e-7)
  assert.ok(Math.abs(red.l - 0.6279553606) < 1e-9)
  assert.ok(Math.abs(red.a - 0.2248630611) < 1e-9)
  assert.ok(Math.abs(red.b - 0.1258462985) < 1e-9)
  assert.deepEqual(srgbHexToOklab('#ff0000'), red)
  const input = { hex: '#4E79A7' }
  srgbHexToOklab(input.hex)
  assert.deepEqual(input, { hex: '#4E79A7' })
  assert.throws(() => srgbHexToOklab('red'), /Invalid sRGB HEX/)
})

test('Delta E OK is symmetric, zero for identity, and thresholds use raw values', () => {
  const red = srgbHexToOklab('#FF0000')
  const blue = srgbHexToOklab('#0000FF')
  assert.equal(deltaEOk(red, red), 0)
  assert.equal(deltaEOk(red, blue), deltaEOk(blue, red))
  assert.equal(classifyPerceptualDistances([PERCEPTUAL_POLICY.mean_threshold]).near, true)
  assert.equal(classifyPerceptualDistances([PERCEPTUAL_POLICY.mean_threshold - Number.EPSILON]).near, true)
  assert.equal(classifyPerceptualDistances([PERCEPTUAL_POLICY.mean_threshold + Number.EPSILON]).near, false)
  assert.equal(classifyPerceptualDistances([0.01, PERCEPTUAL_POLICY.max_threshold]).near, true)
  assert.equal(classifyPerceptualDistances([0.01, PERCEPTUAL_POLICY.max_threshold + Number.EPSILON]).near, false)
})

test('ordered same-count palette comparison produces stable one-to-one evidence', () => {
  const nearA = perceptualCandidate('batch/a', hashA, ['#4E79A7', '#F28E2B', '#59A14F'])
  const nearB = perceptualCandidate('batch/b', hashB, ['#4F7AA8', '#F18D2A', '#5AA250'])
  const far = perceptualCandidate('batch/far', 'c'.repeat(64), ['#000000', '#FFFFFF', '#FF00FF'])
  const result = detectPerceptualSimilarities([nearA, nearB, far], emptyCatalog())
  assert.equal(result.valid, true)
  const finding = result.findingsByProposal.get('batch/a')[0]
  assert.equal(finding.code, 'NEAR_DUPLICATE_CONTENT')
  assert.equal(finding.matched_identity, 'batch/b')
  assert.deepEqual(finding.matched_pairs.map((pair) => [pair.current_index, pair.matched_index]), [[0, 0], [1, 1], [2, 2]])
  assert.equal(new Set(finding.matched_pairs.map((pair) => pair.matched_index)).size, 3)
  assert.ok(finding.mean_distance <= finding.mean_threshold)
  assert.ok(finding.maximum_pair_distance <= finding.max_threshold)
  assert.deepEqual(result.findingsByProposal.get('batch/far'), [])

  const differentCount = detectPerceptualSimilarities([nearA, perceptualCandidate('batch/short', hashB, ['#4F7AA8'])], emptyCatalog())
  assert.deepEqual(differentCount.findingsByProposal.get('batch/a'), [])
  const reordered = detectPerceptualSimilarities([nearA, perceptualCandidate('batch/reordered', hashB, [...nearA.colors].reverse())], emptyCatalog())
  assert.deepEqual(reordered.findingsByProposal.get('batch/a'), [], 'canonical index order is intentionally preserved')
})

test('exact content precedence suppresses perceptual findings', () => {
  const colors = ['#4E79A7', '#F28E2B']
  const first = perceptualCandidate('batch/a', hashA, colors)
  const second = perceptualCandidate('batch/b', hashA, colors)
  const result = detectPerceptualSimilarities([first, second], emptyCatalog())
  assert.deepEqual(result.findingsByProposal.get('batch/a'), [])

  const catalog = catalogSnapshot([{ record_id: 'catalog-exact', normalized_content_hash: hashA, colors, status: 'published' }])
  const catalogResult = detectPerceptualSimilarities([first], catalog)
  assert.deepEqual(catalogResult.findingsByProposal.get('batch/a'), [])

  const sameSourceDifferentContent = [
    { ...perceptualCandidate('batch/source-a', hashA, ['#4E79A7']), source_hash: 'e'.repeat(64) },
    { ...perceptualCandidate('batch/source-b', hashB, ['#4F7AA8']), source_hash: 'e'.repeat(64) }
  ]
  const sourceResult = detectPerceptualSimilarities(sameSourceDifferentContent, emptyCatalog())
  assert.equal(sourceResult.findingsByProposal.get('batch/source-a')[0].code, 'NEAR_DUPLICATE_CONTENT')
})

test('catalog scope, draft exclusion, and invalid inputs fail closed', () => {
  const candidate = perceptualCandidate('batch/a', hashA, ['#4E79A7', '#F28E2B'])
  const catalog = catalogSnapshot([
    { record_id: 'candidate-near', normalized_content_hash: hashB, colors: ['#4F7AA8', '#F18D2A'], status: 'candidate' },
    { record_id: 'draft-near', normalized_content_hash: 'c'.repeat(64), colors: ['#4F7AA8', '#F18D2A'], status: 'draft' }
  ])
  const result = detectPerceptualSimilarities([candidate], catalog)
  assert.equal(result.findingsByProposal.get('batch/a').length, 1)
  assert.equal(result.findingsByProposal.get('batch/a')[0].code, 'NEAR_CATALOG_CONTENT_MATCH')
  assert.equal(result.findingsByProposal.get('batch/a')[0].matched_identity, 'candidate-near')

  const invalidCatalog = { snapshot_version: 1, fingerprint_version: 1, records: [{ ...catalog.records[0], visibility: 'private' }] }
  assert.equal(detectPerceptualSimilarities([candidate], invalidCatalog).valid, false)
  assert.equal(detectPerceptualSimilarities([{ ...candidate, colors: ['invalid'] }], emptyCatalog()).valid, false)
  const duplicateIdentity = detectPerceptualSimilarities([candidate, { ...candidate }], emptyCatalog())
  assert.equal(duplicateIdentity.valid, false)
  assert.equal(duplicateIdentity.contextHash, null)
})

test('forged or stale exact results cannot bypass current input validation', () => {
  const forgedExact = { valid: true, issues: [], findingsByProposal: new Map(), contextHash: 'f'.repeat(64) }
  const candidate = perceptualCandidate('batch/a', hashA, ['#4E79A7'])
  const duplicateIdentity = detectPerceptualSimilarities([candidate, { ...candidate }], emptyCatalog(), forgedExact)
  assert.equal(duplicateIdentity.valid, false)
  assert.ok(duplicateIdentity.issues.some((entry) => entry.code === 'DUPLICATE_CANDIDATE_IDENTITY'))
  assert.equal(duplicateIdentity.findingsByProposal.size, 0)
  assert.equal(duplicateIdentity.contextHash, null)

  const privateCatalog = catalogSnapshot([{ record_id: 'private', normalized_content_hash: hashB, colors: ['#4F7AA8'], status: 'published' }])
  privateCatalog.records[0].visibility = 'private'
  assert.equal(detectPerceptualSimilarities([candidate], privateCatalog, forgedExact).valid, false)
  assert.doesNotThrow(() => detectPerceptualSimilarities(null, emptyCatalog(), forgedExact))
  assert.equal(detectPerceptualSimilarities(null, emptyCatalog(), forgedExact).valid, false)

  const currentCandidates = [candidate, perceptualCandidate('batch/b', hashB, ['#4F7AA8'])]
  const currentCatalog = catalogSnapshot([{ record_id: 'current', normalized_content_hash: 'c'.repeat(64), colors: ['#507BA9'], status: 'candidate' }])
  const baseline = detectPerceptualSimilarities(currentCandidates, currentCatalog)
  const ignoredStaleResult = detectPerceptualSimilarities(currentCandidates, currentCatalog, forgedExact)
  assert.equal(ignoredStaleResult.contextHash, baseline.contextHash)
  assert.equal(canonicalPerceptualFindings(ignoredStaleResult), canonicalPerceptualFindings(baseline))
  const staleExactResult = detectExactDuplicates(
    [perceptualCandidate('stale/candidate', 'd'.repeat(64), ['#000000'])],
    catalogSnapshot([{ record_id: 'stale-catalog', normalized_content_hash: 'e'.repeat(64), colors: ['#FFFFFF'], status: 'published' }])
  )
  const ignoredDifferentInputs = detectPerceptualSimilarities(currentCandidates, currentCatalog, staleExactResult)
  assert.equal(ignoredDifferentInputs.contextHash, baseline.contextHash)
  assert.equal(canonicalPerceptualFindings(ignoredDifferentInputs), canonicalPerceptualFindings(baseline))
})

test('candidate/catalog enumeration and policy context are deterministic', () => {
  const candidates = [
    perceptualCandidate('batch/a', hashA, ['#4E79A7', '#F28E2B']),
    perceptualCandidate('batch/b', hashB, ['#4F7AA8', '#F18D2A'])
  ]
  const records = [
    { record_id: 'catalog-a', normalized_content_hash: 'c'.repeat(64), colors: ['#4F7AA8', '#F18D2A'], status: 'candidate' },
    { record_id: 'catalog-b', normalized_content_hash: 'd'.repeat(64), colors: ['#000000', '#FFFFFF'], status: 'published' }
  ]
  const first = detectPerceptualSimilarities(candidates, catalogSnapshot(records))
  const reversed = detectPerceptualSimilarities([...candidates].reverse(), catalogSnapshot([...records].reverse()))
  assert.equal(first.contextHash, reversed.contextHash)
  assert.equal(canonicalPerceptualFindings(first), canonicalPerceptualFindings(reversed))
  const changedColors = structuredClone(records)
  changedColors[0].colors[0] = '#507BA9'
  assert.notEqual(detectPerceptualSimilarities(candidates, catalogSnapshot(changedColors)).contextHash, first.contextHash)
})

test('pipeline writes schema-valid similarity evidence and binds resume integrity', () => withWorkspace(({ batch, artifacts }) => {
  const batchId = path.basename(batch)
  const first = proposalFor(batchId, 'near-a', ['#4E79A7', '#F28E2B', '#59A14F'])
  const second = proposalFor(batchId, 'near-b', ['#4F7AA8', '#F18D2A', '#5AA250'])
  writeProposal(artifacts, batchId, 'a.json', first)
  writeProposal(artifacts, batchId, 'b.json', second)
  const catalogRecords = [
    { record_id: 'catalog-a', normalized_content_hash: 'c'.repeat(64), colors: ['#000000', '#FFFFFF', '#FF00FF'], status: 'candidate' },
    { record_id: 'catalog-b', normalized_content_hash: 'd'.repeat(64), colors: ['#003366', '#CCAA00', '#660066'], status: 'published' }
  ]
  const catalog = catalogSnapshot(catalogRecords)
  const reversedCatalog = catalogSnapshot([...catalogRecords].reverse())
  const initial = runBatch('validate', { batch, artifacts, catalogSnapshot: catalog })
  assert.equal(initial.counts.validated, 2)
  assert.ok(initial.packages.every((entry) => entry.issues.some((issue) => issue.code === 'NEAR_DUPLICATE_CONTENT' && issue.severity === 'warning')))
  const indexPath = path.join(artifacts, batchId, 'similarities', 'perceptual-index.json')
  const reportPath = path.join(artifacts, batchId, 'validation', 'a.json')
  const indexBefore = fs.readFileSync(indexPath, 'utf8')
  const reportBefore = fs.readFileSync(reportPath, 'utf8')
  assert.equal(validateContract('perceptualSimilarityIndex', JSON.parse(indexBefore)).valid, true)
  assert.equal(validateContract('validationReport', JSON.parse(reportBefore)).valid, true)

  const resumed = runBatch('validate', { batch, artifacts, catalogSnapshot: reversedCatalog, resume: true })
  assert.ok(resumed.packages.every((entry) => entry.resumed === true))
  assert.equal(fs.readFileSync(indexPath, 'utf8'), indexBefore)
  assert.equal(fs.readFileSync(reportPath, 'utf8'), reportBefore)

  const tampered = JSON.parse(indexBefore)
  tampered.context_hash = 'f'.repeat(64)
  fs.writeFileSync(indexPath, `${JSON.stringify(tampered, null, 2)}\n`)
  const repaired = runBatch('validate', { batch, artifacts, catalogSnapshot: catalog, resume: true })
  assert.ok(repaired.packages.every((entry) => entry.resumed === false))
  assert.equal(fs.readFileSync(indexPath, 'utf8'), indexBefore)

  fs.rmSync(indexPath)
  const missing = runBatch('validate', { batch, artifacts, catalogSnapshot: catalog, resume: true })
  assert.ok(missing.packages.every((entry) => entry.resumed === false))
  assert.equal(fs.readFileSync(indexPath, 'utf8'), indexBefore)

  const changedCatalog = structuredClone(catalog)
  changedCatalog.records[0].colors[0] = '#010101'
  const stale = runBatch('validate', { batch, artifacts, catalogSnapshot: changedCatalog, resume: true })
  assert.ok(stale.packages.every((entry) => entry.resumed === false))
}))

function perceptualCandidate(identity, normalized_content_hash, colors) {
  return { identity, proposal_id: `${identity}-proposal`, source_key: identity.replace('/', '-'), source_hash: identity.endsWith('a') ? hashA : hashB, normalized_content_hash, colors }
}

function emptyCatalog() { return catalogSnapshot([]) }

function catalogSnapshot(records) {
  return {
    snapshot_version: 1,
    fingerprint_version: 1,
    records: records.map((record) => ({ visibility: 'public', origin: 'curated', owner_user_id: null, ...record }))
  }
}

function canonicalPerceptualFindings(result) {
  return canonicalize([...result.findingsByProposal.entries()].sort(([left], [right]) => left.localeCompare(right)))
}

function proposalFor(batchId, sourceKey, colors) {
  const manifest = JSON.parse(fs.readFileSync(manifestFixture, 'utf8'))
  manifest.source_key = sourceKey
  manifest.supplied_fields.colors = colors
  return prepareProposal({ manifest, batchId, sourceHash: sourceKey === 'near-a' ? hashA : hashB }).proposal
}

function withWorkspace(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'figcolor-perceptual-'))
  const batch = path.join(root, 'perceptual-batch')
  const artifacts = path.join(root, 'artifacts')
  fs.mkdirSync(batch, { recursive: true })
  try { return run({ batch, artifacts }) } finally { fs.rmSync(root, { recursive: true, force: true }) }
}

function writeProposal(artifacts, batchId, name, proposal) {
  const directory = path.join(artifacts, batchId, 'proposals')
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, name), `${JSON.stringify(proposal, null, 2)}\n`)
}
