import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { buildArtifact, canonicalJSON, target } from './generate-preview-registry-go.mjs'

test('Go registry artifact is deterministic and current', async () => {
  const first = await buildArtifact(); const second = await buildArtifact()
  assert.equal(first, second); assert.equal(fs.readFileSync(target, 'utf8'), first)
  assert.doesNotMatch(first, /\/Users\/|timestamp|generated_at/)
})

test('projection generation fails closed and validation changes drift', async () => {
  assert.throws(() => canonicalJSON({ invalid: () => true }), /non-JSON/)
  const base = { projection_format_version: 1, charts: Array.from({ length: 6 }, (_, i) => ({ chart_type: `c${i}`, templates: [] })), vocabularies: { disciplines: [], use_cases: [], avoid_cases: [], tags: [] } }
  assert.notEqual(await buildArtifact(base), await buildArtifact({ ...base, charts: base.charts.map((chart, index) => index ? chart : { ...chart, chart_type: 'changed' }) }))
})
