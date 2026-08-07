import { EXACT_FINGERPRINT_VERSION } from './exact-duplicates.mjs'
import { ISSUE_CODE_POLICY, ISSUE_POLICY_VERSION } from './issue-policy.mjs'
import { canonicalHash, sha256Hex } from './jcs.mjs'
import { COLOR_CONVERSION_VERSION, PERCEPTUAL_POLICY_VERSION } from './perceptual-similarity.mjs'
import { validateContract } from './schema-validation.mjs'

export const VALIDATION_SUMMARY_PATH = 'reports/validation-summary.md'
export const DISPLAY_FIELD_LIMIT = 160

export class ValidationSummaryError extends Error {
  constructor(issues) {
    super('Cannot render validation summary from invalid or inconsistent artifacts.')
    this.name = 'ValidationSummaryError'
    this.issues = issues
  }
}

export function renderValidationSummary(input) {
  const snapshot = structuredClone(input)
  const issues = validateInput(snapshot)
  if (issues.length) throw new ValidationSummaryError(issues)
  const candidates = [...snapshot.candidates].sort((a, b) => compareText(a.identity, b.identity))
  const allIssues = candidates.flatMap((entry) => entry.report.issues)
  const allFindings = candidates.flatMap((entry) => entry.report.findings ?? [])
  const exactCount = snapshot.exactIndex.findings.length
  const perceptualCount = snapshot.similarityIndex.findings.length
  const blockingCount = allIssues.filter(isBlocking).length
  const warningCount = allIssues.filter((entry) => !isBlocking(entry)).length
  const validCount = candidates.filter((entry) => entry.report.valid).length
  const lines = [
    '# Palette ingestion validation summary', '',
    '## Batch summary', '',
    '| Field | Value |', '| --- | --- |',
    row('Batch identity', snapshot.batchId),
    row('Pipeline version', snapshot.pipelineVersion),
    row('Schema version', snapshot.schemaVersion),
    row('Issue policy version', ISSUE_POLICY_VERSION),
    row('Exact fingerprint version', EXACT_FINGERPRINT_VERSION),
    row('Perceptual policy version', PERCEPTUAL_POLICY_VERSION),
    row('Color conversion version', COLOR_CONVERSION_VERSION),
    row('Candidate count', candidates.length),
    row('Valid candidates', validCount),
    row('Invalid candidates', candidates.length - validCount),
    row('Blocking findings', blockingCount),
    row('Non-blocking warnings', warningCount),
    row('Exact matches', exactCount),
    row('Perceptual matches', perceptualCount),
    row('Exact context hash', snapshot.exactIndex.context_hash),
    row('Perceptual context hash', snapshot.similarityIndex.context_hash),
    row('Overall validation status', blockingCount === 0 ? 'valid' : 'invalid'), ''
  ]
  for (const candidate of candidates) lines.push(...renderCandidate(candidate))
  return `${lines.join('\n').replace(/\n+$/u, '')}\n`
}

export function validationSummaryHash(markdown) { return sha256Hex(Buffer.from(markdown, 'utf8')) }

