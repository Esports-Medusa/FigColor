import { issue } from './files.mjs'
import { canonicalHash } from './jcs.mjs'
import { validateContract } from './schema-validation.mjs'
import { validatePreviewCaseAgainstRegistry } from '../generated/preview-registry-validation.mjs'

function validateVocabulary(values, allowed, at, issues) {
  if (!Array.isArray(values)) return
  const seen = new Set()
  values.forEach((value, index) => {
    if (!allowed.includes(value)) issues.push(issue(`${at}[${index}]`, 'INVALID_VOCABULARY_VALUE', `Unsupported value: ${String(value)}.`))
    if (seen.has(value)) issues.push(issue(`${at}[${index}]`, 'DUPLICATE_VALUE', `Duplicate value: ${String(value)}.`))
    seen.add(value)
  })
}

export function validateManifest(manifest, vocabularies) {
  const structural = validateContract('sourcePackage', manifest)
  const issues = [...structural.issues]
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) || !manifest.supplied_fields || typeof manifest.supplied_fields !== 'object' || Array.isArray(manifest.supplied_fields)) return { valid: false, issues }
  if (manifest.source_type !== 'manual_colors') issues.push(issue('$.source_type', 'SOURCE_TYPE_UNSUPPORTED_WP1', 'WP1 supports only manual_colors.'))

  const fields = manifest.supplied_fields
  if (Array.isArray(fields.colors)) {
    const seenHex = new Set()
    fields.colors.forEach((value, index) => {
      if (typeof value !== 'string' || !/^#?[0-9A-Fa-f]{6}$/.test(value)) {
        issues.push(issue(`$.supplied_fields.colors[${index}]`, 'INVALID_HEX', 'Color must be a 6-digit HEX value.'))
        return
      }
      const normalized = `#${value.replace(/^#/, '').toUpperCase()}`
      if (seenHex.has(normalized)) issues.push(issue(`$.supplied_fields.colors[${index}]`, 'DUPLICATE_COLOR_VALUE', `Duplicate color: ${normalized}.`))
      seenHex.add(normalized)
    })
  }
  if (!vocabularies.palette_types.includes(fields.type)) issues.push(issue('$.supplied_fields.type', 'INVALID_VOCABULARY_VALUE', `Unsupported palette type: ${String(fields.type)}.`))
  validateVocabulary(fields.disciplines, vocabularies.disciplines, '$.supplied_fields.disciplines', issues)
  validateVocabulary(fields.use_cases, vocabularies.use_cases, '$.supplied_fields.use_cases', issues)
  validateVocabulary(fields.avoid_cases, vocabularies.avoid_cases, '$.supplied_fields.avoid_cases', issues)
  validateVocabulary(fields.tags, vocabularies.tags, '$.supplied_fields.tags', issues)

  if (Array.isArray(fields.chart_applicability)) {
    const seenCharts = new Set()
    let bestFit = 0
    fields.chart_applicability.forEach((item, index) => {
      const at = `$.supplied_fields.chart_applicability[${index}]`
      if (!vocabularies.chart_types.includes(item?.chart_type)) issues.push(issue(`${at}.chart_type`, 'CHART_TYPE_UNSUPPORTED', `Unsupported chart type: ${String(item?.chart_type)}.`))
      if (seenCharts.has(item?.chart_type)) issues.push(issue(`${at}.chart_type`, 'DUPLICATE_CHART_TYPE', 'Chart type must be unique.'))
      seenCharts.add(item?.chart_type)
      if (!vocabularies.chart_suitabilities.includes(item?.suitability)) issues.push(issue(`${at}.suitability`, 'INVALID_VOCABULARY_VALUE', `Unsupported suitability: ${String(item?.suitability)}.`))
      if (item?.suitability === 'best_fit') bestFit += 1
      if (item?.source !== undefined && item.source !== 'curated') issues.push(issue(`${at}.source`, 'INVALID_APPLICABILITY_SOURCE', 'Applicability source must be curated.'))
    })
    if (bestFit > 1) issues.push(issue('$.supplied_fields.chart_applicability', 'MULTIPLE_BEST_FIT', 'Only one chart type may be best_fit.'))
  }

  if (Array.isArray(manifest.supplied_preview_cases)) manifest.supplied_preview_cases.forEach((preview, index) => validatePreview(preview, index, vocabularies, issues))
  return { valid: issues.length === 0, issues }
}

