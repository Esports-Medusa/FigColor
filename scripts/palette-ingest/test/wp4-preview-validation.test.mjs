import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { CONTRACT_ROOT, loadVocabularies } from '../lib/constants.mjs'
import { canonicalize } from '../lib/jcs.mjs'
import {
  IngestionRequestValidationError,
  buildIngestionRequest,
  computeSourceHash,
  prepareProposal
} from '../lib/pipeline.mjs'
import {
  PREVIEW_VALIDATOR_ARTIFACT,
  buildPreviewValidatorArtifact
} from '../lib/preview-validator-artifact.mjs'
import { validateIngestionRequest } from '../lib/validation.mjs'
import {
  CHART_TYPE_DEFINITIONS,
  validatePreviewCaseAgainstRegistry
} from '../generated/preview-registry-validation.mjs'

const vocabularies = loadVocabularies()
const manifestFixture = path.join(CONTRACT_ROOT, 'fixtures/valid/manual-basic/manifest.json')
const theme = (token) => ({ source: 'theme', token })
const palette = (color_id) => ({ source: 'palette', color_id })
const elements = {
  axis: theme('foreground'),
  muted_foreground: theme('muted_foreground'),
  grid: theme('grid'),
  text: theme('foreground'),
  error_bar: theme('foreground'),
  background: theme('background'),
  outline: theme('foreground'),
  median: theme('foreground')
}

const validPreviewCases = {
  bar_error: preview('bar_error', {
    groups: [namedRole('group_1', 'fill')],
    elements: pickElements('axis', 'grid', 'text', 'error_bar', 'background')
  }, { orientation: 'vertical', sample_size: 24, error_type: 'sem', data_pattern: 'mixed' }),
  boxplot_jitter: preview('boxplot_jitter', {
    groups: [namedRole('group_1', 'color')],
    elements: { axis: elements.axis }
  }, { jitter_density: 'medium', show_outliers: true }),
  line_multiseries: preview('line_multiseries', {
    series: [namedRole('series_1', 'line')],
    elements: { axis: elements.axis }
  }, { point_count: 8, curve_shape: 'mixed' }),
  heatmap_annotated: preview('heatmap_annotated', {
    scale: {
      type: 'sequential',
      stops: [
        { position: 0, color: palette('color-1') },
        { position: 1, color: palette('color-2') }
      ]
    },
    annotations: [],
    elements: { text: elements.text }
  }, {
    rows: 6,
    columns: 6,
    cluster_rows: false,
    cluster_columns: false,
    show_row_labels: true,
    show_column_labels: true,
    show_values: false,
    data_pattern: 'mixed'
  }),
  scatter_grouped: preview('scatter_grouped', {
    groups: [namedRole('group_1', 'color')],
    elements: pickElements('axis', 'muted_foreground', 'grid', 'background')
  }, { point_count: 18, data_pattern: 'clusters', point_size: 'medium', point_opacity: 0.78 }),
  violin_distribution: preview('violin_distribution', {
    groups: [namedRole('group_1', 'fill')],
    elements: pickElements('outline', 'median', 'axis', 'grid', 'background')
  }, { sample_count: 32, distribution_shape: 'mixed', bandwidth: 'medium', show_summary: true })
}

test('generated Node validator is current with the authoritative TypeScript Preview System registry', async () => {
  const generated = fs.readFileSync(PREVIEW_VALIDATOR_ARTIFACT, 'utf8')
  assert.equal(generated, await buildPreviewValidatorArtifact(), 'run node scripts/palette-ingest/generate-preview-validator.mjs')
})

test('every authoritative chart registration has valid and chart-specific invalid ingestion coverage', () => {
  const fixtureTypes = Object.keys(validPreviewCases).sort()
  const registeredTypes = CHART_TYPE_DEFINITIONS.map((definition) => definition.chartType).sort()
  assert.deepEqual(fixtureTypes, registeredTypes)

  for (const chartType of registeredTypes) {
    const valid = requestFor(validPreviewCases[chartType])
    assert.equal(validatePreviewCaseAgainstRegistry(valid.preview_cases[0]).valid, true, chartType)
    assert.deepEqual(validateIngestionRequest(valid, vocabularies).issues, [], chartType)

    for (const field of ['color_roles', 'preview_config']) {
      const invalid = requestFor({ ...validPreviewCases[chartType], [field]: {} })
      const report = validateIngestionRequest(invalid, vocabularies)
      assert.equal(report.valid, false, `${chartType} must reject empty ${field}`)
      assert.ok(report.issues.some((entry) => entry.path.startsWith(`$.preview_cases[0].${field}`)), `${chartType}:${field}`)
    }
  }
})

