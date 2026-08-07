import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import {
  DEFAULT_ARTIFACT_ROOT,
  MAX_MANIFEST_BYTES,
  PIPELINE_VERSION,
  SCHEMA_VERSION,
  loadVocabularies
} from './constants.mjs'
import { canonicalize, canonicalHash, sha256Hex } from './jcs.mjs'
import {
  assertRealPathContained,
  atomicWriteJSON,
  atomicWriteText,
  containedPath,
  issue,
  listPackageDirectories,
  readJSONFile,
  resolveContainedFile,
  safeSegment
} from './files.mjs'
import { validateIngestionRequest, validateManifest, validateProposal } from './validation.mjs'
import { validateContract } from './schema-validation.mjs'
import {
  EMPTY_CATALOG_SNAPSHOT,
  detectExactDuplicates,
  issuesForFindings
} from './exact-duplicates.mjs'
import { ISSUE_POLICY_VERSION, isBlockingIssue } from './issue-policy.mjs'
import {
  COLOR_CONVERSION_VERSION,
  PERCEPTUAL_POLICY_VERSION,
  detectPerceptualSimilarities,
  issuesForPerceptualFindings
} from './perceptual-similarity.mjs'
import { renderValidationSummary, validationSummaryHash, VALIDATION_SUMMARY_PATH } from './validation-summary.mjs'

export function deriveBatchId(batchRoot) {
  const base = path.basename(path.resolve(batchRoot)).toLowerCase()
  if (/^[a-z0-9][a-z0-9_-]{0,79}$/.test(base)) return base
  return `batch-${sha256Hex(path.resolve(batchRoot)).slice(0, 12)}`
}

export function artifactPaths(artifactRoot, batchId, sourceKey) {
  safeSegment(batchId, 'batch id')
  safeSegment(sourceKey, 'source key')
  const batch = containedPath(artifactRoot, batchId)
  return {
    batch,
    batchState: containedPath(batch, 'batch.json'),
    proposal: containedPath(batch, 'proposals', `${sourceKey}.json`),
    checkpoint: containedPath(batch, 'checkpoints', `${sourceKey}.json`),
    validation: containedPath(batch, 'validation', `${sourceKey}.json`),
    request: containedPath(batch, 'requests', `${sourceKey}.json`),
    receipt: containedPath(batch, 'receipts', `${sourceKey}.json`),
    duplicateIndex: containedPath(batch, 'duplicates', 'exact-index.json'),
    similarityIndex: containedPath(batch, 'similarities', 'perceptual-index.json'),
    validationSummary: containedPath(batch, 'reports', 'validation-summary.md')
  }
}

export function loadPackage(packageRoot, vocabularies = loadVocabularies()) {
  const manifestPath = path.join(packageRoot, 'manifest.json')
  let manifest
  try {
    manifest = readJSONFile(manifestPath, MAX_MANIFEST_BYTES, packageRoot)
  } catch (error) {
    return { packageRoot, manifest: null, sourceKey: path.basename(packageRoot), reference: null, report: { valid: false, issues: [issue('$.manifest', classifyReadError(error), error.message)] } }
  }
  const report = validateManifest(manifest, vocabularies)
  let reference = null
  if (manifest.figure_path !== undefined) {
    try {
      reference = resolveContainedFile(packageRoot, manifest.figure_path)
    } catch (error) {
      report.issues.push(issue('$.figure_path', classifyPathError(error), error.message))
      report.valid = false
    }
  }
  return { packageRoot, manifest, sourceKey: manifest.source_key ?? path.basename(packageRoot), reference, report }
}

function classifyReadError(error) {
  if (/Symbolic links are not allowed/.test(error.message)) return 'SYMLINK_NOT_ALLOWED'
  if (/exceeds/.test(error.message)) return 'INPUT_TOO_LARGE'
  if (error instanceof SyntaxError) return 'MALFORMED_JSON'
  return 'INPUT_READ_FAILED'
}