function validateInput(input) {
  const issues = []
  if (!input || typeof input !== 'object' || !Array.isArray(input.candidates)) return [problem('$', 'REPORT_INPUT_INVALID', 'Reporter input and candidates array are required.')]
  for (const [name, contract, value] of [
    ['exact index', 'exactDuplicateIndex', input.exactIndex],
    ['perceptual index', 'perceptualSimilarityIndex', input.similarityIndex],
    ['catalog snapshot', 'catalogComparisonSnapshot', input.catalogSnapshot]
  ]) {
    const result = validateContract(contract, value)
    if (!result.valid) issues.push(problem(`$.${contract}`, 'REPORT_DEPENDENCY_SCHEMA_INVALID', `${name} does not match its authoritative Schema.`))
  }
  const seen = new Set()
  const reports = []
  for (const [index, entry] of input.candidates.entries()) {
    if (!entry || typeof entry.identity !== 'string' || entry.identity.length === 0) issues.push(problem(`$.candidates[${index}].identity`, 'REPORT_IDENTITY_INVALID', 'Candidate identity must be non-empty.'))
    else if (seen.has(entry.identity)) issues.push(problem(`$.candidates[${index}].identity`, 'REPORT_IDENTITY_AMBIGUOUS', `Duplicate candidate identity: ${entry.identity}.`))
    else seen.add(entry.identity)
    if (!validateContract('proposal', entry?.proposal).valid) issues.push(problem(`$.candidates[${index}].proposal`, 'REPORT_DEPENDENCY_SCHEMA_INVALID', 'Proposal does not match its authoritative Schema.'))
    if (!validateContract('validationReport', entry?.report).valid) issues.push(problem(`$.candidates[${index}].report`, 'REPORT_DEPENDENCY_SCHEMA_INVALID', 'Validation report does not match its authoritative Schema.'))
    reports.push(entry?.report)
  }
  if (issues.length) return issues
  const expected = {
    catalogSnapshot: canonicalHash({ ...input.catalogSnapshot, records: [...input.catalogSnapshot.records].sort((a, b) => compareText(a.record_id, b.record_id)) }).hash,
    exactIndex: canonicalHash(input.exactIndex).hash,
    similarityIndex: canonicalHash(input.similarityIndex).hash,
    validationReports: canonicalHash(input.candidates.map(({ identity, report }) => ({ identity, report })).sort((a, b) => compareText(a.identity, b.identity))).hash
  }
  for (const [key, value] of Object.entries(expected)) if (input.hashes?.[key] !== value) issues.push(problem(`$.hashes.${key}`, 'REPORT_DEPENDENCY_HASH_MISMATCH', `${key} hash does not match its artifact.`))
  const catalogIdentities = new Set(input.catalogSnapshot.records.map((record) => record.record_id))
  for (const finding of [...input.exactIndex.findings, ...input.similarityIndex.findings]) validateFinding(finding, seen, catalogIdentities, issues)
  for (const [index, entry] of input.candidates.entries()) {
    validateFindingCandidateBinding(entry, index, issues)
    validateCandidateIssueConsistency(entry, index, issues)
  }
  const indexed = canonicalHash([...input.exactIndex.findings, ...input.similarityIndex.findings].sort(compareFinding)).hash
  const reported = canonicalHash(reports.flatMap((report) => report.findings ?? []).sort(compareFinding)).hash
  if (indexed !== reported) issues.push(problem('$.candidates', 'REPORT_FINDING_BINDING_MISMATCH', 'Validation reports are not bound to the exact/perceptual indexes.'))
  return issues
}

function validateFindingCandidateBinding(entry, candidateIndex, issues) {
  for (const [findingIndex, finding] of (entry.report.findings ?? []).entries()) {
    if (finding.current_identity !== entry.identity) issues.push(problem(
      `$.candidates[${candidateIndex}].report.findings[${findingIndex}].current_identity`,
      'REPORT_FINDING_CANDIDATE_MISMATCH',
      `Finding belongs to "${finding.current_identity}", not containing candidate "${entry.identity}".`
    ))
  }
}

// Duplicate issues do not carry matched_identity or scope. This multiset is the
// strongest unambiguous binding supported by the authoritative issue contract;
// messages are deliberately excluded and never parsed for structural identity.
function validateCandidateIssueConsistency(entry, index, issues) {
  const duplicateIssueEntries = entry.report.issues.map((item, issueIndex) => ({ item, issueIndex })).filter(({ item }) => item.source === 'duplicate')
  const duplicateIssues = duplicateIssueEntries.map(({ item }) => item)
  let policyValid = true
  for (const { item, issueIndex } of duplicateIssueEntries) {
    const issuePath = `$.candidates[${index}].report.issues[${issueIndex}]`
    if (!hasOwnPolicy(item.code)) {
      issues.push(problem(`${issuePath}.code`, 'REPORT_UNKNOWN_DUPLICATE_ISSUE_CODE', `Unknown duplicate issue code: ${item.code}.`))
      policyValid = false
      continue
    }
    const policy = ISSUE_CODE_POLICY[item.code]
    if (!validPolicy(policy)) {
      issues.push(problem(`${issuePath}.code`, 'REPORT_ISSUE_POLICY_INCOMPLETE', `Issue policy is incomplete for ${item.code}.`))
      policyValid = false
    } else if (item.severity !== policy.severity) {
      issues.push(problem(`${issuePath}.severity`, 'REPORT_ISSUE_POLICY_MISMATCH', `Duplicate issue ${item.code} severity does not match issue policy.`))
      policyValid = false
    }
  }
  if (!policyValid) return

  const expected = multiset((entry.report.findings ?? []).map(findingIssueKey))
  const actual = multiset(duplicateIssues.map(issueKey))
  for (const key of new Set([...expected.keys(), ...actual.keys()])) {
    const expectedCount = expected.get(key) ?? 0
    const actualCount = actual.get(key) ?? 0
    if (expectedCount !== actualCount) issues.push(problem(
      `$.candidates[${index}].report`,
      'REPORT_FINDING_ISSUE_COUNT_MISMATCH',
      `Structured findings require ${expectedCount} duplicate issue(s) for ${key}, but the report contains ${actualCount}.`
    ))
  }

  const expectedValid = !entry.report.issues.some(blockingAfterPolicyValidation)
  if (entry.report.valid !== expectedValid) issues.push(problem(
    `$.candidates[${index}].report.valid`,
    'REPORT_VALID_OUTCOME_MISMATCH',
    `report.valid must be ${expectedValid} for the validated issue set.`
  ))
}

