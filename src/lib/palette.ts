import type {
  CanonicalPalette,
  ChartTypeApplicability,
  LegacyPreviewFields,
  Palette,
  PaletteColor,
  PalettePreviewCase,
  PaletteFilters,
  PaletteStatus,
  PaletteType,
  RawPaletteColorDTO,
  RawPaletteDTO,
  RawPalettePreviewCase,
  ValidationIssue
} from '@/types/palette'
import { toLegacyPaletteCompatibility } from '@/types/palette'
import { chartFilterMatchesPalette, validateChartApplicability } from '@/lib/palette/applicability'
import { API_BASE } from '@/api/baseUrl'

// Only the complete, unfiltered public catalog belongs in this cache.
// Browse page results are returned to the calling view and never stored here.
let allPalettesCache: Palette[] | null = null
let allPalettesLoaded = false
const paletteDetailCacheBySlug = new Map<string, Palette>()
let lastPalettesLoadError: string | null = null

export type NormalizedPalette = Palette

export interface PalettePageRequest {
  page?: number
  pageSize?: number
  search?: string
  journalStyle?: string
  chartType?: string
  colorCount?: number | ''
  useCase?: string
  discipline?: string
  tag?: string
}

export interface PalettePageResult {
  palettes: Palette[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  error: string | null
}

export interface PaletteNormalizationValidationResult {
  valid: boolean
  issues: ValidationIssue[]
}

export function normalizePalette(raw: RawPaletteDTO): Palette {
  const palette = toLegacyPaletteCompatibility(normalizePaletteToCanonical(raw))
  const legacyPreview = collectLegacyPreviewFields(raw)
  return legacyPreview
    ? {
        ...palette,
        legacy_preview: legacyPreview,
        chart_family: legacyPreview.chart_family,
        exported_core_colors: legacyPreview.exported_core_colors,
        preview_template: legacyPreview.preview_template,
        copy_blocks: legacyPreview.copy_blocks,
        functional_roles: legacyPreview.functional_roles
      }
    : palette
}

export function normalizePaletteToCanonical(raw: RawPaletteDTO): CanonicalPalette {
  const validationIssues = [
    ...validateRawPaletteApplicability(raw),
    ...validateRawPalettePreviewCases(raw)
  ]
  if (validationIssues.length > 0) {
    throw new PaletteNormalizationError(validationIssues)
  }

  const colors = normalizeColors(raw.colors)
  const chartTypes = normalizeStringArray(raw.chart_types ?? raw.chart_type)
  const chartApplicability = normalizeChartApplicability(raw.chart_applicability)
  const previewCases = normalizePreviewCases(raw.preview_cases)
  const primaryPreviewCase = normalizePrimaryPreviewCase(raw.primary_preview_case, raw.id)

  return {
    id: raw.id ?? '',
    slug: raw.slug ?? '',
    name: raw.name ?? '',
    description: raw.description,
    owner_user_id: raw.owner_user_id,
    visibility: normalizeVisibility(raw.visibility),
    origin: normalizeOrigin(raw.origin),
    source_palette_id: raw.source_palette_id,
    status: normalizeStatus(raw.status),
    colors,
    color_count: colors.length,
    type: normalizePaletteType(raw.type),
    chart_types: chartTypes,
    chart_applicability: chartApplicability,
    journal_style: normalizeStringArray(raw.journal_style),
    disciplines: normalizeStringArray(raw.disciplines ?? raw.discipline),
    use_cases: normalizeStringArray(raw.use_cases ?? raw.use_case),
    avoid_cases: normalizeStringArray(raw.avoid_cases ?? raw.avoid_case),
    tags: normalizeStringArray(raw.tags),
    accessibility: raw.accessibility,
    source_type: normalizeSourceType(raw.source_type),
    source_image: raw.source_image,
    source_note: raw.source_note,
    version: raw.version,
    created_by: raw.created_by,
    created_at: raw.created_at ?? '',
    updated_at: raw.updated_at ?? '',
    published_at: raw.published_at,
    archived_at: raw.archived_at,
    primary_preview_case: primaryPreviewCase,
    preview_cases: previewCases
  }
}

export function normalizeColors(input: unknown): PaletteColor[] {
  const rawColors = parseRawColors(input)

  return rawColors.map((rawColor, index) => {
    const record = typeof rawColor === 'string' ? { hex: rawColor } : rawColor
    const hex = normalizeHex(record.hex)
    const order = typeof record.order === 'number' ? record.order : index
    const persistedId = record.id ?? record.color_id

    return {
      id: persistedId && persistedId.trim() ? persistedId : createLegacyColorId(index),
      hex,
      rgb: hexToRgb(hex),
      label: record.label,
      order
    }
  })
}

export function validatePaletteNormalizationInput(raw: RawPaletteDTO): PaletteNormalizationValidationResult {
  const issues: ValidationIssue[] = [
    ...validateRawPaletteColors(raw.colors),
    ...validateRawPaletteApplicability(raw),
    ...validateRawPalettePreviewCases(raw)
  ]

  if (raw.color_count !== undefined) {
    const actualColorCount = parseRawColors(raw.colors).length
    if (raw.color_count !== actualColorCount) {
      issues.push({
        path: 'color_count',
        code: 'COLOR_COUNT_MISMATCH',
        message: `color_count (${raw.color_count}) does not match colors.length (${actualColorCount}).`
      })
    }
  }

  return {
    valid: issues.length === 0,
    issues
  }
}

export class PaletteNormalizationError extends Error {
  issues: ValidationIssue[]