function classifyPathError(error) {
  if (/escapes/.test(error.message)) return 'PATH_TRAVERSAL'
  if (/type is not allowed/.test(error.message)) return 'FILE_TYPE_UNSUPPORTED'
  if (/exceeds/.test(error.message)) return 'INPUT_TOO_LARGE'
  return 'INPUT_REFERENCE_INVALID'
}

export function computeSourceHash(manifest, referencePath = null) {
  const identityManifest = structuredClone(manifest)
  if ('figure_path' in identityManifest) identityManifest.figure_path = referencePath ? 'figure' : null
  const hash = createHash('sha256')
  appendFrame(hash, 'manifest', Buffer.from(canonicalize(identityManifest), 'utf8'))
  if (referencePath) appendFrame(hash, 'figure', fs.readFileSync(referencePath))
  return hash.digest('hex')
}

function appendFrame(hash, logicalName, bytes) {
  const name = Buffer.from(logicalName, 'utf8')
  const header = Buffer.alloc(8)
  header.writeUInt32BE(name.length, 0)
  header.writeUInt32BE(bytes.length, 4)
  hash.update(header).update(name).update(bytes)
}

function suggested(value, method = 'supplied', requiresReview = false) {
  return { value, method, requires_review: requiresReview }
}

export function prepareProposal({ manifest, batchId, sourceHash, vocabularies = loadVocabularies() }) {
  const colors = manifest.supplied_fields.colors.map((raw, index) => ({
    provisional_id: `color-${index + 1}`,
    hex: `#${raw.replace(/^#/, '').toUpperCase()}`,
    order: index,
    method: 'supplied',
    requires_review: false
  }))
  const applicability = manifest.supplied_fields.chart_applicability.map((item) => ({ ...item, source: 'curated' }))
  const paletteWithoutName = {
    type: suggested(manifest.supplied_fields.type),
    disciplines: suggested([...manifest.supplied_fields.disciplines]),
    use_cases: suggested([...manifest.supplied_fields.use_cases]),
    avoid_cases: suggested([...manifest.supplied_fields.avoid_cases]),
    tags: suggested([...manifest.supplied_fields.tags]),
    chart_applicability: suggested(applicability)
  }
  const contentNameHash = canonicalHash({
    schema_version: SCHEMA_VERSION,
    colors: colors.map(canonicalColor),
    palette: unwrapPalette(paletteWithoutName),
    preview_cases: structuredClone(manifest.supplied_preview_cases ?? [])
  }).hash
  const palette = {
    name: suggested(`Manual Palette ${contentNameHash.slice(0, 8).toUpperCase()}`, 'deterministic', true),
    ...paletteWithoutName
  }
  const canonicalContent = canonicalCandidateContent({ colors, palette, preview_case_suggestions: structuredClone(manifest.supplied_preview_cases ?? []), schema_version: SCHEMA_VERSION })
  const { hash: normalizedContentHash } = canonicalHash(canonicalContent)
  const proposal = {
    proposal_id: `${batchId}/${manifest.source_key}`,
    batch_id: batchId,
    source_key: manifest.source_key,
    source_hash: sourceHash,
    pipeline_version: PIPELINE_VERSION,
    schema_version: SCHEMA_VERSION,
    normalized_content_hash: normalizedContentHash,
    colors,
    palette,
    preview_case_suggestions: structuredClone(manifest.supplied_preview_cases ?? []),
    internal_evidence: {
      source_reference: manifest.internal_source?.source_reference,
      has_figure_reference: Boolean(manifest.figure_path)
    },
    validation: { valid: true, issues: [] }
  }
  proposal.validation = validateProposal(proposal, vocabularies)
  return { proposal, hashInput: canonicalContent }
}

export class IngestionRequestValidationError extends Error {
  constructor(issues) {
    super('Cannot build canonical ingestion request from an invalid proposal.')
    this.name = 'IngestionRequestValidationError'
    this.issues = issues
  }
}

