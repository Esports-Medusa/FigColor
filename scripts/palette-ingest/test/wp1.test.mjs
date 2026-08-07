import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { CONTRACT_ROOT, PIPELINE_VERSION, REPOSITORY_ROOT, loadVocabularies } from '../lib/constants.mjs'
import { canonicalHash, canonicalize } from '../lib/jcs.mjs'
import { resolveContainedFile } from '../lib/files.mjs'
import {
  artifactPaths,
  buildIngestionRequest,
  computeSourceHash,
  prepareProposal,
  runBatch
} from '../lib/pipeline.mjs'
import { validateManifest, validateProposal } from '../lib/validation.mjs'
import { assertSchemasValid, validateContract } from '../lib/schema-validation.mjs'

const vocabularies = loadVocabularies()
const validManifestPath = path.join(CONTRACT_ROOT, 'fixtures/valid/manual-basic/manifest.json')

test('JCS cross-language fixture has stable canonical UTF-8 and SHA-256', () => {
  const fixture = readJSON(path.join(CONTRACT_ROOT, 'fixtures/hash/jcs-case.json'))
  assert.equal(canonicalize(fixture.input), fixture.expected_canonical_utf8)
  assert.equal(canonicalHash(fixture.input).hash, fixture.expected_sha256)
})

test('all schemas are valid Draft 2020-12 contracts and committed JSON is parseable', () => {
  assert.equal(assertSchemasValid(), true)
  const files = walkJSON(CONTRACT_ROOT)
  assert.ok(files.length >= 10)
  for (const file of files) assert.doesNotThrow(() => readJSON(file), file)
})

test('valid manifest, generated proposal, and minimal ingestion request pass their schemas', () => {
  const manifest = readJSON(validManifestPath)
  assert.equal(validateContract('sourcePackage', manifest).valid, true)
  const sourceHash = computeSourceHash(manifest)
  const proposal = prepareProposal({ manifest, batchId: 'schema-test', sourceHash }).proposal
  assert.deepEqual(validateContract('proposal', proposal).issues, [])
  assert.deepEqual(validateContract('ingestionRequest', buildIngestionRequest(proposal)).issues, [])
})

test('JSON Schema enforces size, type, required, and unknown-field constraints', () => {
  const cases = []
  const tooManyColors = readJSON(validManifestPath)
  tooManyColors.supplied_fields.colors = Array.from({ length: 65 }, (_, index) => `#${index.toString(16).padStart(6, '0')}`)
  cases.push(tooManyColors)
  cases.push({ ...readJSON(validManifestPath), caption: 123 })
  cases.push({ ...readJSON(validManifestPath), curator_notes: 'x'.repeat(20001) })
  cases.push({ ...readJSON(validManifestPath), internal_source: 'outside' })
  const longNotes = readJSON(validManifestPath)
  longNotes.supplied_fields.chart_applicability[0].notes = 'x'.repeat(1001)
  cases.push(longNotes)
  for (const value of cases) assert.equal(validateContract('sourcePackage', value).valid, false)

  const manifest = readJSON(validManifestPath)
  const proposal = prepareProposal({ manifest, batchId: 'unknown-proposal', sourceHash: computeSourceHash(manifest) }).proposal
  proposal.unexpected = true
  assert.ok(validateContract('proposal', proposal).issues.some((entry) => entry.code === 'UNKNOWN_FIELD'))
})

test('every committed invalid manifest is blocked by structural or domain validation', () => {
  const invalidRoot = path.join(CONTRACT_ROOT, 'fixtures/invalid')
  for (const directory of fs.readdirSync(invalidRoot)) {
    const manifest = readJSON(path.join(invalidRoot, directory, 'manifest.json'))
    const report = validateManifest(manifest, vocabularies)
    if (directory === 'path-escape') {
      assert.equal(validateContract('sourcePackage', manifest).valid, true)
      continue
    }
    assert.equal(report.valid, false, `${directory} was not blocked`)
  }
})

test('manual fixture has stable source hash, content hash, proposal ID, and artifact path', () => {
  const identity = readJSON(path.join(CONTRACT_ROOT, 'fixtures/hash/manual-basic-identity.json'))
  const manifest = readJSON(validManifestPath)
  const sourceHash = computeSourceHash(manifest)
  const first = prepareProposal({ manifest, batchId: identity.batch_id, sourceHash }).proposal
  const second = prepareProposal({ manifest: structuredClone(manifest), batchId: identity.batch_id, sourceHash }).proposal
  assert.equal(sourceHash, identity.expected_source_hash)
  assert.equal(first.normalized_content_hash, identity.expected_normalized_content_hash)
  assert.equal(first.proposal_id, identity.expected_proposal_id)
  assert.deepEqual(first, second)
  assert.equal(artifactPaths('/tmp/figcolor-artifacts', identity.batch_id, manifest.source_key).proposal, '/tmp/figcolor-artifacts/hash-fixture/proposals/manual-basic.json')
})

