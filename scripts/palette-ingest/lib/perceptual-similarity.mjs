import { canonicalHash } from './jcs.mjs'
import { duplicateIssue, ISSUE_POLICY_VERSION } from './issue-policy.mjs'
import { detectExactDuplicates } from './exact-duplicates.mjs'

export const PERCEPTUAL_POLICY_VERSION = 1
export const COLOR_CONVERSION_VERSION = 1
export const PERCEPTUAL_POLICY = Object.freeze({
  source_encoding: 'srgb_hex_8bit',
  gamma_decoding: 'iec_61966_2_1',
  color_space: 'oklab_d65',
  distance_metric: 'euclidean_delta_e_ok',
  matching: 'canonical_index_order_preserving_one_to_one',
  same_color_count_only: true,
  mean_threshold: 0.035,
  max_threshold: 0.06,
  evidence_decimals: 6
})

export function srgbHexToOklab(hex) {
  if (typeof hex !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(hex)) throw new Error(`Invalid sRGB HEX color: ${String(hex)}`)
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255).map(decodeSrgb)
  const [r, g, b] = channels
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
  const lRoot = Math.cbrt(l)
  const mRoot = Math.cbrt(m)
  const sRoot = Math.cbrt(s)
  return {
    l: 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    a: 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot
  }
}

export function deltaEOk(left, right) {
  return Math.hypot(left.l - right.l, left.a - right.a, left.b - right.b)
}

