export const ISSUE_POLICY_VERSION = 1

export const ISSUE_CODE_POLICY = Object.freeze({
  DUPLICATE_SOURCE_KEY: policy('error', true, 'blocked_current_batch'),
  EXACT_SOURCE_HASH_DUPLICATE: policy('error', true, 'blocked_current_batch'),
  EXACT_CONTENT_DUPLICATE: policy('error', true, 'blocked_current_batch'),
  EXACT_CATALOG_CONTENT_MATCH: policy('warning', false, 'deferred_wp6'),
  NEAR_DUPLICATE_CONTENT: policy('warning', false, 'deferred_wp6'),
  NEAR_CATALOG_CONTENT_MATCH: policy('warning', false, 'deferred_wp6')
})

export function duplicateIssue(code, path, message) {
  const classification = ISSUE_CODE_POLICY[code]
  if (!classification) throw new Error(`Unknown duplicate issue code: ${code}`)
  return { path, code, message, severity: classification.severity, source: 'duplicate' }
}

export function isBlockingIssue(issue) {
  if (issue.source !== 'duplicate') return issue.severity === 'error'
  const classification = ISSUE_CODE_POLICY[issue.code]
  if (!classification) throw new Error(`Unknown duplicate issue code: ${issue.code}`)
  return classification.blocking
}

function policy(severity, blocking, review_import_policy_status) {
  return Object.freeze({ severity, source: 'duplicate', blocking, review_import_policy_status })
}
