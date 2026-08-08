import { canonicalHash } from './jcs.mjs'
import { ISSUE_POLICY_VERSION, duplicateIssue } from './issue-policy.mjs'
import { validateContract } from './schema-validation.mjs'

export const EXACT_FINGERPRINT_VERSION = 1
export const EMPTY_CATALOG_SNAPSHOT = Object.freeze({ snapshot_version: 1, fingerprint_version: 1, records: [] })

export function validateCatalogSnapshot(snapshot) {
  const report = validateContract('catalogComparisonSnapshot', snapshot)
  if (!report.valid) return report
  const seen = new Set()
  snapshot.records.forEach((record, index) => {
    if (seen.has(record.record_id)) report.issues.push({
      path: `$.records[${index}].record_id`,
      code: 'DUPLICATE_CATALOG_RECORD_ID',
      message: `Duplicate catalog record identity: ${record.record_id}.`,
      severity: 'error',
      source: 'input'
    })
    seen.add(record.record_id)
  })
  report.valid = report.issues.length === 0
  return report
}

export function detectExactDuplicates(candidates, catalogSnapshot = EMPTY_CATALOG_SNAPSHOT) {
  const snapshotReport = validateCatalogSnapshot(catalogSnapshot)
  if (!snapshotReport.valid) return { valid: false, issues: snapshotReport.issues, findingsByProposal: new Map(), contextHash: null }
  const candidateReport = validateCandidateIdentities(candidates)
  if (!candidateReport.valid) return { valid: false, issues: candidateReport.issues, findingsByProposal: new Map(), contextHash: null }

  const normalizedCatalogSnapshot = normalizeCatalogSnapshot(catalogSnapshot)
  const ordered = [...candidates].sort(compareCandidate)
  const findingsByProposal = new Map(ordered.map((candidate) => [candidateIdentity(candidate), []]))
  addGroupedFindings(ordered, findingsByProposal, 'source_key', 'source_key', 'source_identity', 'DUPLICATE_SOURCE_KEY')
  addGroupedFindings(ordered, findingsByProposal, 'source_hash', 'source_hash', 'source_identity', 'EXACT_SOURCE_HASH_DUPLICATE')
  addGroupedFindings(ordered, findingsByProposal, 'normalized_content_hash', 'normalized_content_hash', 'canonical_content', 'EXACT_CONTENT_DUPLICATE')

  const catalogRecords = normalizedCatalogSnapshot.records
    .filter((record) => record.status === 'candidate' || record.status === 'published')
  for (const candidate of ordered) {
    for (const record of catalogRecords) {
      if (record.normalized_content_hash !== candidate.normalized_content_hash) continue
      findingsByProposal.get(candidateIdentity(candidate)).push(finding({
        kind: 'canonical_content',
        fingerprintType: 'normalized_content_hash',
        fingerprint: candidate.normalized_content_hash,
        currentIdentity: candidateIdentity(candidate),
        matchedIdentity: record.record_id,
        scope: 'catalog_snapshot',
        code: 'EXACT_CATALOG_CONTENT_MATCH',
        path: '$.normalized_content_hash',
        message: `Verified canonical content matches catalog record ${record.record_id}.`
      }))
    }
  }

  for (const entries of findingsByProposal.values()) entries.sort(compareFinding)
  return {
    valid: true,
    issues: [],
    findingsByProposal,
    contextHash: canonicalHash({
      fingerprint_version: EXACT_FINGERPRINT_VERSION,
      issue_policy_version: ISSUE_POLICY_VERSION,
      candidates: ordered.map(identityRecord),
      catalog_snapshot: normalizedCatalogSnapshot
    }).hash
  }
}

export function issuesForFindings(findings) {
  return findings.map((entry) => duplicateIssue(entry.code, entry.path, entry.message))
}

