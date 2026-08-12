#!/usr/bin/env node
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPerceptualSimilarityPolicyProjection } from './palette-ingest/lib/perceptual-similarity.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const target = path.join(root, 'backend/internal/paletteassistant/similarity_policy_generated.go')

export function canonicalJSON(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`
  if (value && Object.getPrototypeOf(value) === Object.prototype) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJSON(value[key])}`).join(',')}}`
  throw new Error('Similarity projection contains a non-JSON value.')
}

export function validateProjection(p) {
  if (!p || p.projection_format_version !== 1 || p.policy_version !== 1 || p.color_space !== 'oklab_d65' || p.distance_metric !== 'euclidean_delta_e_ok' || p.matching !== 'canonical_index_order_preserving_one_to_one' || p.color_count_policy !== 'equal_count_required' || p.mean_distance_threshold !== 0.035 || p.maximum_pair_distance_threshold !== 0.06 || p.threshold_inclusive !== true || p.hex_format !== 'canonical_uppercase_rrggbb' || p.numerical_tolerance !== 1e-12 || !Array.isArray(p.vectors) || p.vectors.length < 20) throw new Error('Similarity projection is incomplete or unsupported.')
  const ids = new Set()
  for (const v of p.vectors) {
    if (!v || typeof v.id !== 'string' || !v.id || ids.has(v.id) || !Array.isArray(v.left) || !Array.isArray(v.right) || !Array.isArray(v.pair_distances) || typeof v.comparable !== 'boolean' || typeof v.similar !== 'boolean') throw new Error('Similarity vector is malformed.')
    ids.add(v.id)
    for (const hex of [...v.left, ...v.right]) if (!/^#[0-9A-F]{6}$/.test(hex)) throw new Error('Similarity vector HEX is non-canonical.')
    for (const n of [...v.pair_distances, v.mean_distance, v.maximum_pair_distance]) if (!Number.isFinite(n) || n < 0) throw new Error('Similarity vector contains invalid numbers.')
    if (v.comparable !== (v.left.length === v.right.length && v.left.length > 0) || v.pair_distances.length !== (v.comparable ? v.left.length : 0)) throw new Error('Similarity vector cardinality is inconsistent.')
  }
  return p
}

export function buildArtifact(projection = createPerceptualSimilarityPolicyProjection()) {
  validateProjection(projection)
  return renderArtifact(projection)
}

export function renderArtifact(projection) {
  const canonical = canonicalJSON(projection)
  const fingerprint = createHash('sha256').update(canonical).digest('hex')
  return `// Code generated from scripts/palette-ingest/lib/perceptual-similarity.mjs structured authority. DO NOT EDIT.\n\npackage paletteassistant\n\nconst SimilarityProjectionFormatVersion = 1\nconst SimilarityPolicyFingerprint = "${fingerprint}"\nconst similarityPolicyProjectionJSON = \`${canonical}\`\n`
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(target, buildArtifact(), 'utf8')
  console.log(target)
}