  constructor(issues: ValidationIssue[]) {
    super('palette normalization failed')
    this.name = 'PaletteNormalizationError'
    this.issues = issues
  }
}

export function validateRawPaletteColors(input: unknown, path = 'colors'): ValidationIssue[] {
  return parseRawColors(input).flatMap((rawColor, index) => {
    const record = typeof rawColor === 'string' ? { hex: rawColor } : rawColor
    const result = parseHex(record.hex)

    return result.ok
      ? []
      : [{
          path: `${path}[${index}].hex`,
          code: 'INVALID_HEX',
          message: result.message
        }]
  })
}

export function createLegacyColorId(index: number): string {
  return `legacy-color-${index + 1}`
}

export function normalizeHex(value: unknown): string {
  // Compatibility fallback for existing UI color consumers. Call
  // validateRawPaletteColors() or validatePaletteNormalizationInput() when an
  // invalid HEX must be distinguished from a real #000000.
  const result = parseHex(value)
  return result.ok ? result.hex : '#000000'
}

export function parseHex(value: unknown): { ok: true; hex: string } | { ok: false; message: string } {
  const input = typeof value === 'string' ? value.trim() : ''
  if (!input) {
    return { ok: false, message: 'HEX color is required.' }
  }

  const withHash = input.startsWith('#') ? input : `#${input}`
  const normalized = withHash.toUpperCase()
  return /^#[0-9A-F]{6}$/.test(normalized)
    ? { ok: true, hex: normalized }
    : { ok: false, message: `Invalid HEX color: ${input}.` }
}

export function hexToRgb(hex: string): [number, number, number] {
  const normalized = normalizeHex(hex).slice(1)
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16)
  ]
}

export function getLegacyChartType(palette: Pick<CanonicalPalette, 'chart_types'>): string[] {
  return [...palette.chart_types]
}

async function fetchPalettesFromAPI(request: PalettePageRequest = {}): Promise<PalettePageResult> {
  try {
    const page = normalizePositivePaginationInteger(request.page, 1)
    const pageSize = normalizePositivePaginationInteger(request.pageSize, 20)
    const query = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize)
    })

    appendQueryParam(query, 'search', request.search)
    appendQueryParam(query, 'journal_style', request.journalStyle)
    appendQueryParam(query, 'chart_type', request.chartType)
    appendQueryParam(query, 'use_case', request.useCase)
    appendQueryParam(query, 'discipline', request.discipline)
    appendQueryParam(query, 'tag', request.tag)
    if (request.colorCount !== '' && request.colorCount !== undefined) {
      query.set('color_count', String(request.colorCount))
    }

    const response = await fetch(`${API_BASE}/palettes?${query.toString()}`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()
    let rawPalettes: RawPaletteDTO[] = []
    if (Array.isArray(data)) {
      rawPalettes = data
    } else if (Array.isArray(data.palettes)) {
      rawPalettes = data.palettes
    } else if (Array.isArray(data.items)) {
      rawPalettes = data.items
    }

    const publicRawPalettes = rawPalettes.filter(isPublicCatalogPalettePayload)
    const filteredOutCount = rawPalettes.length - publicRawPalettes.length
    const normalized = publicRawPalettes.map(normalizePalette)
    const resolvedPage = normalizePositivePaginationInteger(isRecord(data) ? data.page : undefined, page)
    const resolvedPageSize = normalizePositivePaginationInteger(isRecord(data) ? data.page_size : undefined, pageSize)
    const rawTotal = normalizeNonNegativePaginationInteger(isRecord(data) ? data.total : undefined, rawPalettes.length)
    const total = Math.max(0, rawTotal - filteredOutCount)
    const totalPages = normalizePositivePaginationInteger(
      isRecord(data) ? data.total_pages : undefined,
      Math.max(1, Math.ceil(total / resolvedPageSize))
    )

    return {
      palettes: normalized,
      total,
      page: resolvedPage,
      pageSize: resolvedPageSize,
      totalPages,
      error: null
    }
  } catch (error) {
    console.error('[Browse] failed to fetch palettes from API:', error)
    return {
      palettes: [],
      total: 0,
      page: normalizePositivePaginationInteger(request.page, 1),
      pageSize: normalizePositivePaginationInteger(request.pageSize, 20),
      totalPages: 1,
      error: paletteLoadErrorMessage(error)
    }
  }
}

