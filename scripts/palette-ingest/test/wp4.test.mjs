import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { CONTRACT_ROOT, PIPELINE_VERSION, loadVocabularies } from '../lib/constants.mjs'
import { canonicalHash, canonicalize } from '../lib/jcs.mjs'
import {
  IngestionRequestValidationError,
  buildIngestionRequest,
  computeSourceHash,
  prepareProposal,
  proposalArtifactHash
} from '../lib/pipeline.mjs'
import { validateIngestionRequest, validateProposal } from '../lib/validation.mjs'
import { validateContract } from '../lib/schema-validation.mjs'

const vocabularies = loadVocabularies()
const validManifestPath = path.join(CONTRACT_ROOT, 'fixtures/valid/manual-basic/manifest.json')

test('every v1 contract executes against an explicit valid fixture', () => {
  const { manifest, proposal, request } = completeFixture()
  const hash = 'a'.repeat(64)
  const fixtures = {
    sourcePackage: manifest,
    proposal,
    ingestionRequest: request,
    receipt: { proposal_id: proposal.proposal_id, normalized_content_hash: proposal.normalized_content_hash, request_fingerprint: hash, palette_id: 'palette-1', slug: 'palette-1', status: 'candidate', preview_case_ids: [] },
    errorResponse: { code: 'INVALID_INGESTION_REQUEST', message: 'The ingestion request is invalid.' },
    validationReport: { valid: false, issues: [{ path: '$.x', code: 'INVALID_VALUE', message: 'Invalid.', severity: 'error', source: 'domain' }] },
    checkpoint: { schema_version: 1, pipeline_version: PIPELINE_VERSION, batch_id: proposal.batch_id, source_key: proposal.source_key, source_hash: proposal.source_hash, stage: 'prepared', proposal_path: 'proposals/manual-basic.json', normalized_content_hash: proposal.normalized_content_hash, proposal_artifact_hash: proposalArtifactHash(proposal) },
    batchState: { schema_version: 1, pipeline_version: PIPELINE_VERSION, batch_id: 'fixture-batch', packages: [{ source_key: 'manual-basic', status: 'validated', issues: [] }] }
  }
  assert.equal(hash.length, 64)
  for (const [contract, fixture] of Object.entries(fixtures)) {
    assert.deepEqual(validateContract(contract, fixture).issues, [], contract)
  }
})

test('existing invalid source fixtures remain blocked by schema or domain validation', () => {
  for (const name of fs.readdirSync(path.join(CONTRACT_ROOT, 'fixtures/invalid'))) {
    const manifest = readJSON(path.join(CONTRACT_ROOT, 'fixtures/invalid', name, 'manifest.json'))
    if (name === 'path-escape') continue
    const structural = validateContract('sourcePackage', manifest)
    if (structural.valid) assert.equal(validateProposalSafe(manifest), false, name)
    else assert.ok(structural.issues.length > 0, name)
  }
})

test('complete supplied fields map to canonical Palette and Preview payloads', () => {
  const { proposal, request } = completeFixture()
  assert.deepEqual(request.palette.colors, [
    { id: 'color-1', hex: '#4E79A7', rgb: [78, 121, 167], order: 0 },
    { id: 'color-2', hex: '#F28E2B', rgb: [242, 142, 43], order: 1 },
    { id: 'color-3', hex: '#59A14F', rgb: [89, 161, 79], order: 2 }
  ])
  assert.equal(request.palette.name, proposal.palette.name.value)
  assert.equal(request.palette.type, 'categorical')
  assert.deepEqual(request.palette.disciplines, ['general'])
  assert.deepEqual(request.palette.use_cases, ['publication'])
  assert.deepEqual(request.palette.avoid_cases, [])
  assert.deepEqual(request.palette.tags, ['clean', 'professional'])
  assert.equal(request.palette.chart_applicability[0].notes, 'Curator supplied public applicability note.')
  assert.equal(request.preview_cases.length, 1)
  assert.deepEqual(validateIngestionRequest(request, vocabularies).issues, [])
})