test('JSON object key order does not affect canonical or source hashes', () => {
  const original = readJSON(validManifestPath)
  const reordered = {
    supplied_fields: {
      chart_applicability: original.supplied_fields.chart_applicability,
      tags: original.supplied_fields.tags,
      avoid_cases: original.supplied_fields.avoid_cases,
      use_cases: original.supplied_fields.use_cases,
      disciplines: original.supplied_fields.disciplines,
      type: original.supplied_fields.type,
      colors: original.supplied_fields.colors
    },
    source_type: original.source_type,
    source_key: original.source_key
  }
  assert.equal(canonicalHash(original).hash, canonicalHash(reordered).hash)
  assert.equal(computeSourceHash(original), computeSourceHash(reordered))
})

test('semantic manual color array order changes content identity', () => {
  const first = readJSON(validManifestPath)
  const second = structuredClone(first)
  second.supplied_fields.colors.reverse()
  const firstSource = computeSourceHash(first)
  const secondSource = computeSourceHash(second)
  assert.notEqual(firstSource, secondSource)
  assert.notEqual(
    prepareProposal({ manifest: first, batchId: 'order-test', sourceHash: firstSource }).proposal.normalized_content_hash,
    prepareProposal({ manifest: second, batchId: 'order-test', sourceHash: secondSource }).proposal.normalized_content_hash
  )
})

test('normalized content hash is independent of batch, source key, and source hash', () => {
  const first = readJSON(validManifestPath)
  const second = structuredClone(first)
  second.source_key = 'same-colors-different-source'
  const firstProposal = prepareProposal({ manifest: first, batchId: 'batch-a', sourceHash: computeSourceHash(first) }).proposal
  const secondProposal = prepareProposal({ manifest: second, batchId: 'batch-b', sourceHash: computeSourceHash(second) }).proposal
  assert.notEqual(firstProposal.proposal_id, secondProposal.proposal_id)
  assert.notEqual(firstProposal.source_hash, secondProposal.source_hash)
  assert.equal(firstProposal.normalized_content_hash, secondProposal.normalized_content_hash)
})

test('unknown manifest fields are blocking', () => {
  const manifest = readJSON(path.join(CONTRACT_ROOT, 'fixtures/invalid/unknown-field/manifest.json'))
  const report = validateManifest(manifest, vocabularies)
  assert.equal(report.valid, false)
  assert.ok(report.issues.some((entry) => entry.code === 'UNKNOWN_FIELD' && entry.path === '$.unexpected'))
})

test('invalid HEX, duplicate colors, color identities, and vocabulary values are reported', () => {
  const manifest = readJSON(validManifestPath)
  manifest.supplied_fields.colors = ['#GGGGGG', '#112233', '112233']
  manifest.supplied_fields.tags = ['not_a_tag']
  const report = validateManifest(manifest, vocabularies)
  assert.ok(report.issues.some((entry) => entry.code === 'INVALID_HEX'))
  assert.ok(report.issues.some((entry) => entry.code === 'DUPLICATE_COLOR_VALUE'))
  assert.ok(report.issues.some((entry) => entry.code === 'INVALID_VOCABULARY_VALUE'))

  const sourceHash = computeSourceHash(readJSON(validManifestPath))
  const proposal = prepareProposal({ manifest: readJSON(validManifestPath), batchId: 'identity-test', sourceHash }).proposal
  proposal.colors[1].provisional_id = proposal.colors[0].provisional_id
  const proposalReport = validateProposal(proposal, vocabularies)
  assert.ok(proposalReport.issues.some((entry) => entry.code === 'DUPLICATE_COLOR_ID'))
  proposal.colors[2].provisional_id = '../escape'
  assert.ok(validateProposal(proposal, vocabularies).issues.some((entry) => entry.code === 'SCHEMA_VALIDATION_FAILED'))
})

test('unsupported chart type is blocking and produces no proposal artifact', () => withWorkspace(({ batch, artifacts }) => {
  copyFixture('invalid/unsupported-chart', path.join(batch, 'unsupported-chart'))
  const result = runBatch('prepare', { batch, artifacts })
  assert.equal(result.packages[0].status, 'validation_failed')
  assert.ok(result.packages[0].issues.some((entry) => entry.code === 'CHART_TYPE_UNSUPPORTED'))
  assert.equal(fs.existsSync(path.join(artifacts, path.basename(batch), 'proposals/unsupported-chart.json')), false)
}))