function validatePreview(preview, index, vocabularies, issues, root = '$.supplied_preview_cases', deferRegistryValidation = false) {
  const at = `${root}[${index}]`
  if (!vocabularies.chart_types.includes(preview?.chart_type)) issues.push(issue(`${at}.chart_type`, 'CHART_TYPE_UNSUPPORTED', `Unsupported chart type: ${String(preview?.chart_type)}.`))
  if (!deferRegistryValidation) {
    const expected = vocabularies.preview_templates[preview?.chart_type]
    if (expected && preview?.template_id !== expected) issues.push(issue(`${at}.template_id`, 'UNKNOWN_TEMPLATE_ID', `Expected template ${expected}.`))
    if (preview?.template_version !== 1) issues.push(issue(`${at}.template_version`, 'UNSUPPORTED_TEMPLATE_VERSION', 'WP1 supports template_version 1.'))
    if (preview?.schema_version !== 1) issues.push(issue(`${at}.schema_version`, 'UNSUPPORTED_SCHEMA_VERSION', 'WP1 supports schema_version 1.'))
  }
  if (!preview?.color_roles || typeof preview.color_roles !== 'object' || Array.isArray(preview.color_roles)) issues.push(issue(`${at}.color_roles`, 'INVALID_COLOR_ROLES_SHAPE', 'color_roles must be an object.'))
  if (!preview?.preview_config || typeof preview.preview_config !== 'object' || Array.isArray(preview.preview_config)) issues.push(issue(`${at}.preview_config`, 'INVALID_PREVIEW_CONFIG_SHAPE', 'preview_config must be an object.'))
  if (!['stable_id', 'fixed'].includes(preview?.seed_strategy)) issues.push(issue(`${at}.seed_strategy`, 'INVALID_SEED_STRATEGY', 'seed_strategy must be stable_id or fixed.'))
  if (preview?.seed_strategy === 'fixed' && !Number.isInteger(preview.seed_value)) issues.push(issue(`${at}.seed_value`, 'FIXED_SEED_VALUE_REQUIRED', 'Fixed seed strategy requires an integer seed_value.'))
}

export function validateProposal(proposal, vocabularies) {
  const structural = validateContract('proposal', proposal)
  const issues = [...structural.issues]
  if (!structural.valid) return { valid: false, issues }
  const ids = new Set()
  proposal.colors?.forEach((color, index) => {
    if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(color.provisional_id ?? '')) issues.push(issue(`$.colors[${index}].provisional_id`, 'INVALID_COLOR_ID', 'Color identity is invalid.', 'domain'))
    if (ids.has(color.provisional_id)) issues.push(issue(`$.colors[${index}].provisional_id`, 'DUPLICATE_COLOR_ID', 'Color identity must be unique.', 'domain'))
    ids.add(color.provisional_id)
    if (!/^#[0-9A-F]{6}$/.test(color.hex ?? '')) issues.push(issue(`$.colors[${index}].hex`, 'INVALID_HEX', 'Proposal HEX must be canonical uppercase.', 'domain'))
    if (color.order !== index) issues.push(issue(`$.colors[${index}].order`, 'INVALID_COLOR_ORDER', 'Color order must be contiguous and match array order.', 'domain'))
  })
  validatePaletteValues({
    type: proposal.palette.type.value,
    disciplines: proposal.palette.disciplines.value,
    use_cases: proposal.palette.use_cases.value,
    avoid_cases: proposal.palette.avoid_cases.value,
    tags: proposal.palette.tags.value,
    chart_applicability: proposal.palette.chart_applicability.value
  }, '$.palette', vocabularies, issues)
  proposal.preview_case_suggestions.forEach((preview, index) => validatePreview(preview, index, vocabularies, issues, '$.preview_case_suggestions'))
  return { valid: issues.length === 0, issues }
}

export function validateIngestionRequest(request, vocabularies) {
  const structural = validateContract('ingestionRequest', request)
  const issues = [...structural.issues]
  if (!structural.valid) return { valid: false, issues }

  const ids = new Set()
  request.palette.colors.forEach((color, index) => {
    if (ids.has(color.id)) issues.push(issue(`$.palette.colors[${index}].id`, 'DUPLICATE_COLOR_ID', 'Color identity must be unique.', 'domain'))
    ids.add(color.id)
    if (color.order !== index) issues.push(issue(`$.palette.colors[${index}].order`, 'INVALID_COLOR_ORDER', 'Color order must be contiguous and match array order.', 'domain'))
    if (color.rgb.some((channel, channelIndex) => channel !== hexToRGB(color.hex)[channelIndex])) issues.push(issue(`$.palette.colors[${index}].rgb`, 'RGB_HEX_MISMATCH', 'RGB must be derived from HEX.', 'domain'))
  })
  if (request.palette.color_count !== request.palette.colors.length) issues.push(issue('$.palette.color_count', 'COLOR_COUNT_MISMATCH', 'color_count must equal colors.length.', 'domain'))
  validatePaletteValues(request.palette, '$.palette', vocabularies, issues)
  request.preview_cases.forEach((preview, index) => validatePreview(preview, index, vocabularies, issues, '$.preview_cases', true))
  request.preview_cases.forEach((preview, index) => {
    const result = validatePreviewCaseAgainstRegistry(preview)
    for (const registryEntry of result.issues) {
      issues.push(issue(
        previewIssuePath(index, registryEntry.path),
        registryEntry.code,
        registryEntry.message,
        'domain'
      ))
    }
  })
  validatePreviewColorReferences(request.preview_cases, ids, issues)
  if (issues.length === 0 && canonicalHash(canonicalContentFromRequest(request)).hash !== request.ingestion_metadata.normalized_content_hash) {
    issues.push(issue('$.ingestion_metadata.normalized_content_hash', 'NORMALIZED_HASH_MISMATCH', 'Canonical request content does not match normalized_content_hash.', 'normalization'))
  }
  return { valid: issues.length === 0, issues }
}