export function buildIngestionRequest(proposal, vocabularies = loadVocabularies(), report = proposal.validation) {
  const proposalReport = validateProposal(proposal, vocabularies)
  if (!proposalReport.valid) throw new IngestionRequestValidationError(proposalReport.issues)
  if (proposal.validation.valid !== true) {
    throw new IngestionRequestValidationError([issue('$.validation.valid', 'PROPOSAL_NOT_VALIDATED', 'Proposal validation must be successful before mapping.', 'domain')])
  }
  if (canonicalHash(hashInputFromProposal(proposal)).hash !== proposal.normalized_content_hash) {
    throw new IngestionRequestValidationError([issue('$.normalized_content_hash', 'NORMALIZED_HASH_MISMATCH', 'Proposal content does not match normalized_content_hash.', 'normalization')])
  }

  const validationIssues = evidenceArray(report, 'issues')
  const duplicateEvidence = evidenceArray(report, 'findings')
  const ingestionMetadata = {
    proposal_id: proposal.proposal_id,
    source_key: proposal.source_key,
    source_hash: proposal.source_hash,
    normalized_content_hash: proposal.normalized_content_hash,
    pipeline_version: proposal.pipeline_version,
    schema_version: proposal.schema_version,
    validation_issues: structuredClone(validationIssues),
    duplicate_evidence: structuredClone(duplicateEvidence)
  }
  const sourceReference = proposal.internal_evidence?.source_reference
  if (sourceReference !== undefined) ingestionMetadata.source_reference = structuredClone(sourceReference)
  const request = {
    ingestion_metadata: ingestionMetadata,
    palette: {
      name: proposal.palette.name.value,
      type: proposal.palette.type.value,
      colors: proposal.colors.map(({ provisional_id, hex, order }) => ({ id: provisional_id, hex, rgb: rgbFromHex(hex), order })),
      color_count: proposal.colors.length,
      disciplines: structuredClone(proposal.palette.disciplines.value),
      use_cases: structuredClone(proposal.palette.use_cases.value),
      avoid_cases: structuredClone(proposal.palette.avoid_cases.value),
      tags: structuredClone(proposal.palette.tags.value),
      chart_applicability: structuredClone(proposal.palette.chart_applicability.value)
    },
    preview_cases: structuredClone(proposal.preview_case_suggestions)
  }
  const requestReport = validateIngestionRequest(request, vocabularies)
  if (!requestReport.valid) throw new IngestionRequestValidationError(requestReport.issues)
  return request
}

function evidenceArray(report, field) {
  const value = report?.[field]
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    throw new IngestionRequestValidationError([issue(`$.validation.${field}`, 'INVALID_EVIDENCE', `${field} must be an array.`, 'domain')])
  }
  return value
}

function rgbFromHex(hex) {
  return [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16))
}

export function hashInputFromProposal(proposal) {
  return canonicalCandidateContent(proposal)
}

export function canonicalCandidateContent(proposal) {
  return {
    schema_version: proposal.schema_version,
    colors: proposal.colors.map(canonicalColor),
    palette: unwrapPalette(proposal.palette),
    preview_cases: proposal.preview_case_suggestions
  }
}

export function proposalArtifactHash(proposal) {
  return canonicalHash(JSON.parse(JSON.stringify(proposal))).hash
}

function canonicalColor(color) {
  return { provisional_id: color.provisional_id, hex: color.hex, order: color.order }
}

function unwrapPalette(palette) {
  return Object.fromEntries(Object.entries(palette).map(([key, suggestion]) => [key, structuredClone(suggestion.value)]))
}