test('path traversal, disallowed type, oversized reference, and oversized manifest are rejected', () => withWorkspace(({ root, batch }) => {
  const outside = path.join(root, 'outside.png')
  fs.writeFileSync(outside, 'png')
  const traversalRoot = path.join(batch, 'traversal')
  fs.mkdirSync(traversalRoot)
  fs.writeFileSync(path.join(traversalRoot, 'manifest.json'), JSON.stringify({ ...readJSON(validManifestPath), source_key: 'traversal', figure_path: '../../outside.png' }))
  let loaded = runBatch('scan', { batch, dryRun: true })
  assert.ok(loaded.packages[0].issues.some((entry) => entry.code === 'PATH_TRAVERSAL'))

  const badTypeRoot = path.join(batch, 'bad-type')
  fs.mkdirSync(badTypeRoot)
  fs.writeFileSync(path.join(badTypeRoot, 'figure.txt'), 'not an image')
  fs.writeFileSync(path.join(badTypeRoot, 'manifest.json'), JSON.stringify({ ...readJSON(validManifestPath), source_key: 'bad-type', figure_path: 'figure.txt' }))
  loaded = runBatch('scan', { batch, dryRun: true })
  assert.ok(loaded.packages.some((item) => item.issues.some((entry) => entry.code === 'FILE_TYPE_UNSUPPORTED')))

  const oversizeRoot = path.join(batch, 'oversize')
  fs.mkdirSync(oversizeRoot)
  fs.writeFileSync(path.join(oversizeRoot, 'figure.png'), Buffer.alloc(20 * 1024 * 1024 + 1))
  fs.writeFileSync(path.join(oversizeRoot, 'manifest.json'), JSON.stringify({ ...readJSON(validManifestPath), source_key: 'oversize', figure_path: 'figure.png' }))
  loaded = runBatch('scan', { batch, dryRun: true })
  assert.ok(loaded.packages.some((item) => item.issues.some((entry) => entry.code === 'INPUT_TOO_LARGE')))

  const manifestRoot = path.join(batch, 'large-manifest')
  fs.mkdirSync(manifestRoot)
  fs.writeFileSync(path.join(manifestRoot, 'manifest.json'), ' '.repeat(64 * 1024 + 1))
  loaded = runBatch('scan', { batch, dryRun: true })
  assert.ok(loaded.packages.some((item) => item.issues.some((entry) => entry.code === 'INPUT_TOO_LARGE')))
}))

test('contained reference accepts supported files and rejects symlink escape', () => withWorkspace(({ root, batch }) => {
  const packageRoot = path.join(batch, 'safe')
  fs.mkdirSync(packageRoot)
  fs.writeFileSync(path.join(packageRoot, 'figure.png'), 'png')
  assert.equal(resolveContainedFile(packageRoot, 'figure.png'), fs.realpathSync(path.join(packageRoot, 'figure.png')))
  const outside = path.join(root, 'outside.png')
  fs.writeFileSync(outside, 'outside')
  fs.symlinkSync(outside, path.join(packageRoot, 'link.png'))
  assert.throws(() => resolveContainedFile(packageRoot, 'link.png'), /escapes/)
}))

test('manifest symlink and artifact-directory symlink are rejected', () => withWorkspace(({ root, batch, artifacts }) => {
  const externalManifest = path.join(root, 'external-manifest.json')
  fs.copyFileSync(validManifestPath, externalManifest)
  const linkedPackage = path.join(batch, 'linked-manifest')
  fs.mkdirSync(linkedPackage)
  fs.symlinkSync(externalManifest, path.join(linkedPackage, 'manifest.json'))
  const scan = runBatch('scan', { batch, artifacts, dryRun: true })
  assert.ok(scan.packages[0].issues.some((entry) => entry.code === 'SYMLINK_NOT_ALLOWED'))

  fs.rmSync(linkedPackage, { recursive: true, force: true })
  copyFixture('valid/manual-basic', path.join(batch, 'manual-basic'))
  const outside = path.join(root, 'outside-artifacts')
  fs.mkdirSync(outside)
  const proposalDirectory = path.join(artifacts, path.basename(batch), 'proposals')
  fs.mkdirSync(path.dirname(proposalDirectory), { recursive: true })
  fs.symlinkSync(outside, proposalDirectory)
  assert.throws(() => runBatch('prepare', { batch, artifacts }), /symbolic link/)
}))