export async function loadPalettePage(request: PalettePageRequest = {}): Promise<PalettePageResult> {
  return fetchPalettesFromAPI(request)
}

export async function loadPalettes(): Promise<Palette[]> {
  if (!allPalettesLoaded) {
    const pageSize = 50
    const firstPage = await fetchPalettesFromAPI({ page: 1, pageSize })
    if (firstPage.error) {
      allPalettesCache = []
      allPalettesLoaded = true
      lastPalettesLoadError = firstPage.error
      return []
    }
    const allPalettes = [...firstPage.palettes]
    for (let page = 2; page <= firstPage.totalPages; page += 1) {
      const nextPage = await fetchPalettesFromAPI({ page, pageSize })
      if (nextPage.error) {
        allPalettesCache = []
        allPalettesLoaded = true
        lastPalettesLoadError = nextPage.error
        return []
      }
      allPalettes.push(...nextPage.palettes)
    }
    allPalettesCache = allPalettes
    allPalettesLoaded = true
    allPalettes.forEach((palette) => paletteDetailCacheBySlug.set(palette.slug, palette))
    lastPalettesLoadError = null
  }
  return allPalettesCache || []
}

export function getAllPalettes(): Palette[] {
  if (!allPalettesLoaded) {
    console.warn('[Browse] getAllPalettes called before loadPalettes - this may return empty array')
    return []
  }
  return allPalettesCache as Palette[]
}

export async function reloadPalettes(): Promise<Palette[]> {
  allPalettesLoaded = false
  allPalettesCache = null
  lastPalettesLoadError = null
  return loadPalettes()
}

export function getPalettesLoadError(): string | null {
  return lastPalettesLoadError
}

export function getPaletteBySlug(slug: string): Palette | undefined {
  return paletteDetailCacheBySlug.get(slug) ??
    allPalettesCache?.find((palette) => palette.slug === slug)
}

export async function loadPaletteBySlug(slug: string): Promise<Palette | null> {
  const response = await fetch(`${API_BASE}/palettes/${encodeURIComponent(slug)}`)
  if (!response.ok) {
    if (response.status === 404) {
      return null
    }
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  const raw = await response.json()
  const payload = normalizePublicPaletteDetailPayload(raw)
  if (!isPublicCatalogPalettePayload(payload)) {
    return null
  }
  const normalized = normalizePalette(payload)
  upsertPaletteCache(normalized)
  return normalized
}

export function filterPalettes(filters: PaletteFilters): Palette[] {
  const palettes = getAllPalettes()

  return palettes.filter((palette) => {
    if (filters.chart_type && filters.chart_type.length > 0) {
      const hasChartType = filters.chart_type.some((ct) => chartFilterMatchesPalette(palette, ct))
      if (!hasChartType) return false
    }
    if (filters.journal_style && filters.journal_style.length > 0) {
      const hasJournalStyle = filters.journal_style.some((js) => palette.journal_style.includes(js))
      if (!hasJournalStyle) return false
    }
    if (filters.color_count && filters.color_count.length > 0) {
      if (!filters.color_count.includes(palette.color_count)) return false
    }
    if (filters.use_case && filters.use_case.length > 0) {
      const hasUseCase = filters.use_case.some((uc) => palette.use_case.includes(uc))
      if (!hasUseCase) return false
    }
    if (filters.discipline && filters.discipline.length > 0) {
      const hasDiscipline = filters.discipline.some((d) => palette.discipline.includes(d))
      if (!hasDiscipline) return false
    }
    if (filters.tags && filters.tags.length > 0) {
      const hasAllTags = filters.tags.every((tag) => palette.tags.includes(tag))
      if (!hasAllTags) return false
    }
    return true
  })
}

export function normalizeText(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }
  return String(value).toLowerCase().trim()
}