test('minimal proposal uses explicit empty supplied lists and omitted previews become an empty array', () => {
  const manifest = readJSON(validManifestPath)
  manifest.supplied_fields.disciplines = []
  manifest.supplied_fields.use_cases = []
  manifest.supplied_fields.avoid_cases = []
  manifest.supplied_fields.tags = []
  delete manifest.supplied_preview_cases
  const proposal = proposalFrom(manifest)
  const request = buildIngestionRequest(proposal)
  assert.deepEqual(request.palette.disciplines, [])
  assert.deepEqual(request.palette.use_cases, [])
  assert.deepEqual(request.palette.avoid_cases, [])
  assert.deepEqual(request.palette.tags, [])
  assert.deepEqual(request.preview_cases, [])
  for (const forbidden of ['caption', 'curator_notes', 'internal_source']) assert.equal(forbidden in request.palette, false)
})

test('mapping preserves ordered colors and semantic list order', () => {
  const manifest = readJSON(validManifestPath)
  manifest.supplied_fields.tags = ['professional', 'clean']
  const first = buildIngestionRequest(proposalFrom(manifest))
  const reversed = structuredClone(manifest)
  reversed.supplied_fields.colors.reverse()
  const secondProposal = proposalFrom(reversed)
  const second = buildIngestionRequest(secondProposal)
  assert.deepEqual(first.palette.colors.map((color) => color.hex), manifest.supplied_fields.colors)
  assert.deepEqual(first.palette.tags, ['professional', 'clean'])
  assert.notEqual(canonicalize(first), canonicalize(second))
  assert.notEqual(first.ingestion_metadata.normalized_content_hash, second.ingestion_metadata.normalized_content_hash)
})

test('object key order does not affect deterministic request output', () => {
  const manifest = readJSON(validManifestPath)
  const reordered = {
    supplied_fields: {
      chart_applicability: manifest.supplied_fields.chart_applicability.map((item) => ({ source: item.source, suitability: item.suitability, chart_type: item.chart_type })),
      tags: manifest.supplied_fields.tags,
      avoid_cases: manifest.supplied_fields.avoid_cases,
      use_cases: manifest.supplied_fields.use_cases,
      disciplines: manifest.supplied_fields.disciplines,
      type: manifest.supplied_fields.type,
      colors: manifest.supplied_fields.colors
    },
    source_type: manifest.source_type,
    source_key: manifest.source_key
  }
  assert.equal(canonicalize(buildIngestionRequest(proposalFrom(manifest))), canonicalize(buildIngestionRequest(proposalFrom(reordered))))
})

test('only frozen ingestion evidence enters canonical metadata and mapping is immutable', () => {
  const { proposal } = completeFixture()
  proposal.internal_evidence = { source_reference: 'SECRET-SOURCE', rights_note: 'SECRET-RIGHTS', filesystem_path: '/private/source.png' }
  proposal.validation.issues = [{ path: '$.private', code: 'PRIVATE_NOTE', message: 'SECRET-DIAGNOSTIC', severity: 'warning', source: 'domain' }]
  const before = structuredClone(proposal)
  const request = buildIngestionRequest(proposal)
  const encoded = JSON.stringify(request)
  assert.equal(request.ingestion_metadata.source_reference, 'SECRET-SOURCE')
  assert.deepEqual(request.ingestion_metadata.validation_issues, proposal.validation.issues)
  assert.deepEqual(request.ingestion_metadata.duplicate_evidence, [])
  assert.equal(encoded.includes('SECRET-DIAGNOSTIC'), true)
  for (const secret of ['SECRET-RIGHTS', '/private/source.png', 'internal_evidence']) assert.equal(encoded.includes(secret), false, secret)
  assert.deepEqual(proposal, before)
})

test('invalid vocabulary, duplicate applicability, and multiple best_fit stop before request output', () => {
  const mutations = [
    (proposal) => { proposal.palette.tags.value = ['invented_tag'] },
    (proposal) => { proposal.palette.chart_applicability.value.push(structuredClone(proposal.palette.chart_applicability.value[0])) },
    (proposal) => { proposal.palette.chart_applicability.value.push({ chart_type: 'line_multiseries', suitability: 'best_fit', source: 'curated' }) }
  ]
  for (const mutate of mutations) {
    const proposal = completeFixture().proposal
    mutate(proposal)
    assert.throws(() => buildIngestionRequest(proposal), error => error instanceof IngestionRequestValidationError && error.issues.length > 0)
  }
})

test('invalid preview template/version/schema and fixed seed without value are blocking', () => {
  const mutations = [
    (preview) => { preview.template_id = 'unknown_v1' },
    (preview) => { preview.template_version = 2 },
    (preview) => { preview.schema_version = 2 },
    (preview) => { preview.seed_strategy = 'fixed'; delete preview.seed_value }
  ]
  for (const mutate of mutations) {
    const proposal = completeFixture().proposal
    mutate(proposal.preview_case_suggestions[0])
    assert.throws(() => buildIngestionRequest(proposal), error => error instanceof IngestionRequestValidationError && error.issues.length > 0)
  }
})

