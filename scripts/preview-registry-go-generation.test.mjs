import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { buildArtifact, canonicalJSON, loadProjectionModule, target } from './generate-preview-registry-go.mjs'

test('Go registry artifact is deterministic and current', async () => {
  const first = await buildArtifact(); const second = await buildArtifact()
  assert.equal(first, second); assert.equal(fs.readFileSync(target, 'utf8'), first)
  assert.doesNotMatch(first, /\/Users\/|timestamp|generated_at/)
})

test('projection generation fails closed and validation changes drift', async () => {
  assert.throws(() => canonicalJSON({ invalid: () => true }), /non-JSON/)
  const base = { projection_format_version: 1, charts: Array.from({ length: 6 }, (_, i) => ({ chart_type: `c${i}`, templates: [] })), vocabularies: { disciplines: [], use_cases: [], avoid_cases: [], tags: [] } }
  const baseline = await buildArtifact(base)
  const mutated = await buildArtifact({ ...base, charts: base.charts.map((chart, index) => index ? chart : { ...chart, chart_type: 'changed' }) })
  assert.notEqual(baseline, mutated)
  assert.notEqual(baseline.match(/PreviewRegistryFingerprint = "([a-f0-9]+)"/)?.[1], mutated.match(/PreviewRegistryFingerprint = "([a-f0-9]+)"/)?.[1])
})

test('concurrent generation is isolated, cleans temporary modules, and does not modify authority', async () => {
  const authority = [
    'src/lib/chart-types/registry.ts', 'src/lib/chart-types/types.ts', 'src/lib/chart-types/validation.ts',
    ...['bar-error', 'boxplot-jitter', 'line-multiseries', 'heatmap-annotated', 'scatter-grouped', 'violin-distribution'].map(chart => `src/lib/chart-types/${chart}/definition.ts`)
  ]
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
  const beforeFiles = new Map(authority.map(file => [file, fs.readFileSync(path.join(root, file), 'utf8')]))
  const beforeTemporary = new Set(fs.readdirSync(os.tmpdir()).filter(name => name.startsWith('figcolor-preview-registry-')))
  const outputs = await Promise.all([buildArtifact(), buildArtifact(), buildArtifact()])
  assert.equal(new Set(outputs).size, 1)
  const afterTemporary = fs.readdirSync(os.tmpdir()).filter(name => name.startsWith('figcolor-preview-registry-') && !beforeTemporary.has(name))
  assert.deepEqual(afterTemporary, [])
  for (const [file, contents] of beforeFiles) assert.equal(fs.readFileSync(path.join(root, file), 'utf8'), contents, `${file} was modified`)
})

test('temporary projection module is cleaned after import failure', async () => {
  const before = new Set(fs.readdirSync(os.tmpdir()).filter(name => name.startsWith('figcolor-preview-registry-')))
  await assert.rejects(loadProjectionModule('throw new Error("isolated failure")'), /isolated failure/)
  assert.deepEqual(fs.readdirSync(os.tmpdir()).filter(name => name.startsWith('figcolor-preview-registry-') && !before.has(name)), [])
})