export function runBatch(command, options) {
  const batchRoot = fs.realpathSync(options.batch)
  const artifactRoot = path.resolve(options.artifacts ?? DEFAULT_ARTIFACT_ROOT)
  const batchId = deriveBatchId(batchRoot)
  const vocabularies = loadVocabularies()
  const packages = listPackageDirectories(batchRoot)
  const results = []

  if (command === 'status') return readStatus(artifactRoot, batchId)
  if (command === 'validate') return validatePrepared(artifactRoot, batchId, vocabularies, options)

  for (const packageRoot of packages) {
    const loaded = loadPackage(packageRoot, vocabularies)
    let result = { source_key: loaded.sourceKey, status: loaded.report.valid ? 'discovered' : 'validation_failed', issues: loaded.report.issues }
    if (loaded.report.valid && command === 'prepare') {
      const sourceHash = computeSourceHash(loaded.manifest, loaded.reference)
      const paths = artifactPaths(artifactRoot, batchId, loaded.sourceKey)
      const resumed = options.resume ? readCheckpoint(paths, sourceHash) : null
      if (resumed) {
        result = { source_key: loaded.sourceKey, status: 'prepared', issues: [], resumed: true, artifact_path: relativeArtifact(artifactRoot, paths.proposal), proposal: readJSONFile(paths.proposal, 2 * 1024 * 1024, artifactRoot) }
      } else {
        const { proposal } = prepareProposal({ manifest: loaded.manifest, batchId, sourceHash, vocabularies })
        result = { source_key: loaded.sourceKey, status: proposal.validation.valid ? 'prepared' : 'validation_failed', issues: proposal.validation.issues, resumed: false, artifact_path: relativeArtifact(artifactRoot, paths.proposal), proposal }
        if (proposal.validation.valid && !options.dryRun) {
          atomicWriteJSON(paths.proposal, proposal, artifactRoot)
          atomicWriteJSON(paths.checkpoint, checkpointFor(proposal, relativeArtifact(paths.batch, paths.proposal)), artifactRoot)
        }
      }
    }
    results.push(result)
    if (options.failFast && result.status === 'validation_failed') break
  }
  const summary = makeSummary(batchId, results)
  if (!options.dryRun) {
    const paths = artifactPaths(artifactRoot, batchId, 'batch-state')
    atomicWriteJSON(paths.batchState, batchStateFor(batchId, results), artifactRoot)
  }
  return summary
}

function checkpointFor(proposal, proposalPath) {
  return {
    schema_version: SCHEMA_VERSION,
    pipeline_version: PIPELINE_VERSION,
    batch_id: proposal.batch_id,
    source_key: proposal.source_key,
    source_hash: proposal.source_hash,
    stage: 'prepared',
    proposal_path: proposalPath,
    normalized_content_hash: proposal.normalized_content_hash,
    proposal_artifact_hash: proposalArtifactHash(proposal)
  }
}

function readCheckpoint(paths, sourceHash) {
  if (!fs.existsSync(paths.checkpoint) || !fs.existsSync(paths.proposal)) return null
  try {
    const checkpoint = readJSONFile(paths.checkpoint, MAX_MANIFEST_BYTES, paths.batch)
    const proposal = readJSONFile(paths.proposal, 2 * 1024 * 1024, paths.batch)
    if (!validateContract('checkpoint', checkpoint).valid || !validateContract('proposal', proposal).valid) return null
    if (checkpoint.schema_version !== SCHEMA_VERSION || checkpoint.pipeline_version !== PIPELINE_VERSION) return null
    if (checkpoint.source_hash !== sourceHash || proposal.source_hash !== sourceHash) return null
    if (checkpoint.normalized_content_hash !== proposal.normalized_content_hash) return null
    if (canonicalHash(hashInputFromProposal(proposal)).hash !== proposal.normalized_content_hash) return null
    if (checkpoint.proposal_artifact_hash !== proposalArtifactHash(proposal)) return null
    return checkpoint
  } catch {
    return null
  }
}