test('preview cases are supplied-only and do not imply applicability or vice versa', () => {
  const noPreview = readJSON(validManifestPath)
  assert.deepEqual(buildIngestionRequest(proposalFrom(noPreview)).preview_cases, [])
  const { request } = completeFixture()
  assert.equal(request.palette.chart_applicability.length, 1)
  assert.equal(request.preview_cases.length, 1)
})

test('same proposal maps canonically and source identity changes only ingestion metadata', () => {
  const manifest = withCompleteSuppliedFields(readJSON(validManifestPath))
  const firstProposal = proposalFrom(manifest, 'batch-a')
  const equivalent = structuredClone(manifest)
  equivalent.source_key = 'equivalent-source'
  const secondProposal = proposalFrom(equivalent, 'batch-b')
  const first = buildIngestionRequest(firstProposal)
  const repeated = buildIngestionRequest(structuredClone(firstProposal))
  const second = buildIngestionRequest(secondProposal)
  assert.equal(canonicalize(first), canonicalize(repeated))
  assert.deepEqual(first.palette, second.palette)
  assert.deepEqual(first.preview_cases, second.preview_cases)
  assert.equal(first.ingestion_metadata.normalized_content_hash, second.ingestion_metadata.normalized_content_hash)
  assert.notDeepEqual(first.ingestion_metadata, second.ingestion_metadata)
  assert.equal(canonicalHash(first.palette).hash, canonicalHash(second.palette).hash)
})

test('malformed proposal and invalid request output cannot cross their validation boundaries', () => {
  const proposal = completeFixture().proposal
  delete proposal.palette.type
  assert.throws(() => buildIngestionRequest(proposal), error => error instanceof IngestionRequestValidationError && error.issues.some((entry) => entry.path === '$.palette.type'))

  const request = completeFixture().request
  request.palette.color_count = 2
  const report = validateIngestionRequest(request, vocabularies)
  assert.equal(report.valid, false)
  assert.ok(report.issues.some((entry) => entry.code === 'COLOR_COUNT_MISMATCH'))

  const changedContent = completeFixture().request
  changedContent.palette.name = 'Changed after identity was computed'
  const identityReport = validateIngestionRequest(changedContent, vocabularies)
  assert.ok(identityReport.issues.some((entry) => entry.code === 'NORMALIZED_HASH_MISMATCH'))
})

function completeFixture() {
  const manifest = withCompleteSuppliedFields(readJSON(validManifestPath))
  const proposal = proposalFrom(manifest)
  return { manifest, proposal, request: buildIngestionRequest(proposal) }
}

function withCompleteSuppliedFields(manifest) {
  manifest.supplied_fields.chart_applicability[0].notes = 'Curator supplied public applicability note.'
  manifest.supplied_preview_cases = [{
    chart_type: 'bar_error',
    template_id: 'bar_error_v1',
    template_version: 1,
    schema_version: 1,
    color_roles: {
      groups: manifest.supplied_fields.colors.map((_, index) => ({ key: `group_${index + 1}`, label: `Group ${index + 1}`, fill: { source: 'palette', color_id: `color-${index + 1}` } })),
      elements: {
        axis: { source: 'theme', token: 'foreground' }, grid: { source: 'theme', token: 'grid' }, text: { source: 'theme', token: 'muted_foreground' },
        error_bar: { source: 'theme', token: 'foreground' }, background: { source: 'theme', token: 'background' }
      }
    },
    preview_config: { orientation: 'vertical', sample_size: 24, error_type: 'sem', data_pattern: 'mixed' },
    seed_strategy: 'stable_id'
  }]
  return manifest
}

function proposalFrom(manifest, batchId = 'fixture-batch') {
  const sourceHash = computeSourceHash(manifest)
  const proposal = prepareProposal({ manifest, batchId, sourceHash }).proposal
  const report = validateProposal(proposal, vocabularies)
  assert.equal(report.valid, true, JSON.stringify(report.issues))
  return proposal
}

function validateProposalSafe(manifest) {
  try {
    return validateProposal(proposalFrom(manifest), vocabularies).valid
  } catch {
    return false
  }
}

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}