function validateFinding(finding, identities, catalogIdentities, issues) {
  if (!hasOwnPolicy(finding.code)) { issues.push(problem('$.findings', 'REPORT_UNKNOWN_FINDING_CODE', `Unknown finding code: ${finding.code}.`)); return }
  const policy = ISSUE_CODE_POLICY[finding.code]
  if (!validPolicy(policy)) { issues.push(problem('$.findings', 'REPORT_ISSUE_POLICY_INCOMPLETE', `Issue policy is incomplete for ${finding.code}.`)); return }
  if (finding.severity !== policy.severity) issues.push(problem('$.findings', 'REPORT_POLICY_MISMATCH', `Finding ${finding.code} severity does not match issue policy.`))
  if (!identities.has(finding.current_identity)) issues.push(problem('$.findings', 'REPORT_IDENTITY_NOT_FOUND', `Finding references unknown current identity: ${finding.current_identity}.`))
  const matchedExists = finding.scope === 'current_batch' ? identities.has(finding.matched_identity) : catalogIdentities.has(finding.matched_identity)
  if (!matchedExists) issues.push(problem('$.findings', 'REPORT_MATCHED_IDENTITY_NOT_FOUND', `Finding references unknown matched identity: ${finding.matched_identity}.`))
  if (finding.kind === 'perceptual_similarity') {
    if (finding.perceptual_policy_version !== PERCEPTUAL_POLICY_VERSION || finding.color_conversion_version !== COLOR_CONVERSION_VERSION) issues.push(problem('$.findings', 'REPORT_VERSION_UNSUPPORTED', 'Perceptual finding uses an unsupported policy or conversion version.'))
    const pairs = finding.matched_pairs
    if (!Array.isArray(pairs) || pairs.length !== finding.current_color_count || pairs.some((pair) => pair.current_index !== pair.matched_index)) issues.push(problem('$.findings', 'REPORT_PERCEPTUAL_EVIDENCE_INVALID', 'Perceptual matched-pair evidence is incomplete or invalid.'))
  } else if (!finding.fingerprint || finding.fingerprint_version !== EXACT_FINGERPRINT_VERSION) issues.push(problem('$.findings', 'REPORT_EXACT_EVIDENCE_INVALID', 'Exact finding evidence is incomplete or unsupported.'))
}

function renderCandidate(entry) {
  const proposal = entry.proposal
  const findings = [...(entry.report.findings ?? [])].sort(compareFinding)
  const issues = [...entry.report.issues].sort(compareIssue)
  const blocking = issues.filter(isBlocking)
  const warnings = issues.filter((item) => !isBlocking(item))
  const exact = findings.filter((item) => item.kind !== 'perceptual_similarity')
  const perceptual = findings.filter((item) => item.kind === 'perceptual_similarity')
  return [
    `## Candidate: ${escapeMarkdown(entry.identity)}`, '',
    '| Field | Value |', '| --- | --- |',
    row('Canonical candidate identity', entry.identity), row('Source identity', proposal.source_key),
    row('Display name', display(proposal.palette.name.value)), row('Normalized content hash', proposal.normalized_content_hash),
    row('Color count', proposal.colors.length), row('Ordered HEX colors', proposal.colors.map((color) => color.hex).join(', ')),
    row('Candidate validation result', entry.report.valid ? 'valid' : 'invalid'), '',
    ...renderIssues('Blocking findings', blocking), ...renderIssues('Warnings', warnings),
    ...renderExact(exact), ...renderPerceptual(perceptual)
  ]
}

function renderIssues(title, issues) {
  const lines = [`### ${title}`, '']
  if (!issues.length) return [...lines, '_None._', '']
  lines.push('| Code | Severity | Blocking | Path | Message | Review/import policy |', '| --- | --- | --- | --- | --- | --- |')
  for (const item of issues) lines.push(`| ${cell(item.code)} | ${cell(item.severity)} | ${isBlocking(item)} | ${cell(item.path)} | ${cell(display(item.message))} | ${cell(ISSUE_CODE_POLICY[item.code]?.review_import_policy_status ?? 'not_applicable')} |`)
  return [...lines, '']
}