function addGroupedFindings(candidates, output, property, fingerprintType, kind, code) {
  const groups = new Map()
  for (const candidate of candidates) {
    const fingerprint = candidate[property]
    const members = groups.get(fingerprint) ?? []
    members.push(candidate)
    groups.set(fingerprint, members)
  }
  for (const [fingerprint, members] of [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (members.length < 2) continue
    for (const current of members) {
      for (const matched of members) {
        if (candidateIdentity(matched) === candidateIdentity(current)) continue
        output.get(candidateIdentity(current)).push(finding({
          kind,
          fingerprintType,
          fingerprint,
          currentIdentity: candidateIdentity(current),
          matchedIdentity: candidateIdentity(matched),
          scope: 'current_batch',
          code,
          path: property === 'source_key' ? '$.source_key' : property === 'source_hash' ? '$.source_hash' : '$.normalized_content_hash',
          message: duplicateMessage(code, candidateIdentity(matched))
        }))
      }
    }
  }
}

function finding({ kind, fingerprintType, fingerprint, currentIdentity, matchedIdentity, scope, path, code, message }) {
  return {
    kind,
    fingerprint_type: fingerprintType,
    fingerprint_version: EXACT_FINGERPRINT_VERSION,
    fingerprint,
    current_identity: currentIdentity,
    matched_identity: matchedIdentity,
    scope,
    path,
    code,
    message,
    severity: duplicateIssue(code, path, message).severity,
    source: 'duplicate'
  }
}

function duplicateMessage(code, matchedIdentity) {
  if (code === 'DUPLICATE_SOURCE_KEY') return `Source key is also used by proposal ${matchedIdentity}.`
  if (code === 'EXACT_SOURCE_HASH_DUPLICATE') return `Exact source bytes match proposal ${matchedIdentity}.`
  return `Verified canonical content matches proposal ${matchedIdentity}.`
}

function compareCandidate(left, right) {
  return candidateIdentity(left).localeCompare(candidateIdentity(right))
}

function compareFinding(left, right) {
  return [left.code, left.fingerprint, left.matched_identity].join('\u0000').localeCompare([right.code, right.fingerprint, right.matched_identity].join('\u0000'))
}

function identityRecord(candidate) {
  return {
    identity: candidateIdentity(candidate),
    source_key: candidate.source_key,
    source_hash: candidate.source_hash,
    normalized_content_hash: candidate.normalized_content_hash
  }
}

function candidateIdentity(candidate) {
  return hasExplicitCandidateIdentity(candidate) ? candidate.identity : candidate.proposal_id
}

function hasExplicitCandidateIdentity(candidate) {
  return Object.prototype.hasOwnProperty.call(candidate, 'identity')
}

function normalizeCatalogSnapshot(snapshot) {
  return {
    ...snapshot,
    records: [...snapshot.records].sort((left, right) => left.record_id.localeCompare(right.record_id))
  }
}

function validateCandidateIdentities(candidates) {
  if (!Array.isArray(candidates)) {
    return { valid: false, issues: [candidateIssue('$', 'INVALID_CANDIDATE_IDENTITY', 'Exact duplicate candidates must be an array.')] }
  }
  const issues = []
  const seen = new Map()
  candidates.forEach((candidate, index) => {
    const candidateValue = candidate ?? {}
    const usesExplicitIdentity = hasExplicitCandidateIdentity(candidateValue)
    const identity = candidateIdentity(candidateValue)
    const path = `$[${index}].${usesExplicitIdentity ? 'identity' : 'proposal_id'}`
    if (typeof identity !== 'string' || identity.trim() === '') {
      issues.push(candidateIssue(path, 'INVALID_CANDIDATE_IDENTITY', 'Candidate identity must be a non-empty string.'))
      return
    }
    if (seen.has(identity)) {
      issues.push(candidateIssue(path, 'DUPLICATE_CANDIDATE_IDENTITY', `Candidate identity duplicates ${seen.get(identity)}: ${identity}.`))
      return
    }
    seen.set(identity, path)
  })
  return { valid: issues.length === 0, issues }
}

function candidateIssue(path, code, message) {
  return { path, code, message, severity: 'error', source: 'input' }
}