export function paletteToSearchText(palette: Palette): string {
  const parts: string[] = [
    normalizeText(palette.name),
    normalizeText(palette.slug),
    ...palette.journal_style.map(normalizeText),
    ...palette.chart_type.map(normalizeText),
    ...palette.use_case.map(normalizeText),
    ...(palette.avoid_case || []).map(normalizeText),
    ...palette.discipline.map(normalizeText),
    ...palette.tags.map(normalizeText),
    ...palette.colors.map((color) => normalizeText(color.hex)),
    ...palette.colors.map((color) => `rgb(${color.rgb.join(', ')})`)
  ]
  return parts.join(' ')
}

export function matchesArrayField(values: string[], selected: string): boolean {
  if (!selected) {
    return true
  }
  return values.includes(selected)
}

function appendQueryParam(query: URLSearchParams, key: string, value: string | undefined): void {
  const trimmed = value?.trim()
  if (trimmed) {
    query.set(key, trimmed)
  }
}

function normalizePositivePaginationInteger(value: unknown, fallback: number): number {
  return normalizePaginationInteger(value, fallback, 1)
}

function normalizeNonNegativePaginationInteger(value: unknown, fallback: number): number {
  return normalizePaginationInteger(value, fallback, 0)
}

function normalizePaginationInteger(value: unknown, fallback: number, minimum: number): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(numeric) && numeric >= minimum ? numeric : fallback
}

function paletteLoadErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Failed to load palettes.'
}

function parseRawColors(input: unknown): RawPaletteColorDTO[] {
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  return Array.isArray(input) ? input as RawPaletteColorDTO[] : []
}

function normalizeStringArray(input: unknown): string[] {
  if (typeof input === 'string') {
    const trimmed = input.trim()
    return trimmed ? [trimmed] : []
  }

  return Array.isArray(input)
    ? input
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    : []
}

function normalizePublicPaletteDetailPayload(raw: unknown): RawPaletteDTO {
  if (!isRecord(raw)) {
    return {}
  }

  if (isRecord(raw.palette)) {
    return {
      ...raw.palette,
      chart_applicability: Array.isArray(raw.chart_applicability)
        ? raw.chart_applicability as ChartTypeApplicability[]
        : raw.palette.chart_applicability as ChartTypeApplicability[] | null | undefined,
      primary_preview_case: isRecord(raw.resolved_primary_preview)
        ? raw.resolved_primary_preview as unknown as RawPalettePreviewCase
        : raw.palette.primary_preview_case as RawPalettePreviewCase | null | undefined,
      preview_cases: Array.isArray(raw.preview_cases)
        ? raw.preview_cases as RawPalettePreviewCase[]
        : raw.palette.preview_cases as RawPalettePreviewCase[] | undefined
    }
  }

  return raw as RawPaletteDTO
}

function upsertPaletteCache(palette: Palette): void {
  paletteDetailCacheBySlug.set(palette.slug, palette)
  if (!allPalettesLoaded || !allPalettesCache) {
    return
  }

  const existingIndex = allPalettesCache.findIndex((cached) => cached.id === palette.id || cached.slug === palette.slug)
  if (existingIndex >= 0) {
    allPalettesCache = allPalettesCache.map((cached, index) => index === existingIndex ? palette : cached)
  } else {
    allPalettesCache = [...allPalettesCache, palette]
  }
}

function normalizeStatus(input: unknown): PaletteStatus {
  return input === 'candidate' || input === 'published' || input === 'archived'
    ? input
    : 'draft'
}

function normalizeVisibility(input: unknown): CanonicalPalette['visibility'] | undefined {
  return input === 'public' || input === 'private' ? input : undefined
}

function normalizeOrigin(input: unknown): CanonicalPalette['origin'] | undefined {
  return input === 'curated' || input === 'custom' || input === 'fork' ? input : undefined
}