function renderExact(findings) {
  const lines = ['### Exact duplicate evidence', '']
  if (!findings.length) return [...lines, '_None._', '']
  lines.push('| Code | Severity | Blocking | Scope | Matched identity | Fingerprint type | Fingerprint | Review/import policy |', '| --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const item of findings) lines.push(`| ${cell(item.code)} | ${cell(item.severity)} | ${ISSUE_CODE_POLICY[item.code].blocking} | ${cell(item.scope)} | ${cell(item.matched_identity)} | ${cell(item.fingerprint_type)} | ${cell(item.fingerprint)} | ${cell(ISSUE_CODE_POLICY[item.code].review_import_policy_status)} |`)
  return [...lines, '']
}

function renderPerceptual(findings) {
  const lines = ['### Perceptual similarity evidence', '']
  if (!findings.length) return [...lines, '_None._', '']
  for (const item of findings) {
    lines.push(`#### ${escapeMarkdown(item.code)} → ${escapeMarkdown(item.matched_identity)}`, '',
      '| Field | Value |', '| --- | --- |', row('Severity', item.severity), row('Blocking', ISSUE_CODE_POLICY[item.code].blocking), row('Scope', item.scope),
      row('Ordered color count', item.current_color_count), row('Mean ΔEOK', item.mean_distance), row('Maximum pair ΔEOK', item.maximum_pair_distance),
      row('Mean threshold', item.mean_threshold), row('Maximum threshold', item.max_threshold), row('Perceptual policy version', item.perceptual_policy_version),
      row('Color conversion version', item.color_conversion_version), row('Review/import policy', ISSUE_CODE_POLICY[item.code].review_import_policy_status), '',
      '| Current index | Matched index | Current HEX | Matched HEX | ΔEOK |', '| ---: | ---: | --- | --- | ---: |')
    for (const pair of [...item.matched_pairs].sort((a, b) => a.current_index - b.current_index || a.matched_index - b.matched_index)) lines.push(`| ${pair.current_index} | ${pair.matched_index} | ${pair.current_hex} | ${pair.matched_hex} | ${pair.distance} |`)
    lines.push('')
  }
  return lines
}

function isBlocking(item) { return blockingAfterPolicyValidation(item) }
function blockingAfterPolicyValidation(item) { return item.source === 'duplicate' ? ISSUE_CODE_POLICY[item.code].blocking : item.severity === 'error' }
function hasOwnPolicy(code) { return Object.prototype.hasOwnProperty.call(ISSUE_CODE_POLICY, code) }
function validPolicy(policy) { return policy && policy.source === 'duplicate' && typeof policy.blocking === 'boolean' && typeof policy.review_import_policy_status === 'string' && policy.review_import_policy_status.length > 0 && ['error', 'warning', 'info'].includes(policy.severity) }
function findingIssueKey(finding) { return issueKey({ code: finding.code, path: finding.path, source: finding.source, severity: finding.severity }) }
function issueKey(item) { return [item.code, item.path, item.source, item.severity].join('\0') }
function multiset(values) { const counts = new Map(); for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1); return counts }
function compareFinding(a, b) { return compareText([a.current_identity, a.code, a.scope, a.matched_identity].join('\0'), [b.current_identity, b.code, b.scope, b.matched_identity].join('\0')) }
function compareIssue(a, b) { return (isBlocking(b) ? 1 : 0) - (isBlocking(a) ? 1 : 0) || compareText([a.code, a.path, a.message].join('\0'), [b.code, b.path, b.message].join('\0')) }
function compareText(a, b) { return a < b ? -1 : a > b ? 1 : 0 }
function row(label, value) { return `| ${cell(label)} | ${cell(value)} |` }
function cell(value) { return escapeMarkdown(String(value)) }
function display(value) { const text = String(value); return text.length <= DISPLAY_FIELD_LIMIT ? text : `${text.slice(0, DISPLAY_FIELD_LIMIT)}…` }
function escapeMarkdown(value) { return String(value).normalize('NFC').replace(/([|`\\])/gu, '\\$1').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu, (char) => `\\u${char.codePointAt(0).toString(16).padStart(4, '0')}`) }
function problem(path, code, message) { return { path, code, message, severity: 'error', source: 'input' } }