test('proposal, checkpoint, and batch-state symlink reads are rejected or safely regenerated', () => withWorkspace(({ root, batch, artifacts }) => {
  copyFixture('valid/manual-basic', path.join(batch, 'manual-basic'))
  runBatch('prepare', { batch, artifacts })
  const paths = artifactPaths(artifacts, path.basename(batch), 'manual-basic')
  const external = path.join(root, 'external.json')
  fs.writeFileSync(external, JSON.stringify({ external: true }))

  fs.unlinkSync(paths.proposal)
  fs.symlinkSync(external, paths.proposal)
  const validation = runBatch('validate', { batch, artifacts })
  assert.ok(validation.packages[0].issues.some((entry) => entry.code === 'PROPOSAL_READ_FAILED'))

  fs.unlinkSync(paths.proposal)
  runBatch('prepare', { batch, artifacts })
  fs.unlinkSync(paths.checkpoint)
  fs.symlinkSync(external, paths.checkpoint)
  assert.throws(() => runBatch('prepare', { batch, artifacts, resume: true }), /must not be a symbolic link/)

  fs.unlinkSync(paths.batchState)
  fs.symlinkSync(external, paths.batchState)
  assert.throws(() => runBatch('status', { batch, artifacts }), /Symbolic links are not allowed/)
}))

test('valid checkpoint resumes; corrupt, mismatched, or altered checkpoints are not silently used', () => withWorkspace(({ batch, artifacts }) => {
  copyFixture('valid/manual-basic', path.join(batch, 'manual-basic'))
  const first = runBatch('prepare', { batch, artifacts })
  assert.equal(first.packages[0].resumed, false)
  const second = runBatch('prepare', { batch, artifacts, resume: true })
  assert.equal(second.packages[0].resumed, true)

  const paths = artifactPaths(artifacts, path.basename(batch), 'manual-basic')
  fs.writeFileSync(paths.checkpoint, '{broken')
  const corrupt = runBatch('prepare', { batch, artifacts, resume: true })
  assert.equal(corrupt.packages[0].resumed, false)

  const checkpoint = readJSON(paths.checkpoint)
  checkpoint.pipeline_version = 'wrong-version'
  fs.writeFileSync(paths.checkpoint, JSON.stringify(checkpoint))
  const mismatched = runBatch('prepare', { batch, artifacts, resume: true })
  assert.equal(mismatched.packages[0].resumed, false)

  const evidenceOnly = readJSON(paths.proposal)
  const canonicalHashBefore = evidenceOnly.normalized_content_hash
  evidenceOnly.internal_evidence.audit_note = 'changed without changing candidate content'
  fs.writeFileSync(paths.proposal, JSON.stringify(evidenceOnly))
  const evidenceTampered = runBatch('prepare', { batch, artifacts, resume: true })
  assert.equal(evidenceTampered.packages[0].resumed, false)
  assert.equal(evidenceTampered.packages[0].proposal.normalized_content_hash, canonicalHashBefore)

  const proposal = readJSON(paths.proposal)
  proposal.palette.name.value = 'Tampered'
  fs.writeFileSync(paths.proposal, JSON.stringify(proposal))
  const tampered = runBatch('prepare', { batch, artifacts, resume: true })
  assert.equal(tampered.packages[0].resumed, false)
  assert.match(readJSON(paths.proposal).palette.name.value, /^Manual Palette [0-9A-F]{8}$/)
}))

test('one package failure is isolated from valid package artifacts', () => withWorkspace(({ batch, artifacts }) => {
  copyFixture('valid/manual-basic', path.join(batch, 'manual-basic'))
  copyFixture('invalid/unknown-field', path.join(batch, 'unknown-field'))
  const result = runBatch('prepare', { batch, artifacts })
  assert.equal(result.counts.prepared, 1)
  assert.equal(result.counts.validation_failed, 1)
  const batchId = path.basename(batch)
  assert.equal(fs.existsSync(artifactPaths(artifacts, batchId, 'manual-basic').proposal), true)
  assert.equal(fs.existsSync(artifactPaths(artifacts, batchId, 'unknown-field').proposal), false)
}))