function isPublicCatalogPalettePayload(raw: RawPaletteDTO): boolean {
  if (raw.visibility !== undefined && raw.visibility !== 'public') {
    return false
  }
  if (raw.status !== undefined && raw.status !== 'published') {
    return false
  }
  return true
}

function normalizePaletteType(input: unknown): PaletteType {
  if (
    input === 'categorical' ||
    input === 'sequential' ||
    input === 'diverging' ||
    input === 'mixed' ||
    input === 'qualitative' ||
    input === 'heatmap'
  ) {
    return input
  }

  return 'categorical'
}

function normalizeSourceType(input: unknown): CanonicalPalette['source_type'] | undefined {
  if (input === 'manual' || input === 'figure_extracted' || input === 'curated') {
    return input
  }
  return undefined
}

function normalizeChartApplicability(
  input: ChartTypeApplicability[] | null | undefined
): ChartTypeApplicability[] | undefined {
  if (input === null || input === undefined) {
    return undefined
  }
  return input.map((item) => ({ ...item }))
}

function validateRawPaletteApplicability(raw: RawPaletteDTO): ValidationIssue[] {
  if (raw.chart_applicability === undefined || raw.chart_applicability === null) {
    return []
  }
  if (!Array.isArray(raw.chart_applicability)) {
    return [{
      path: 'chart_applicability',
      code: 'MALFORMED_CHART_APPLICABILITY',
      message: 'chart_applicability must be null or an array.'
    }]
  }
  return validateChartApplicability(raw.chart_applicability)
}

function normalizePreviewCases(input: RawPalettePreviewCase[] | undefined): PalettePreviewCase[] {
  if (input === undefined) {
    return []
  }
  return input.map((previewCase, index) => normalizePreviewCase(previewCase, `preview_cases[${index}]`))
}

function normalizePrimaryPreviewCase(
  input: RawPalettePreviewCase | null | undefined,
  parentPaletteID: string | undefined
): PalettePreviewCase | null {
  if (input === null || input === undefined) {
    return null
  }
  const normalized = normalizePreviewCase(input, 'primary_preview_case')
  if (!normalized.is_primary) {
    throw new PaletteNormalizationError([{
      path: 'primary_preview_case.is_primary',
      code: 'PRIMARY_PREVIEW_NOT_PRIMARY',
      message: 'Primary preview case must have is_primary = true.'
    }])
  }
  if (parentPaletteID !== undefined && normalized.palette_id !== parentPaletteID) {
    throw new PaletteNormalizationError([{
      path: 'primary_preview_case.palette_id',
      code: 'PRIMARY_PREVIEW_PALETTE_MISMATCH',
      message: 'Primary preview case palette_id must match the parent palette.'
    }])
  }
  return normalized
}

function normalizePreviewCase(raw: RawPalettePreviewCase, path: string): PalettePreviewCase {
  return {
    id: raw.id,
    palette_id: raw.palette_id,
    chart_type: normalizePreviewChartType(raw.chart_type, `${path}.chart_type`),
    template_id: raw.template_id,
    template_version: normalizePreviewVersion(raw.template_version, `${path}.template_version`),
    schema_version: normalizePreviewVersion(raw.schema_version, `${path}.schema_version`),
    color_roles: raw.color_roles,
    preview_config: raw.preview_config,
    seed_strategy: normalizePreviewSeedStrategy(raw.seed_strategy, `${path}.seed_strategy`),
    seed_value: raw.seed_value ?? null,
    is_primary: raw.is_primary,
    status: raw.status
  }
}

function validateRawPalettePreviewCases(raw: RawPaletteDTO): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (raw.preview_cases !== undefined) {
    if (!Array.isArray(raw.preview_cases)) {
      issues.push({
        path: 'preview_cases',
        code: 'INVALID_PREVIEW_CASES',
        message: 'preview_cases must be an array when present.'
      })
    } else {
      raw.preview_cases.forEach((previewCase, index) => {
        issues.push(...validateRawPreviewCase(previewCase, `preview_cases[${index}]`, raw.id, false))
      })
    }
  }

  if (raw.primary_preview_case !== undefined && raw.primary_preview_case !== null) {
    issues.push(...validateRawPreviewCase(raw.primary_preview_case, 'primary_preview_case', raw.id, true))
  }

  return issues
}