test('chart-specific roles, configs, references, templates, seeds, and atomic failure are blocking', () => {
  const cases = [
    ['missing required role', mutate('bar_error', (value) => { delete value.color_roles.elements.axis }), 'INVALID_COLOR_ROLES'],
    ['unknown role', mutate('bar_error', (value) => { value.color_roles.elements.invented_role = theme('foreground') }), 'INVALID_COLOR_ROLES'],
    ['missing palette color', mutate('scatter_grouped', (value) => { value.color_roles.groups[0].color.color_id = 'missing' }), 'COLOR_NOT_FOUND'],
    ['role shape', mutate('line_multiseries', (value) => { value.color_roles.series = 'wrong' }), 'INVALID_COLOR_ROLES'],
    ['missing config', mutate('boxplot_jitter', (value) => { delete value.preview_config.show_outliers }), 'INVALID_PREVIEW_CONFIG'],
    ['config range', mutate('heatmap_annotated', (value) => { value.preview_config.rows = 99 }), 'INVALID_PREVIEW_CONFIG'],
    ['other chart roles/config', mutate('violin_distribution', (value) => {
      value.color_roles = structuredClone(validPreviewCases.line_multiseries.color_roles)
      value.preview_config = structuredClone(validPreviewCases.line_multiseries.preview_config)
    }), 'INVALID_COLOR_ROLES'],
    ['template mismatch', mutate('bar_error', (value) => { value.template_id = 'line_multiseries_v1' }), 'TEMPLATE_CHART_TYPE_MISMATCH'],
    ['fixed seed value', mutate('bar_error', (value) => { value.seed_strategy = 'fixed'; delete value.seed_value }), 'REQUIRED_FIELD_MISSING'],
    ['stable seed extra value', mutate('bar_error', (value) => { value.seed_value = 7 }), 'SCHEMA_VALIDATION_FAILED']
  ]

  for (const [label, previewCase, expectedCode] of cases) {
    const report = validateIngestionRequest(requestFor(previewCase), vocabularies)
    assert.equal(report.valid, false, label)
    assert.ok(report.issues.some((entry) => entry.code === expectedCode), `${label}: ${JSON.stringify(report.issues)}`)
  }

  const manifest = readJSON(manifestFixture)
  manifest.supplied_preview_cases = [validPreviewCases.bar_error, { ...validPreviewCases.scatter_grouped, color_roles: {} }]
  const proposal = prepareProposal({ manifest, batchId: 'preview-atomic', sourceHash: computeSourceHash(manifest) }).proposal
  assert.throws(
    () => buildIngestionRequest(proposal),
    (error) => error instanceof IngestionRequestValidationError && error.issues.some((entry) => entry.path.startsWith('$.preview_cases[1].color_roles'))
  )
})

test('valid supplied preview payload/hash are unchanged and empty previews remain valid', () => {
  const manifest = readJSON(manifestFixture)
  manifest.supplied_preview_cases = [validPreviewCases.bar_error]
  const proposal = prepareProposal({ manifest, batchId: 'preview-equivalence', sourceHash: computeSourceHash(manifest) }).proposal
  const before = structuredClone(proposal)
  const request = buildIngestionRequest(proposal)
  assert.equal(canonicalize(request.preview_cases), canonicalize(manifest.supplied_preview_cases))
  assert.equal(request.ingestion_metadata.normalized_content_hash, proposal.normalized_content_hash)
  assert.deepEqual(proposal, before)

  const emptyManifest = readJSON(manifestFixture)
  emptyManifest.supplied_preview_cases = []
  const emptyProposal = prepareProposal({ manifest: emptyManifest, batchId: 'preview-empty', sourceHash: computeSourceHash(emptyManifest) }).proposal
  assert.deepEqual(buildIngestionRequest(emptyProposal).preview_cases, [])
})

function preview(chartType, colorRoles, previewConfig) {
  return {
    chart_type: chartType,
    template_id: `${chartType}_v1`,
    template_version: 1,
    schema_version: 1,
    color_roles: colorRoles,
    preview_config: previewConfig,
    seed_strategy: 'stable_id'
  }
}

function namedRole(key, field) {
  return { key, label: key, [field]: palette('color-1') }
}

function pickElements(...keys) {
  return Object.fromEntries(keys.map((key) => [key, elements[key]]))
}

function mutate(chartType, mutation) {
  const value = structuredClone(validPreviewCases[chartType])
  mutation(value)
  return value
}

function requestFor(previewCase) {
  const manifest = readJSON(manifestFixture)
  manifest.supplied_preview_cases = [previewCase]
  const proposal = prepareProposal({ manifest, batchId: 'preview-request', sourceHash: computeSourceHash(manifest) }).proposal
  const request = {
    ingestion_metadata: {
      proposal_id: proposal.proposal_id,
      source_key: proposal.source_key,
      source_hash: proposal.source_hash,
      normalized_content_hash: proposal.normalized_content_hash,
      pipeline_version: proposal.pipeline_version,
      schema_version: proposal.schema_version,
      validation_issues: [],
      duplicate_evidence: []
    },
    palette: {
      name: proposal.palette.name.value,
      type: proposal.palette.type.value,
      colors: proposal.colors.map((color) => ({ id: color.provisional_id, hex: color.hex, rgb: hexRGB(color.hex), order: color.order })),
      color_count: proposal.colors.length,
      disciplines: proposal.palette.disciplines.value,
      use_cases: proposal.palette.use_cases.value,
      avoid_cases: proposal.palette.avoid_cases.value,
      tags: proposal.palette.tags.value,
      chart_applicability: proposal.palette.chart_applicability.value
    },
    preview_cases: [structuredClone(previewCase)]
  }
  return request
}

function hexRGB(hex) {
  return [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16))
}

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}