function validatePrepared(artifactRoot, batchId, vocabularies, options) {
  const proposalRoot = containedPath(artifactRoot, batchId, 'proposals')
  if (!fs.existsSync(proposalRoot)) return makeSummary(batchId, [])
  const proposalRootStat = fs.lstatSync(proposalRoot)
  if (proposalRootStat.isSymbolicLink() || !proposalRootStat.isDirectory()) throw new Error('Proposal artifact directory must be a real directory')
  assertRealPathContained(artifactRoot, proposalRoot)
  const results = []
  const candidates = []
  for (const name of fs.readdirSync(proposalRoot).filter((entry) => entry.endsWith('.json')).sort()) {
    const proposalPath = containedPath(proposalRoot, name)
    try {
      const proposal = readJSONFile(proposalPath, 2 * 1024 * 1024, artifactRoot)
      const report = validateProposal(proposal, vocabularies)
      if (proposal.schema_version !== SCHEMA_VERSION) report.issues.push(issue('$.schema_version', 'SCHEMA_VERSION_MISMATCH', `Expected schema version ${SCHEMA_VERSION}.`, 'domain'))
      if (proposal.pipeline_version !== PIPELINE_VERSION) report.issues.push(issue('$.pipeline_version', 'PIPELINE_VERSION_MISMATCH', `Expected pipeline version ${PIPELINE_VERSION}.`, 'domain'))
      if (proposal.proposal_id !== `${batchId}/${proposal.source_key}`) report.issues.push(issue('$.proposal_id', 'PROPOSAL_ID_MISMATCH', 'proposal_id does not match batch_id/source_key.', 'domain'))
      if (canonicalHash(hashInputFromProposal(proposal)).hash !== proposal.normalized_content_hash) report.issues.push(issue('$.normalized_content_hash', 'NORMALIZED_HASH_MISMATCH', 'Proposal content does not match normalized_content_hash.', 'domain'))
      if (report.issues.length === 0) {
        try {
          buildIngestionRequest(proposal, vocabularies)
        } catch (error) {
          if (error instanceof IngestionRequestValidationError) report.issues.push(...error.issues)
          else throw error
        }
      }
      report.findings = []
      report.valid = !report.issues.some(isBlockingIssue)
      const identity = `${proposal.proposal_id}@${name}`
      const result = { identity, source_key: proposal.source_key, status: report.valid ? 'validated' : 'validation_failed', issues: report.issues, findings: report.findings, report, artifact_path: relativeArtifact(artifactRoot, proposalPath), proposal, name }
      results.push(result)
      if (report.valid) candidates.push({
        identity,
        proposal_id: proposal.proposal_id,
        source_key: proposal.source_key,
        source_hash: proposal.source_hash,
        normalized_content_hash: proposal.normalized_content_hash,
        colors: proposal.colors.map((color) => color.hex)
      })
    } catch (error) {
      results.push({ source_key: path.basename(name, '.json'), status: 'validation_failed', issues: [issue('$', 'PROPOSAL_READ_FAILED', error.message)], findings: [], name })
    }
    if (options.failFast && results.at(-1).status === 'validation_failed') break
  }

  const duplicateResult = detectExactDuplicates(candidates, options.catalogSnapshot ?? EMPTY_CATALOG_SNAPSHOT)
  if (!duplicateResult.valid) {
    const detail = duplicateResult.issues.map((entry) => `${entry.path}: ${entry.message}`).join('; ')
    throw new Error(`Exact duplicate comparison input is invalid: ${detail}`)
  }
  const duplicateIndex = {
    schema_version: SCHEMA_VERSION,
    fingerprint_version: 1,
    issue_policy_version: ISSUE_POLICY_VERSION,
    context_hash: duplicateResult.contextHash,
    findings: [...duplicateResult.findingsByProposal.values()].flat()
  }
  const duplicateIndexContract = validateContract('exactDuplicateIndex', duplicateIndex)
  if (!duplicateIndexContract.valid) throw new Error(`Generated exact duplicate index violates its contract: ${duplicateIndexContract.issues.map((entry) => entry.path).join(', ')}`)
  const duplicateIndexHash = canonicalHash(duplicateIndex).hash
  const duplicateIndexPath = artifactPaths(artifactRoot, batchId, 'batch-state').duplicateIndex
  let duplicateIndexResumed = false
  if (options.resume && fs.existsSync(duplicateIndexPath)) {
    try {
      const storedIndex = readJSONFile(duplicateIndexPath, 2 * 1024 * 1024, artifactRoot)
      duplicateIndexResumed = validateContract('exactDuplicateIndex', storedIndex).valid && canonicalHash(storedIndex).hash === duplicateIndexHash
    } catch {
      duplicateIndexResumed = false
    }
  }
  if (!options.dryRun && !duplicateIndexResumed) atomicWriteJSON(duplicateIndexPath, duplicateIndex, artifactRoot)
  const perceptualResult = detectPerceptualSimilarities(candidates, options.catalogSnapshot ?? EMPTY_CATALOG_SNAPSHOT)
  if (!perceptualResult.valid) {
    const detail = perceptualResult.issues.map((entry) => `${entry.path}: ${entry.message}`).join('; ')
    throw new Error(`Perceptual similarity comparison input is invalid: ${detail}`)
  }
  const similarityIndex = {
    schema_version: SCHEMA_VERSION,
    perceptual_policy_version: PERCEPTUAL_POLICY_VERSION,
    color_conversion_version: COLOR_CONVERSION_VERSION,
    issue_policy_version: ISSUE_POLICY_VERSION,
    context_hash: perceptualResult.contextHash,
    findings: [...perceptualResult.findingsByProposal.values()].flat()
  }
  const similarityIndexContract = validateContract('perceptualSimilarityIndex', similarityIndex)
  if (!similarityIndexContract.valid) throw new Error(`Generated perceptual similarity index violates its contract: ${similarityIndexContract.issues.map((entry) => entry.path).join(', ')}`)
  const similarityIndexHash = canonicalHash(similarityIndex).hash
  const similarityIndexPath = artifactPaths(artifactRoot, batchId, 'batch-state').similarityIndex
  let similarityIndexResumed = false
  if (options.resume && fs.existsSync(similarityIndexPath)) {
    try {
      const storedIndex = readJSONFile(similarityIndexPath, 2 * 1024 * 1024, artifactRoot)
      similarityIndexResumed = validateContract('perceptualSimilarityIndex', storedIndex).valid && canonicalHash(storedIndex).hash === similarityIndexHash
    } catch {
      similarityIndexResumed = false
    }
  }
  if (!options.dryRun && !similarityIndexResumed) atomicWriteJSON(similarityIndexPath, similarityIndex, artifactRoot)
  for (const result of results) {
    if (!result.report) continue
    const exactFindings = duplicateResult.findingsByProposal.get(result.identity) ?? []
    const perceptualFindings = perceptualResult.findingsByProposal.get(result.identity) ?? []
    result.report.findings = [...exactFindings, ...perceptualFindings]
    result.report.issues.push(...issuesForFindings(exactFindings), ...issuesForPerceptualFindings(perceptualFindings))
    result.report.valid = !result.report.issues.some(isBlockingIssue)
    result.findings = result.report.findings
    result.issues = result.report.issues
    result.status = result.report.valid ? 'validated' : 'validation_failed'
    const contract = validateContract('validationReport', result.report)
    if (!contract.valid) throw new Error(`Generated validation report violates its contract: ${contract.issues.map((entry) => entry.path).join(', ')}`)
    const validationPath = containedPath(artifactRoot, batchId, 'validation', result.name)
    const checkpointPath = containedPath(artifactRoot, batchId, 'checkpoints', result.name)
    const validatedCheckpoint = validatedCheckpointFor(
      result.proposal,
      relativeArtifact(containedPath(artifactRoot, batchId), containedPath(artifactRoot, batchId, 'proposals', result.name)),
      relativeArtifact(containedPath(artifactRoot, batchId), validationPath),
      result.report,
      duplicateResult.contextHash,
      duplicateIndexHash,
      perceptualResult.contextHash,
      similarityIndexHash
    )
    result.resumed = options.resume && duplicateIndexResumed && similarityIndexResumed && canResumeValidation(checkpointPath, validationPath, result.proposal, result.report, duplicateResult.contextHash, duplicateIndexHash, perceptualResult.contextHash, similarityIndexHash, artifactRoot)
    if (!options.dryRun && !result.resumed) {
      atomicWriteJSON(validationPath, result.report, artifactRoot)
      atomicWriteJSON(checkpointPath, validatedCheckpoint, artifactRoot)
    }
  }
  const reportingCandidates = results.filter((result) => result.proposal && result.report).map((result) => ({ identity: result.identity, proposal: result.proposal, report: result.report }))
  const normalizedCatalogSnapshot = normalizeCatalogSnapshotForReporting(options.catalogSnapshot ?? EMPTY_CATALOG_SNAPSHOT)
  const validationReportsHash = canonicalHash(reportingCandidates.map(({ identity, report }) => ({ identity, report })).sort((left, right) => compareCodeUnits(left.identity, right.identity))).hash
  const summaryMarkdown = renderValidationSummary({
    batchId,
    pipelineVersion: PIPELINE_VERSION,
    schemaVersion: SCHEMA_VERSION,
    catalogSnapshot: normalizedCatalogSnapshot,
    exactIndex: duplicateIndex,
    similarityIndex,
    candidates: reportingCandidates,
    hashes: {
      catalogSnapshot: canonicalHash(normalizedCatalogSnapshot).hash,
      exactIndex: duplicateIndexHash,
      similarityIndex: similarityIndexHash,
      validationReports: validationReportsHash
    }
  })
  const summaryHash = validationSummaryHash(summaryMarkdown)
  const summaryPath = artifactPaths(artifactRoot, batchId, 'batch-state').validationSummary
  const reportResumed = options.resume && canResumeSummary(summaryPath, summaryHash, results, artifactRoot)
  if (!options.dryRun && !reportResumed) atomicWriteText(summaryPath, summaryMarkdown, artifactRoot)
  for (const result of results) {
    if (!result.proposal || !result.report) continue
    result.resumed = Boolean(result.resumed && reportResumed)
    const checkpointPath = containedPath(artifactRoot, batchId, 'checkpoints', result.name)
    if (!options.dryRun && !result.resumed) {
      const checkpoint = validatedCheckpointFor(
        result.proposal,
        relativeArtifact(containedPath(artifactRoot, batchId), containedPath(artifactRoot, batchId, 'proposals', result.name)),
        relativeArtifact(containedPath(artifactRoot, batchId), containedPath(artifactRoot, batchId, 'validation', result.name)),
        result.report, duplicateResult.contextHash, duplicateIndexHash, perceptualResult.contextHash, similarityIndexHash
      )
      checkpoint.stage = 'reported'
      checkpoint.report_path = VALIDATION_SUMMARY_PATH
      checkpoint.report_hash = summaryHash
      atomicWriteJSON(checkpointPath, checkpoint, artifactRoot)
    }
  }
  const summary = makeSummary(batchId, results)
  summary.report_path = VALIDATION_SUMMARY_PATH
  summary.report_hash = summaryHash
  if (!options.dryRun) {
    const paths = artifactPaths(artifactRoot, batchId, 'batch-state')
    atomicWriteJSON(paths.batchState, batchStateFor(batchId, results, summaryHash), artifactRoot)
  }
  return summary
}

