import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { canonicalHashJSON } from '../lib/jcs.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const fixturePath = path.join(root, 'contracts/palette-ingestion/v1/jcs-cross-language-fixtures.json')
const fixtures = JSON.parse(await readFile(fixturePath, 'utf8'))
const completeRequestFixture = JSON.parse(await readFile(path.join(root, 'contracts/palette-ingestion/v1/fixtures/complete-evidence-request.json'), 'utf8'))

test('Node RFC 8785 implementation matches the shared canonical bytes and hashes', () => {
  for (const fixture of fixtures.valid) {
    const actual = canonicalHashJSON(fixture.raw)
    assert.equal(actual.canonical, fixture.canonical, fixture.name)
    assert.equal(actual.hash, fixture.hash, fixture.name)
    assert.deepEqual(canonicalHashJSON(fixture.raw), actual, `${fixture.name} deterministic`)
  }
  for (const fixture of fixtures.invalid) {
    assert.throws(() => canonicalHashJSON(fixture.raw), undefined, fixture.name)
  }
})

test('actual Go and Node processes agree on the shared fingerprint and normalized-hash corpus', () => {
  const corpus = [...fixtures.valid, ...fixtures.invalid]
  const run = spawnSync('go', ['run', './cmd/jcsfixture'], {
    cwd: path.join(root, 'backend'),
    encoding: 'utf8',
    input: `${corpus.map((fixture) => fixture.raw).join('\n')}\n`,
    env: { ...process.env, GOCACHE: process.env.GOCACHE ?? '/tmp/figcolor-go-cache' }
  })
  assert.equal(run.status, 0, run.stderr)
  const goResults = run.stdout.trim().split('\n').map((line) => JSON.parse(line))
  assert.equal(goResults.length, corpus.length)
  corpus.forEach((fixture, index) => {
    const goResult = goResults[index]
    if (index >= fixtures.valid.length) {
      assert.equal(goResult.error, 'invalid_rfc8785_json', fixture.name)
      assert.throws(() => canonicalHashJSON(fixture.raw), undefined, fixture.name)
      return
    }
    const node = canonicalHashJSON(fixture.raw)
    assert.equal(goResult.canonical, node.canonical, `${fixture.name} canonical bytes`)
    assert.equal(goResult.hash, node.hash, `${fixture.name} request fingerprint`)
    assert.equal(goResult.hash, fixture.hash, `${fixture.name} normalized content hash`)
  })
})

test('actual Go and Node processes agree on the complete evidence-bearing request fingerprint', () => {
  const request = completeRequestFixture.request
  const reordered = {
    preview_cases: request.preview_cases,
    palette: request.palette,
    ingestion_metadata: Object.fromEntries(Object.entries(request.ingestion_metadata).reverse())
  }
  const changed = structuredClone(request)
  changed.ingestion_metadata.source_reference = 'protected://figure/2'
  const issueChanged = structuredClone(request)
  issueChanged.ingestion_metadata.validation_issues[0].message = 'Review changed tags.'
  const duplicateChanged = structuredClone(request)
  duplicateChanged.ingestion_metadata.duplicate_evidence.push({
    kind: 'canonical_content', fingerprint_type: 'normalized_content_hash', fingerprint_version: 1,
    fingerprint: 'a'.repeat(64), current_identity: request.ingestion_metadata.proposal_id,
    matched_identity: 'catalog/palette-1', scope: 'catalog_snapshot', path: '$.normalized_content_hash',
    code: 'EXACT_CATALOG_CONTENT_MATCH', message: 'Exact catalog content match.', severity: 'warning', source: 'duplicate'
  })
  const sourceOmitted = structuredClone(request)
  delete sourceOmitted.ingestion_metadata.source_reference
  const rawInputs = [JSON.stringify(request), `  ${JSON.stringify(reordered)}  `, JSON.stringify(changed), JSON.stringify(issueChanged), JSON.stringify(duplicateChanged), JSON.stringify(sourceOmitted)]
  const run = spawnSync('go', ['run', './cmd/jcsfixture'], {
    cwd: path.join(root, 'backend'), encoding: 'utf8', input: `${rawInputs.join('\n')}\n`,
    env: { ...process.env, GOCACHE: process.env.GOCACHE ?? '/tmp/figcolor-go-cache' }
  })
  assert.equal(run.status, 0, run.stderr)
  const go = run.stdout.trim().split('\n').map((line) => JSON.parse(line))
  const node = rawInputs.map((raw) => canonicalHashJSON(raw))
  assert.equal(node[0].hash, completeRequestFixture.request_fingerprint)
  assert.equal(node[1].hash, completeRequestFixture.request_fingerprint)
  assert.equal(node[2].hash, completeRequestFixture.source_changed_fingerprint)
  for (const index of [2, 3, 4, 5]) assert.notEqual(node[index].hash, node[0].hash)
  node.forEach((value, index) => {
    assert.equal(go[index].canonical, value.canonical)
    assert.equal(go[index].hash, value.hash)
  })
})