export function evaluatePaletteSimilarity(left, right) {
  const policy = PERCEPTUAL_POLICY
  if (!Array.isArray(left) || !Array.isArray(right)) throw new Error('Palette colors must be arrays.')
  const canonical = (values) => values.map((hex) => {
    if (typeof hex !== 'string' || !/^#[0-9A-F]{6}$/.test(hex)) throw new Error('Palette colors must use canonical uppercase HEX.')
    return hex
  })
  const comparison = comparePalettes(canonical(left), canonical(right), policy)
  if (!comparison) return { comparable: false, pair_distances: [], mean_distance: 0, maximum_pair_distance: 0, similar: false }
  return {
    comparable: true,
    pair_distances: comparison.pairs.map((pair) => pair.rawDistance),
    mean_distance: comparison.mean,
    maximum_pair_distance: comparison.maximum,
    similar: comparison.near
  }
}

export function createPerceptualSimilarityPolicyProjection() {
  const cases = [
    ['black', ['#000000'], ['#000000']], ['white', ['#FFFFFF'], ['#FFFFFF']],
    ['red', ['#FF0000'], ['#FF0000']], ['green', ['#00FF00'], ['#00FF00']], ['blue', ['#0000FF'], ['#0000FF']],
    ['grey_short', ['#808080'], ['#818181']], ['muted', ['#6B7C93'], ['#6C7D94']], ['saturated', ['#E63946'], ['#E83A47']],
    ['identity_multi', ['#112233', '#AABBCC', '#445566'], ['#112233', '#AABBCC', '#445566']],
    ['reversed', ['#FF0000', '#00FF00', '#0000FF'], ['#0000FF', '#00FF00', '#FF0000']],
    ['permuted', ['#112233', '#AABBCC', '#445566'], ['#445566', '#112233', '#AABBCC']],
    ['unequal', ['#112233'], ['#112233', '#445566']], ['empty', [], []], ['left_empty', [], ['#112233']],
    ['mean_below', ['#808080'], ['#8A8A8A']], ['mean_above', ['#808080'], ['#8B8B8B']],
    ['max_below', ['#112233', '#445566'], ['#332233', '#445566']], ['max_above', ['#112233', '#445566'], ['#342233', '#445566']],
    ['mean_pass_max_fail', ['#112233', '#445566', '#778899', '#AABBCC'], ['#342233', '#445566', '#778899', '#AABBCC']],
    ['repeated', ['#112233', '#112233'], ['#112233', '#112234']],
    ['scientific_bar', ['#4C78A8', '#F58518', '#54A24B'], ['#4D79A9', '#F48619', '#55A34C']],
    ['sequential', ['#EFF3FF', '#6BAED6', '#08519C'], ['#EEF2FE', '#6CAFD7', '#09529D']],
    ['diverging', ['#B2182B', '#F7F7F7', '#2166AC'], ['#B3192C', '#F6F6F6', '#2267AD']],
    ['near_duplicate', ['#4477AA', '#EE6677', '#228833'], ['#4578AB', '#ED6878', '#238934']],
    ['unrelated', ['#000000', '#FFFFFF'], ['#FF0000', '#00FF00']]
  ]
  return {
    projection_format_version: 1,
    policy_version: PERCEPTUAL_POLICY_VERSION,
    color_space: PERCEPTUAL_POLICY.color_space,
    distance_metric: PERCEPTUAL_POLICY.distance_metric,
    matching: PERCEPTUAL_POLICY.matching,
    color_count_policy: PERCEPTUAL_POLICY.same_color_count_only ? 'equal_count_required' : 'unsupported',
    mean_distance_threshold: PERCEPTUAL_POLICY.mean_threshold,
    maximum_pair_distance_threshold: PERCEPTUAL_POLICY.max_threshold,
    threshold_inclusive: true,
    hex_format: 'canonical_uppercase_rrggbb',
    numerical_tolerance: 1e-12,
    vectors: cases.map(([id, left, right]) => ({ id, left, right, ...evaluatePaletteSimilarity(left, right) }))
  }
}

export function classifyPerceptualDistances(distances, policy = PERCEPTUAL_POLICY) {
  if (!Array.isArray(distances) || distances.length === 0 || distances.some((value) => typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
    throw new Error('Perceptual distances must be a non-empty array of finite non-negative numbers.')
  }
  const mean = distances.reduce((sum, value) => sum + value, 0) / distances.length
  const maximum = Math.max(...distances)
  return { mean, maximum, near: mean <= policy.mean_threshold && maximum <= policy.max_threshold }
}

export function detectPerceptualSimilarities(candidates, catalogSnapshot) {
  const policy = PERCEPTUAL_POLICY
  const exact = detectExactDuplicates(candidates, catalogSnapshot)
  if (!exact.valid) return invalidResult(exact.issues)
  const candidateReport = normalizeCandidates(candidates)
  if (!candidateReport.valid) return invalidResult(candidateReport.issues)
  const catalogReport = normalizeCatalogRecords(catalogSnapshot)
  if (!catalogReport.valid) return invalidResult(catalogReport.issues)

  const ordered = candidateReport.candidates
  const findingsByProposal = new Map(ordered.map((candidate) => [candidate.identity, []]))
  const exactExclusions = []
  for (let leftIndex = 0; leftIndex < ordered.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < ordered.length; rightIndex += 1) {
      const left = ordered[leftIndex]
      const right = ordered[rightIndex]
      if (left.normalized_content_hash === right.normalized_content_hash) {
        exactExclusions.push(exclusion(left.identity, right.identity, 'current_batch'))
        continue
      }
      const comparison = comparePalettes(left.colors, right.colors, policy)
      if (!comparison?.near) continue
      findingsByProposal.get(left.identity).push(perceptualFinding(left, right, 'current_batch', comparison, 'NEAR_DUPLICATE_CONTENT', policy))
      findingsByProposal.get(right.identity).push(perceptualFinding(right, left, 'current_batch', reverseComparison(comparison), 'NEAR_DUPLICATE_CONTENT', policy))
    }
  }

  for (const candidate of ordered) {
    for (const record of catalogReport.records) {
      if (candidate.normalized_content_hash === record.normalized_content_hash) {
        exactExclusions.push(exclusion(candidate.identity, record.identity, 'catalog_snapshot'))
        continue
      }
      const comparison = comparePalettes(candidate.colors, record.colors, policy)
      if (!comparison?.near) continue
      findingsByProposal.get(candidate.identity).push(perceptualFinding(candidate, record, 'catalog_snapshot', comparison, 'NEAR_CATALOG_CONTENT_MATCH', policy))
    }
  }
  for (const findings of findingsByProposal.values()) findings.sort(compareFinding)
  exactExclusions.sort((left, right) => exclusionKey(left).localeCompare(exclusionKey(right)))
  return {
    valid: true,
    issues: [],
    findingsByProposal,
    contextHash: canonicalHash({
      perceptual_policy_version: PERCEPTUAL_POLICY_VERSION,
      color_conversion_version: COLOR_CONVERSION_VERSION,
      issue_policy_version: ISSUE_POLICY_VERSION,
      policy,
      candidates: ordered,
      catalog_snapshot: { ...catalogSnapshot, records: catalogReport.allRecords },
      exact_exclusions: exactExclusions
    }).hash
  }
}

export function issuesForPerceptualFindings(findings) {
  return findings.map((finding) => duplicateIssue(finding.code, finding.path, finding.message))
}

function comparePalettes(current, matched, policy) {
  if (current.length !== matched.length || current.length === 0) return null
  const pairs = current.map((hex, index) => ({
    current_index: index,
    matched_index: index,
    current_hex: hex,
    matched_hex: matched[index],
    rawDistance: deltaEOk(srgbHexToOklab(hex), srgbHexToOklab(matched[index]))
  }))
  const classification = classifyPerceptualDistances(pairs.map((pair) => pair.rawDistance), policy)
  return { ...classification, pairs }
}

function perceptualFinding(current, matched, scope, comparison, code, policy) {
  const message = scope === 'current_batch'
    ? `Perceptually similar ordered palette matches proposal ${matched.identity}.`
    : `Perceptually similar ordered palette matches catalog record ${matched.identity}.`
  return {
    kind: 'perceptual_similarity',
    perceptual_policy_version: PERCEPTUAL_POLICY_VERSION,
    color_conversion_version: COLOR_CONVERSION_VERSION,
    current_identity: current.identity,
    matched_identity: matched.identity,
    scope,
    current_color_count: current.colors.length,
    matched_color_count: matched.colors.length,
    mean_distance: roundEvidence(comparison.mean, policy),
    maximum_pair_distance: roundEvidence(comparison.maximum, policy),
    matched_pairs: comparison.pairs.map((pair) => ({
      current_index: pair.current_index,
      matched_index: pair.matched_index,
      current_hex: pair.current_hex,
      matched_hex: pair.matched_hex,
      distance: roundEvidence(pair.rawDistance, policy)
    })),
    mean_threshold: policy.mean_threshold,
    max_threshold: policy.max_threshold,
    path: '$.colors',
    code,
    message,
    severity: duplicateIssue(code, '$.colors', message).severity,
    source: 'duplicate'
  }
}

function normalizeCandidates(candidates) {
  const issues = []
  const normalized = candidates.map((candidate, index) => {
    const identity = Object.prototype.hasOwnProperty.call(candidate, 'identity') ? candidate.identity : candidate.proposal_id
    const colors = normalizeColors(candidate.colors, `$[${index}].colors`, issues)
    return { identity, normalized_content_hash: candidate.normalized_content_hash, colors }
  }).sort((left, right) => left.identity.localeCompare(right.identity))
  return { valid: issues.length === 0, issues, candidates: normalized }
}

function normalizeCatalogRecords(snapshot) {
  const issues = []
  const allRecords = [...snapshot.records].sort((left, right) => left.record_id.localeCompare(right.record_id))
  const records = allRecords
    .filter((record) => (record.status === 'candidate' || record.status === 'published') && record.colors !== undefined)
    .map((record, index) => ({ identity: record.record_id, normalized_content_hash: record.normalized_content_hash, colors: normalizeColors(record.colors, `$.records[${index}].colors`, issues) }))
  return { valid: issues.length === 0, issues, records, allRecords }
}

function normalizeColors(colors, path, issues) {
  if (!Array.isArray(colors) || colors.length === 0 || colors.length > 64) {
    issues.push(inputIssue(path, 'INVALID_PERCEPTUAL_COLORS', 'Perceptual comparison requires 1 to 64 canonical HEX colors.'))
    return []
  }
  return colors.map((value, index) => {
    const hex = typeof value === 'string' ? value : value?.hex
    if (typeof hex !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(hex)) issues.push(inputIssue(`${path}[${index}]`, 'INVALID_PERCEPTUAL_COLOR', 'Color must be a canonical six-digit sRGB HEX value.'))
    return typeof hex === 'string' ? hex.toUpperCase() : ''
  })
}

function reverseComparison(comparison) {
  return { ...comparison, pairs: comparison.pairs.map((pair) => ({ ...pair, current_index: pair.matched_index, matched_index: pair.current_index, current_hex: pair.matched_hex, matched_hex: pair.current_hex })) }
}

function decodeSrgb(value) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function roundEvidence(value, policy) {
  return Number(value.toFixed(policy.evidence_decimals))
}

function compareFinding(left, right) {
  return [left.code, left.matched_identity].join('\u0000').localeCompare([right.code, right.matched_identity].join('\u0000'))
}

function exclusion(left, right, scope) { return { left, right, scope } }
function exclusionKey(value) { return [value.scope, value.left, value.right].join('\u0000') }
function invalidResult(issues) { return { valid: false, issues, findingsByProposal: new Map(), contextHash: null } }
function inputIssue(path, code, message) { return { path, code, message, severity: 'error', source: 'input' } }