function previewIssuePath(index, registryPath) {
  const suffix = registryPath ? `.${registryPath}` : ''
  return `$.preview_cases[${index}]${suffix}`
}

export function canonicalContentFromRequest(request) {
  const { colors, color_count: _colorCount, ...palette } = request.palette
  return {
    schema_version: request.ingestion_metadata.schema_version,
    colors: colors.map(({ id, hex, order }) => ({ provisional_id: id, hex, order })),
    palette,
    preview_cases: request.preview_cases
  }
}

function validatePaletteValues(palette, at, vocabularies, issues) {
  if (!vocabularies.palette_types.includes(palette.type)) issues.push(issue(`${at}.type`, 'INVALID_VOCABULARY_VALUE', `Unsupported palette type: ${String(palette.type)}.`, 'domain'))
  validateVocabulary(palette.disciplines, vocabularies.disciplines, `${at}.disciplines`, issues)
  validateVocabulary(palette.use_cases, vocabularies.use_cases, `${at}.use_cases`, issues)
  validateVocabulary(palette.avoid_cases, vocabularies.avoid_cases, `${at}.avoid_cases`, issues)
  validateVocabulary(palette.tags, vocabularies.tags, `${at}.tags`, issues)
  const seenCharts = new Set()
  let bestFit = 0
  palette.chart_applicability.forEach((item, index) => {
    const itemAt = `${at}.chart_applicability[${index}]`
    if (!vocabularies.chart_types.includes(item.chart_type)) issues.push(issue(`${itemAt}.chart_type`, 'CHART_TYPE_UNSUPPORTED', `Unsupported chart type: ${String(item.chart_type)}.`, 'domain'))
    if (seenCharts.has(item.chart_type)) issues.push(issue(`${itemAt}.chart_type`, 'DUPLICATE_CHART_TYPE', 'Chart type must be unique.', 'domain'))
    seenCharts.add(item.chart_type)
    if (!vocabularies.chart_suitabilities.includes(item.suitability)) issues.push(issue(`${itemAt}.suitability`, 'INVALID_VOCABULARY_VALUE', `Unsupported suitability: ${String(item.suitability)}.`, 'domain'))
    if (item.suitability === 'best_fit') bestFit += 1
    if (item.source !== 'curated') issues.push(issue(`${itemAt}.source`, 'INVALID_APPLICABILITY_SOURCE', 'Applicability source must be curated.', 'domain'))
  })
  if (bestFit > 1) issues.push(issue(`${at}.chart_applicability`, 'MULTIPLE_BEST_FIT', 'Only one chart type may be best_fit.', 'domain'))
}

function validatePreviewColorReferences(previews, colorIds, issues) {
  previews.forEach((preview, previewIndex) => walk(preview.color_roles, `$.preview_cases[${previewIndex}].color_roles`))
  function walk(value, at) {
    if (Array.isArray(value)) return value.forEach((entry, index) => walk(entry, `${at}[${index}]`))
    if (!value || typeof value !== 'object') return
    if (value.source === 'palette') {
      if (typeof value.color_id !== 'string' || value.color_id === '') issues.push(issue(`${at}.color_id`, 'COLOR_ID_REQUIRED', 'Palette color references require color_id.', 'domain'))
      else if (!colorIds.has(value.color_id)) issues.push(issue(`${at}.color_id`, 'COLOR_NOT_FOUND', `Unknown palette color: ${value.color_id}.`, 'domain'))
      if ('hex' in value) issues.push(issue(`${at}.hex`, 'RAW_HEX_ROLE_FORBIDDEN', 'Preview roles must reference color IDs, not raw HEX.', 'domain'))
    }
    Object.entries(value).forEach(([key, child]) => walk(child, `${at}.${key}`))
  }
}

function hexToRGB(hex) {
  return [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16))
}