function canResumeSummary(summaryPath, expectedHash, results, artifactRoot) {
  if (!fs.existsSync(summaryPath)) return false
  try {
    const stat = fs.lstatSync(summaryPath)
    if (stat.isSymbolicLink() || !stat.isFile()) return false
    assertRealPathContained(artifactRoot, summaryPath)
    if (validationSummaryHash(fs.readFileSync(summaryPath, 'utf8')) !== expectedHash) return false
    return results.filter((result) => result.proposal && result.report).every((result) => {
      const checkpointPath = containedPath(artifactRoot, result.proposal.batch_id, 'checkpoints', result.name)
      if (!fs.existsSync(checkpointPath)) return false
      const checkpoint = readJSONFile(checkpointPath, MAX_MANIFEST_BYTES, artifactRoot)
      return validateContract('checkpoint', checkpoint).valid && checkpoint.stage === 'reported' && checkpoint.report_path === VALIDATION_SUMMARY_PATH && checkpoint.report_hash === expectedHash
    })
  } catch { return false }
}

function normalizeCatalogSnapshotForReporting(snapshot) {
  return { ...structuredClone(snapshot), records: [...snapshot.records].sort((left, right) => compareCodeUnits(left.record_id, right.record_id)) }
}

function compareCodeUnits(left, right) { return left < right ? -1 : left > right ? 1 : 0 }