test('canonical ingestion request includes only frozen source evidence and excludes server-owned fields', () => {
  const manifest = readJSON(validManifestPath)
  manifest.internal_source = { source_reference: 'private-ref', rights_note: 'private-rights' }
  const sourceHash = computeSourceHash(manifest)
  const proposal = prepareProposal({ manifest, batchId: 'boundary-test', sourceHash }).proposal
  const payload = buildIngestionRequest(proposal)
  const encoded = JSON.stringify(payload)
  assert.equal(payload.ingestion_metadata.source_reference, 'private-ref')
  for (const forbidden of ['internal_evidence', 'private-rights', 'status', 'visibility', 'owner_user_id', 'origin', 'caption', 'curator_notes']) {
    assert.equal(encoded.includes(forbidden), false, `payload leaked ${forbidden}`)
  }
})

test('controlled vocabulary contract matches current frontend and backend chart definitions', () => {
  const frontendTypes = fs.readFileSync(path.join(REPOSITORY_ROOT, 'src/types/palette.ts'), 'utf8')
  for (const [contractKey, constantName] of [['disciplines', 'DISCIPLINES'], ['use_cases', 'USE_CASES'], ['avoid_cases', 'AVOID_CASES'], ['tags', 'TAGS']]) {
    assert.deepEqual(parseTSStringArray(frontendTypes, constantName), vocabularies[contractKey], `${contractKey} drifted from frontend`)
  }
  const registry = fs.readFileSync(path.join(REPOSITORY_ROOT, 'src/lib/chart-types/registry.ts'), 'utf8')
  const frontendCharts = [...registry.matchAll(/chartType:\s*'([^']+)'/g)].map((match) => match[1])
  assert.deepEqual(frontendCharts, vocabularies.chart_types)
  const backend = fs.readFileSync(path.join(REPOSITORY_ROOT, 'backend/internal/palette/validation.go'), 'utf8')
  const backendCharts = [...backend.matchAll(/ChartType\w+\s*=\s*"([^"]+)"/g)].map((match) => match[1])
  assert.deepEqual(backendCharts, vocabularies.chart_types)
  for (const paletteType of vocabularies.palette_types) assert.match(backend, new RegExp(`"${paletteType}"\\s*:\\s*true`))
  const preview = fs.readFileSync(path.join(REPOSITORY_ROOT, 'backend/internal/palette/preview_case_validation.go'), 'utf8')
  for (const templateId of Object.values(vocabularies.preview_templates)) assert.ok(preview.includes(`"${templateId}"`), `missing backend template ${templateId}`)
  assert.ok(vocabularies.known_differences.some((entry) => entry.includes('backend does not currently enforce')))
})

test('scan, prepare, validate, and status provide deterministic machine-readable state', () => withWorkspace(({ batch, artifacts }) => {
  copyFixture('valid/manual-basic', path.join(batch, 'manual-basic'))
  assert.equal(runBatch('scan', { batch, artifacts }).counts.discovered, 1)
  assert.equal(runBatch('prepare', { batch, artifacts }).counts.prepared, 1)
  assert.equal(runBatch('validate', { batch, artifacts }).counts.validated, 1)
  const status = runBatch('status', { batch, artifacts })
  assert.equal(status.batch_id, path.basename(batch))
  assert.equal(status.packages[0].status, 'validated')
}))

test('validate rejects content whose normalized hash no longer matches', () => withWorkspace(({ batch, artifacts }) => {
  copyFixture('valid/manual-basic', path.join(batch, 'manual-basic'))
  runBatch('prepare', { batch, artifacts })
  const proposalPath = artifactPaths(artifacts, path.basename(batch), 'manual-basic').proposal
  const proposal = readJSON(proposalPath)
  proposal.palette.name.value = 'Changed after hashing'
  fs.writeFileSync(proposalPath, JSON.stringify(proposal))
  const result = runBatch('validate', { batch, artifacts })
  assert.equal(result.packages[0].status, 'validation_failed')
  assert.ok(result.packages[0].issues.some((entry) => entry.code === 'NORMALIZED_HASH_MISMATCH'))
}))

function parseTSStringArray(source, name) {
  const match = source.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const`))
  assert.ok(match, `missing ${name}`)
  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1])
}

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function walkJSON(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(root, entry.name)
    return entry.isDirectory() ? walkJSON(child) : (entry.name.endsWith('.json') ? [child] : [])
  })
}

function copyFixture(relative, destination) {
  fs.mkdirSync(destination, { recursive: true })
  fs.copyFileSync(path.join(CONTRACT_ROOT, 'fixtures', relative, 'manifest.json'), path.join(destination, 'manifest.json'))
}

function withWorkspace(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'figcolor-wp1-'))
  const batch = path.join(root, 'batch-one')
  const artifacts = path.join(root, 'artifacts')
  fs.mkdirSync(batch)
  try {
    return callback({ root, batch, artifacts })
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}
