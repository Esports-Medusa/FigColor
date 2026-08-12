import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { createPerceptualSimilarityPolicyProjection } from './palette-ingest/lib/perceptual-similarity.mjs'
import { buildArtifact, canonicalJSON, renderArtifact, target, validateProjection } from './generate-palette-similarity-go.mjs'

test('structured similarity projection and generated Go artifact are deterministic and current', () => {
  const firstProjection = createPerceptualSimilarityPolicyProjection()
  const secondProjection = createPerceptualSimilarityPolicyProjection()
  assert.equal(canonicalJSON(firstProjection), canonicalJSON(secondProjection))
  assert.deepEqual(firstProjection, secondProjection)
  const first = buildArtifact(firstProjection); const second = buildArtifact(secondProjection)
  assert.equal(first, second); assert.equal(fs.readFileSync(target, 'utf8'), first)
  assert.doesNotMatch(first, /\/Users\/|generated_at|timestamp|normalized_score/)
})

test('projection fails closed and policy/vector changes drift fingerprint and output', () => {
  assert.throws(() => canonicalJSON({ bad: () => true }), /non-JSON/)
  const base = createPerceptualSimilarityPolicyProjection()
  assert.throws(() => validateProjection({ ...base, matching: 'minimum_cost' }), /unsupported/)
  const baseline = buildArtifact(base)
  const policyMutation = { ...base, mean_distance_threshold: 0.034 }
  assert.throws(() => buildArtifact(policyMutation), /unsupported/)
  const policyExpected = renderArtifact(policyMutation)
  assert.notEqual(policyExpected, baseline)
  assert.notEqual(policyExpected.match(/Fingerprint = "([a-f0-9]+)"/)?.[1], baseline.match(/Fingerprint = "([a-f0-9]+)"/)?.[1])
  const vectorMutation = { ...base, vectors: base.vectors.map((v, i) => i ? v : { ...v, id: `${v.id}_changed` }) }
  const changed = buildArtifact(vectorMutation)
  assert.notEqual(changed, baseline)
  assert.notEqual(changed.match(/Fingerprint = "([a-f0-9]+)"/)?.[1], baseline.match(/Fingerprint = "([a-f0-9]+)"/)?.[1])
})

test('generation does not modify Node authority', () => {
  const authority = new URL('./palette-ingest/lib/perceptual-similarity.mjs', import.meta.url)
  const before = fs.readFileSync(authority, 'utf8')
  buildArtifact(); buildArtifact()
  assert.equal(fs.readFileSync(authority, 'utf8'), before)
})