function validatedCheckpointFor(proposal, proposalPath, validationPath, report, validationContextHash, duplicateIndexHash, perceptualContextHash, similarityIndexHash) {
  return {
    schema_version: SCHEMA_VERSION,
    pipeline_version: PIPELINE_VERSION,
    batch_id: proposal.batch_id,
    source_key: proposal.source_key,
    source_hash: proposal.source_hash,
    stage: 'validated',
    proposal_path: proposalPath,
    normalized_content_hash: proposal.normalized_content_hash,
    proposal_artifact_hash: proposalArtifactHash(proposal),
    validation_path: validationPath,
    validation_report_hash: canonicalHash(report).hash,
    validation_context_hash: validationContextHash,
    duplicate_index_hash: duplicateIndexHash,
    perceptual_context_hash: perceptualContextHash,
    similarity_index_hash: similarityIndexHash
  }
}

function canResumeValidation(checkpointPath, validationPath, proposal, report, validationContextHash, duplicateIndexHash, perceptualContextHash, similarityIndexHash, artifactRoot) {
  if (!fs.existsSync(checkpointPath) || !fs.existsSync(validationPath)) return false
  try {
    const checkpoint = readJSONFile(checkpointPath, MAX_MANIFEST_BYTES, artifactRoot)
    const storedReport = readJSONFile(validationPath, 2 * 1024 * 1024, artifactRoot)
    if (!validateContract('checkpoint', checkpoint).valid || !validateContract('validationReport', storedReport).valid) return false
    return (checkpoint.stage === 'validated' || checkpoint.stage === 'reported') &&
      checkpoint.proposal_artifact_hash === proposalArtifactHash(proposal) &&
      checkpoint.normalized_content_hash === proposal.normalized_content_hash &&
      checkpoint.validation_context_hash === validationContextHash &&
      checkpoint.duplicate_index_hash === duplicateIndexHash &&
      checkpoint.perceptual_context_hash === perceptualContextHash &&
      checkpoint.similarity_index_hash === similarityIndexHash &&
      checkpoint.validation_report_hash === canonicalHash(storedReport).hash &&
      canonicalHash(storedReport).hash === canonicalHash(report).hash
  } catch {
    return false
  }
}