function validateRawPreviewCase(
  raw: RawPalettePreviewCase,
  path: string,
  parentPaletteID: string | undefined,
  primary: boolean
): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (!isPreviewChartType(raw.chart_type)) {
    issues.push({
      path: `${path}.chart_type`,
      code: 'UNKNOWN_CHART_TYPE',
      message: `Unknown preview chart type: ${String(raw.chart_type)}.`
    })
  }
  if (raw.status !== 'published') {
    issues.push({
      path: `${path}.status`,
      code: 'UNPUBLISHED_PREVIEW_CASE',
      message: 'Public preview cases must be published.'
    })
  }
  if (!isPreviewSeedStrategy(raw.seed_strategy)) {
    issues.push({
      path: `${path}.seed_strategy`,
      code: 'INVALID_SEED_STRATEGY',
      message: 'Preview seed strategy must be stable_id or fixed.'
    })
  }
  if (!isPositiveInteger(raw.template_version)) {
    issues.push({
      path: `${path}.template_version`,
      code: 'INVALID_TEMPLATE_VERSION',
      message: 'Preview template_version must be a positive integer.'
    })
  }
  if (!isPositiveInteger(raw.schema_version)) {
    issues.push({
      path: `${path}.schema_version`,
      code: 'INVALID_SCHEMA_VERSION',
      message: 'Preview schema_version must be a positive integer.'
    })
  }
  if (raw.seed_value !== undefined && raw.seed_value !== null && !Number.isInteger(raw.seed_value)) {
    issues.push({
      path: `${path}.seed_value`,
      code: 'INVALID_SEED_VALUE',
      message: 'Preview seed_value must be an integer or null.'
    })
  }
  if (primary && raw.is_primary !== true) {
    issues.push({
      path: `${path}.is_primary`,
      code: 'PRIMARY_PREVIEW_NOT_PRIMARY',
      message: 'Primary preview case must have is_primary = true.'
    })
  }
  if (primary && parentPaletteID !== undefined && raw.palette_id !== parentPaletteID) {
    issues.push({
      path: `${path}.palette_id`,
      code: 'PRIMARY_PREVIEW_PALETTE_MISMATCH',
      message: 'Primary preview case palette_id must match the parent palette.'
    })
  }

  return issues
}

function normalizePreviewChartType(input: unknown, path: string): PalettePreviewCase['chart_type'] {
  if (isPreviewChartType(input)) {
    return input
  }
  throw new PaletteNormalizationError([{
    path,
    code: 'UNKNOWN_CHART_TYPE',
    message: `Unknown preview chart type: ${String(input)}.`
  }])
}

function normalizePreviewSeedStrategy(input: unknown, path: string): PalettePreviewCase['seed_strategy'] {
  if (isPreviewSeedStrategy(input)) {
    return input
  }
  throw new PaletteNormalizationError([{
    path,
    code: 'INVALID_SEED_STRATEGY',
    message: 'Preview seed strategy must be stable_id or fixed.'
  }])
}

function normalizePreviewVersion(input: unknown, path: string): number {
  if (isPositiveInteger(input)) {
    return input
  }
  throw new PaletteNormalizationError([{
    path,
    code: 'INVALID_PREVIEW_VERSION',
    message: 'Preview versions must be positive integers.'
  }])
}

function isPreviewChartType(input: unknown): input is PalettePreviewCase['chart_type'] {
  return input === 'bar_error' ||
    input === 'boxplot_jitter' ||
    input === 'line_multiseries' ||
    input === 'heatmap_annotated' ||
    input === 'scatter_grouped' ||
    input === 'violin_distribution'
}

function isPreviewSeedStrategy(input: unknown): input is PalettePreviewCase['seed_strategy'] {
  return input === 'stable_id' || input === 'fixed'
}

function isPositiveInteger(input: unknown): input is number {
  return typeof input === 'number' && Number.isInteger(input) && input > 0
}

function collectLegacyPreviewFields(raw: RawPaletteDTO): LegacyPreviewFields | undefined {
  const legacyPreview: LegacyPreviewFields = {
    chart_family: raw.chart_family,
    exported_core_colors: raw.exported_core_colors,
    preview_template: raw.preview_template,
    copy_blocks: raw.copy_blocks,
    functional_roles: raw.functional_roles
  }

  return Object.values(legacyPreview).some((value) => value !== undefined)
    ? legacyPreview
    : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