function readStatus(artifactRoot, batchId) {
  const paths = artifactPaths(artifactRoot, batchId, 'batch-state')
  if (!fs.existsSync(paths.batchState)) return makeSummary(batchId, [])
  const state = readJSONFile(paths.batchState, 2 * 1024 * 1024, artifactRoot)
  if (!validateContract('batchState', state).valid) throw new Error('Batch state does not match the v1 contract')
  return makeSummary(batchId, state.packages)
}

function batchStateFor(batchId, results, reportHash = null) {
  const state = { schema_version: SCHEMA_VERSION, pipeline_version: PIPELINE_VERSION, batch_id: batchId, packages: results.map(({ source_key, status, issues }) => ({ source_key, status, issues })) }
  if (reportHash) {
    state.report_path = VALIDATION_SUMMARY_PATH
    state.report_hash = reportHash
  }
  const validation = validateContract('batchState', state)
  if (!validation.valid) throw new Error(`Generated batch state violates its contract: ${validation.issues.map((entry) => entry.path).join(', ')}`)
  return state
}

function makeSummary(batchId, packages) {
  return {
    schema_version: SCHEMA_VERSION,
    pipeline_version: PIPELINE_VERSION,
    batch_id: batchId,
    counts: packages.reduce((counts, item) => ({ ...counts, [item.status]: (counts[item.status] ?? 0) + 1 }), {}),
    packages
  }
}

function relativeArtifact(root, filePath) {
  return path.relative(path.resolve(root), filePath).split(path.sep).join('/')
}
