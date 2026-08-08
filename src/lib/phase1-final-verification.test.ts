import addPaletteModalSource from '@/components/project/AddPaletteModal.vue?raw'
import phase1SeedSource from '../../backend/dev/seed_phase1_preview_palettes.sql?raw'
import paletteCardSource from '@/components/PaletteCard.vue?raw'
import paletteChartPreviewSource from '@/components/palettes/PaletteChartPreview.vue?raw'
import paletteDetailSource from '@/views/PaletteDetailView.vue?raw'
import palettesViewSource from '@/views/PalettesView.vue?raw'
import {
  createPaletteChartPreviewModel,
  selectPalettePreviewCase
} from '@/components/palettes/PaletteChartPreview.logic'
import { resolveExplicitPreviewCaseExportModel, resolvePaletteExportModel } from '@/lib/exports'
import { filterPalettes, getPaletteBySlug, getPalettesLoadError, loadPaletteBySlug, loadPalettePage, paletteToSearchText, reloadPalettes } from '@/lib/palette'
import { getEffectivePreviewChartTypes } from '@/lib/palette/applicability'
import { renderPalettePreview, PREVIEW_RENDERERS } from '@/lib/renderers'
import type { CanonicalPalette, ChartType, Palette, PalettePreviewCase, RawPaletteDTO } from '@/types/palette'

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

const colors = [
  { id: 'blue-id', hex: '#2458A6', rgb: [36, 88, 166] as [number, number, number], label: 'Blue', order: 0 },
  { id: 'orange-id', hex: '#D55E00', rgb: [213, 94, 0] as [number, number, number], label: 'Orange', order: 1 },
  { id: 'green-id', hex: '#009E73', rgb: [0, 158, 115] as [number, number, number], label: 'Green', order: 2 },
  { id: 'purple-id', hex: '#7B3294', rgb: [123, 50, 148] as [number, number, number], label: 'Purple', order: 3 }
]

const chartTypes: ChartType[] = ['bar_error', 'boxplot_jitter', 'line_multiseries', 'heatmap_annotated']

function palette(overrides: Partial<CanonicalPalette> = {}): CanonicalPalette {
  return {
    id: 'palette-1',
    slug: 'palette-one',
    name: 'Palette One',
    status: 'published',
    colors,
    color_count: colors.length,
    type: 'categorical',
    chart_types: ['bar', 'boxplot', 'line', 'heatmap'],
    chart_applicability: chartTypes.map((chart_type, index) => ({
      chart_type,
      suitability: index === 0 ? 'best_fit' : 'recommended',
      source: 'curated'
    })),
    journal_style: ['nature'],
    disciplines: ['biomedical'],
    use_cases: ['publication'],
    avoid_cases: [],
    tags: ['high_contrast', 'publication_ready'],
    source_image: 'https://example.invalid/source.png',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    primary_preview_case: null,
    preview_cases: [],
    ...overrides
  }
}

function previewCase(chartType: ChartType, overrides: Partial<PalettePreviewCase> = {}): PalettePreviewCase {
  const base = previewCaseBase(chartType)
  return {
    ...base,
    ...overrides
  }
}

function previewCaseBase(chartType: ChartType): PalettePreviewCase {
  switch (chartType) {
    case 'scatter_grouped':
    case 'violin_distribution':
      throw new Error(`${chartType} is outside the Phase 1 verification fixture set.`)
    case 'bar_error':
      return {
        id: 'bar-primary',
        palette_id: 'palette-1',
        chart_type: 'bar_error',
        template_id: 'bar_error_v1',
        template_version: 1,
        schema_version: 1,
        color_roles: {
          groups: [
            { key: 'control', label: 'Control', fill: { source: 'palette', color_id: 'blue-id' } },
            { key: 'treated', label: 'Treated', fill: { source: 'palette', color_id: 'orange-id' } },
            { key: 'rescue', label: 'Rescue', fill: { source: 'palette', color_id: 'green-id' } }
          ],
          elements: requiredBarElements()
        },
        preview_config: { orientation: 'vertical', sample_size: 24, error_type: 'sem', data_pattern: 'mixed' },
        seed_strategy: 'stable_id',
        seed_value: null,
        is_primary: true,
        status: 'published'
      }
    case 'boxplot_jitter':
      return {
        id: 'boxplot-primary',
        palette_id: 'palette-1',
        chart_type: 'boxplot_jitter',
        template_id: 'boxplot_jitter_v1',
        template_version: 1,
        schema_version: 1,
        color_roles: {
          groups: [
            { key: 'low', label: 'Low', color: { source: 'palette', color_id: 'blue-id' } },
            { key: 'mid', label: 'Mid', color: { source: 'palette', color_id: 'orange-id' } },
            { key: 'high', label: 'High', color: { source: 'palette', color_id: 'green-id' } }
          ],
          elements: { axis: { source: 'theme', token: 'foreground' }, grid: { source: 'theme', token: 'grid' }, text: { source: 'theme', token: 'foreground' } }
        },
        preview_config: { jitter_density: 'medium', show_outliers: true, y_axis_label: 'Value' },
        seed_strategy: 'stable_id',
        seed_value: null,
        is_primary: true,
        status: 'published'
      }
    case 'line_multiseries':
      return {
        id: 'line-primary',
        palette_id: 'palette-1',
        chart_type: 'line_multiseries',
        template_id: 'line_multiseries_v1',
        template_version: 1,
        schema_version: 1,
        color_roles: {
          series: [
            { key: 'baseline', label: 'Baseline', line: { source: 'palette', color_id: 'blue-id' }, confidence_band: { source: 'palette', color_id: 'green-id', opacity: 0.24 } },
            { key: 'treated', label: 'Treated', line: { source: 'palette', color_id: 'orange-id' }, marker: { source: 'theme', token: 'background' } },
            { key: 'washout', label: 'Washout', line: { source: 'palette', color_id: 'purple-id' } }
          ],
          elements: { axis: { source: 'theme', token: 'foreground' }, grid: { source: 'theme', token: 'grid' }, text: { source: 'theme', token: 'foreground' } }
        },
        preview_config: { point_count: 8, curve_shape: 'mixed', x_axis_label: 'Time', y_axis_label: 'Response' },
        seed_strategy: 'stable_id',
        seed_value: null,
        is_primary: true,
        status: 'published'
      }
    case 'heatmap_annotated':
      return {
        id: 'heatmap-primary',
        palette_id: 'palette-1',
        chart_type: 'heatmap_annotated',
        template_id: 'heatmap_annotated_v1',
        template_version: 1,
        schema_version: 1,
        color_roles: {
          scale: {
            type: 'diverging',
            stops: [
              { position: 0, label: 'Low', color: { source: 'palette', color_id: 'blue-id' } },
              { position: 0.5, label: 'Mid', color: { source: 'palette', color_id: 'green-id' } },
              { position: 1, label: 'High', color: { source: 'palette', color_id: 'orange-id' } }
            ]
          },
          annotations: [
            { key: 'batch', label: 'Batch', color: { source: 'palette', color_id: 'purple-id' } }
          ],
          elements: { text: { source: 'theme', token: 'foreground' }, grid: { source: 'theme', token: 'grid' }, background: { source: 'theme', token: 'background' } }
        },
        preview_config: {
          rows: 6,
          columns: 6,
          cluster_rows: true,
          cluster_columns: false,
          show_row_labels: true,
          show_column_labels: true,
          show_values: true,
          data_pattern: 'mixed'
        },
        seed_strategy: 'stable_id',
        seed_value: null,
        is_primary: true,
        status: 'published'
      }
  }
}

function requiredBarElements() {
  return {
    axis: { source: 'theme', token: 'foreground' },
    grid: { source: 'theme', token: 'grid' },
    text: { source: 'theme', token: 'foreground' },
    error_bar: { source: 'theme', token: 'foreground' },
    background: { source: 'theme', token: 'background' }
  }
}

function testPublishedPrimaryScenariosRenderInCardAndHeroModels(): void {
  chartTypes.forEach((chartType) => {
    const primary = previewCase(chartType)
    const input = palette({
      id: `${chartType}-palette`,
      primary_preview_case: primary,
      preview_cases: [primary]
    })
    const renderResult = renderPalettePreview(input, primary)
    expect(renderResult.ok && renderResult.kind === 'svg', `${chartType} renderer should produce SVG`)

    const cardSelection = selectPalettePreviewCase(input, undefined, false)
    const heroSelection = selectPalettePreviewCase(input, primary, true)
    expect(cardSelection?.id === primary.id, `${chartType} card path should select published primary preview`)
    expect(heroSelection?.id === primary.id, `${chartType} hero override path should select published primary preview`)

    const cardModel = createPaletteChartPreviewModel(input, cardSelection)
    const heroModel = createPaletteChartPreviewModel(input, heroSelection)
    expect(cardModel.state === 'svg' && cardModel.svgMarkup.includes('<svg'), `${chartType} card model should render SVG`)
    expect(heroModel.state === 'svg' && heroModel.svgMarkup.includes('<svg'), `${chartType} hero model should render SVG`)
  })
}

function testPreviewDeterminismAndNoMutation(): void {
  chartTypes.forEach((chartType) => {
    const input = palette({ primary_preview_case: previewCase(chartType) })
    const preview = input.primary_preview_case!
    const beforePalette = JSON.stringify(input)
    const beforePreview = JSON.stringify(preview)
    const first = renderPalettePreview(input, preview)
    const second = renderPalettePreview(input, preview)
    expect(first.ok && second.ok && first.markup === second.markup, `${chartType} preview should be deterministic`)
    expect(JSON.stringify(input) === beforePalette, `${chartType} renderer should not mutate palette`)
    expect(JSON.stringify(preview) === beforePreview, `${chartType} renderer should not mutate preview case`)
  })
}

function testPublicPreviewSelectionAndFallbackOrder(): void {
  const publishedPrimary = previewCase('bar_error')
  const draft = previewCase('bar_error', { id: 'draft-preview', status: 'draft', is_primary: false })
  const nonPrimary = previewCase('bar_error', { id: 'published-secondary', is_primary: false })
  const archived = previewCase('bar_error', { id: 'archived-preview', status: 'archived', is_primary: false })
  const cases: Array<[string, CanonicalPalette, string]> = [
    ['no preview cases', palette({ primary_preview_case: null, preview_cases: [] }), 'generic'],
    ['draft only', palette({ primary_preview_case: null, preview_cases: [draft] }), 'generic'],
    ['published non-primary only', palette({ primary_preview_case: null, preview_cases: [nonPrimary] }), 'generic'],
    ['archived preview', palette({ primary_preview_case: null, preview_cases: [archived] }), 'generic'],
    ['published primary', palette({ primary_preview_case: publishedPrimary, preview_cases: [publishedPrimary] }), 'svg'],
    ['multiple records one primary', palette({ primary_preview_case: publishedPrimary, preview_cases: [draft, nonPrimary, publishedPrimary, archived] }), 'svg']
  ]

  cases.forEach(([name, input, expectedState]) => {
    const selected = selectPalettePreviewCase(input, undefined, false)
    const model = createPaletteChartPreviewModel(input, selected)
    expect(model.state === expectedState, `${name} should follow public fallback order`)
  })

  expect(selectPalettePreviewCase(palette(), draft, true) === null, 'draft override should not be public')
  expect(selectPalettePreviewCase(palette(), archived, true) === null, 'archived override should not be public')
  expect(selectPalettePreviewCase(palette(), draft, true, false)?.id === draft.id, 'admin explicit draft preview should be selectable')
}

function testExportsAndStableColorIdsUseRoles(): void {
  const primary = previewCase('line_multiseries')
  const input = palette({ primary_preview_case: primary })
  const publicModel = resolvePaletteExportModel(input)
  expect(publicModel.colors.map((color) => color.colorId).join(',') === 'blue-id,orange-id,purple-id', 'public exports should use role color IDs')

  const draft = previewCase('bar_error', {
    status: 'draft',
    is_primary: false,
    color_roles: {
      groups: [
        { key: 'draft_green', label: 'Draft Green', fill: { source: 'palette', color_id: 'green-id' } },
        { key: 'draft_blue', label: 'Draft Blue', fill: { source: 'palette', color_id: 'blue-id' } }
      ],
      elements: requiredBarElements()
    }
  })
  const draftModel = resolveExplicitPreviewCaseExportModel(input, draft)
  expect(draftModel.colors.map((color) => color.colorId).join(',') === 'green-id,blue-id', 'draft exports should use current role IDs, not palette order')
}

async function testApplicabilityFallbacksAndFilters(): Promise<void> {
  const legacy = palette({ chart_applicability: undefined, chart_types: ['line', 'heatmap'] })
  const migratedEmpty = palette({ chart_applicability: [], chart_types: ['line', 'heatmap'] })
  expect(getEffectivePreviewChartTypes(legacy).join(',') === 'line_multiseries,heatmap_annotated', 'legacy palette should infer Phase 1 chart applicability')
  expect(getEffectivePreviewChartTypes(migratedEmpty).length === 0, 'migrated empty chart_applicability should not fall back to legacy chart_types')

  const normalizedPalette = palette({ id: 'filter-1', slug: 'filter-one' }) as Palette
  normalizedPalette.chart_type = ['bar', 'line']
  normalizedPalette.discipline = ['biomedical']
  normalizedPalette.use_case = ['publication']
  normalizedPalette.avoid_case = []
  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = async () => new Response(JSON.stringify([normalizedPalette]), { status: 200 })
  await reloadPalettes()
  expect(filterPalettes({ chart_type: ['line_multiseries'], journal_style: ['nature'], color_count: [4], use_case: ['publication'], discipline: ['biomedical'], tags: ['high_contrast'] }).length === 1, 'Browse filters should match loaded palette fields')
  expect(filterPalettes({ chart_type: ['scatter'] }).length === 0, 'Browse filters should exclude non-matching chart type')
  expect(paletteToSearchText(normalizedPalette).includes('2458a6'), 'Paper Project search should include color HEX values')
  expect(paletteToSearchText(normalizedPalette).includes('publication'), 'Paper Project search should include use cases')
}

async function testPublicBrowseUsesPagedMetadataAndRemoteFilters(): Promise<void> {
  const chartCases: Array<{
    chartType: ChartType
    broadTypes: string[]
  }> = [
    { chartType: 'bar_error', broadTypes: ['bar'] },
    { chartType: 'boxplot_jitter', broadTypes: ['boxplot', 'violin'] },
    { chartType: 'line_multiseries', broadTypes: ['line'] },
    { chartType: 'heatmap_annotated', broadTypes: ['heatmap'] }
  ]
  const rawPalettes = chartCases.flatMap(({ chartType, broadTypes }) =>
    Array.from({ length: 10 }, (_, index) => {
      const id = `${chartType}-${index + 1}`
      return palette({
        id,
        slug: id,
        name: `${chartType} ${index + 1}`,
        chart_types: broadTypes,
        chart_applicability: [{ chart_type: chartType, suitability: 'best_fit', source: 'curated' }],
        primary_preview_case: previewCase(chartType, { palette_id: id })
      })
    })
  )
  const requestedURLs: string[] = []
  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = async (input: RequestInfo | URL) => {
    requestedURLs.push(String(input))
    const url = new URL(String(input), 'https://figcolor.test')
    const page = Number(url.searchParams.get('page') ?? '1')
    const pageSize = Number(url.searchParams.get('page_size') ?? '20')
    const chartType = url.searchParams.get('chart_type')
    const search = url.searchParams.get('search')?.toLowerCase().trim()
    const filtered = rawPalettes.filter((item) => {
      if (chartType && !serverChartFilterMatches(item, chartType)) {
        return false
      }
      if (search && !item.name.toLowerCase().includes(search)) {
        return false
      }
      return true
    })
    const start = (page - 1) * pageSize
    return new Response(JSON.stringify({
      palettes: filtered.slice(start, start + pageSize),
      total: filtered.length,
      page,
      page_size: pageSize,
      total_pages: Math.max(1, Math.ceil(filtered.length / pageSize))
    }), { status: 200 })
  }

  const pageOne = await loadPalettePage({ page: 1, pageSize: 15 })
  const pageTwo = await loadPalettePage({ page: 2, pageSize: 15 })
  const pageThree = await loadPalettePage({ page: 3, pageSize: 15 })
  expect(pageOne.total === 40 && pageOne.palettes.length === 15 && pageOne.totalPages === 3, 'Browse page 1 should expose total metadata for all 40 palettes')
  expect(pageTwo.palettes.length === 15, 'Browse page 2 should load the next page of palettes')
  expect(pageThree.palettes.length === 10, 'Browse page 3 should load the remaining palettes')
  expect(
    requestedURLs.every((url) => new URL(url, 'https://figcolor.test').searchParams.get('page_size') !== '100'),
    'Browse pagination should not depend on a fixed full-list page size'
  )

  const linePageOne = await loadPalettePage({ page: 1, pageSize: 4, chartType: 'line' })
  const linePageThree = await loadPalettePage({ page: 3, pageSize: 4, chartType: 'line' })
  expect(linePageOne.total === 10 && linePageOne.palettes.length === 4, 'line filter should count the full matching dataset before pagination')
  expect(linePageThree.total === 10 && linePageThree.palettes.length === 2, 'line filter should page through all line matches')
  expect(linePageOne.palettes.every((item) => item.chart_type.includes('line_multiseries')), 'line filter should return line_multiseries palettes')

  const heatmapSearch = await loadPalettePage({ page: 1, pageSize: 20, chartType: 'heatmap', search: '10' })
  expect(heatmapSearch.total === 1 && heatmapSearch.palettes[0].chart_type.includes('heatmap_annotated'), 'search and chart filters should combine before pagination')
}

async function testPaginationResponseParsingAndLoadPalettesFallback(): Promise<void> {
  const first = palette({ id: 'pagination-one', slug: 'pagination-one' })
  const second = palette({ id: 'pagination-two', slug: 'pagination-two' })
  const responses = [
    {
      palettes: [first],
      total: '2',
      page: '1',
      page_size: '1',
      total_pages: '2'
    },
    {
      palettes: [second],
      total: '2',
      page: '2',
      page_size: '1'
    },
    {
      palettes: [first],
      total: 'not-a-count',
      page: 0,
      page_size: -1,
      total_pages: 0
    }
  ]
  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = async () => {
    const body = responses.shift()
    return new Response(JSON.stringify(body), { status: 200 })
  }

  const parsed = await loadPalettePage({ page: 1, pageSize: 1 })
  expect(parsed.page === 1 && parsed.pageSize === 1 && parsed.total === 2 && parsed.totalPages === 2 && parsed.error === null, 'paged response parser should accept numeric string metadata')
  const derivedTotalPages = await loadPalettePage({ page: 2, pageSize: 1 })
  expect(derivedTotalPages.totalPages === 2, 'paged response parser should derive totalPages from total and pageSize when total_pages is missing')
  const fallback = await loadPalettePage({ page: 4, pageSize: 30 })
  expect(fallback.page === 4 && fallback.pageSize === 30 && fallback.total === 1 && fallback.totalPages === 1, 'paged response parser should fall back for invalid metadata')

  const originalConsoleError = console.error
  console.error = () => {}
  try {
    ;(globalThis as unknown as { fetch: typeof fetch }).fetch = async () => {
      throw new Error('network unavailable')
    }
    await reloadPalettes()
    expect(getAllLoadedPaletteCount() === 0, 'loadPalettes should resolve to an empty cache after a paged fetch failure')
    expect(getPalettesLoadError() === 'network unavailable', 'loadPalettes should preserve an error state after a paged fetch failure')
  } finally {
    console.error = originalConsoleError
  }

  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = async () => {
    return new Response(JSON.stringify({ palettes: [], total: 0, page: 1, page_size: 20, total_pages: 1 }), { status: 200 })
  }
  const emptySuccess = await loadPalettePage({ page: 1, pageSize: 20 })
  expect(emptySuccess.palettes.length === 0 && emptySuccess.error === null, 'empty successful Browse responses should not be treated as load failures')
  expect(getPalettesLoadError() === 'network unavailable', 'Browse page results should not overwrite complete-catalog load state')
}

async function testPublicPaletteClientRejectsExplicitPrivatePayloads(): Promise<void> {
  const publicPalette = palette({ id: 'public-palette', slug: 'public-palette', visibility: 'public' })
  const privatePalette = palette({ id: 'private-palette', slug: 'private-palette', visibility: 'private', owner_user_id: 'user-1' })
  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = async (input) => {
    const url = String(input)
    if (url.includes('/api/palettes/private-palette')) {
      return new Response(JSON.stringify(privatePalette), { status: 200 })
    }
    return new Response(JSON.stringify({
      palettes: [privatePalette, publicPalette],
      total: 2,
      page: 1,
      page_size: 20,
      total_pages: 1
    }), { status: 200 })
  }

  const page = await loadPalettePage({ page: 1, pageSize: 20 })
  expect(page.total === 1 && page.palettes.length === 1 && page.palettes[0].id === 'public-palette', 'public palette client should filter explicit private payloads from leaked list responses')

  const detail = await loadPaletteBySlug('private-palette')
  expect(detail === null, 'public palette client should reject explicit private detail payloads')
}

function getAllLoadedPaletteCount(): number {
  return filterPalettes({}).length
}

function serverChartFilterMatches(item: RawPaletteDTO, selected: string): boolean {
  const targetsByBroadType: Record<string, string[]> = {
    bar: ['bar', 'bar_error'],
    boxplot: ['boxplot', 'boxplot_jitter'],
    violin: ['violin', 'boxplot_jitter'],
    line: ['line', 'line_multiseries'],
    heatmap: ['heatmap', 'heatmap_annotated']
  }
  const targets = targetsByBroadType[selected] ?? [selected]
  const applicability = Array.isArray(item.chart_applicability) ? item.chart_applicability : []
  const chartTypes = Array.isArray(item.chart_types) ? item.chart_types : []
  return applicability.some((entry) => targets.includes(entry.chart_type)) ||
    chartTypes.some((chartType) => targets.includes(chartType))
}

async function testDirectPaletteDetailLoading(): Promise<void> {
  const primary = previewCase('heatmap_annotated')
  const raw: RawPaletteDTO = {
    ...palette({ primary_preview_case: primary }),
    primary_preview_case: undefined,
    preview_cases: undefined
  }
  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = async (input: RequestInfo | URL) => {
    expect(String(input).includes('/api/palettes/palette-one'), 'Palette Detail should fetch direct palette detail by slug')
    return new Response(JSON.stringify({
      palette: raw,
      resolved_primary_preview: primary,
      preview_cases: [primary]
    }), { status: 200 })
  }

  const loaded = await loadPaletteBySlug('palette-one')
  expect(loaded?.primary_preview_case?.id === primary.id, 'direct Palette Detail loading should normalize resolved primary preview')
  expect(createPaletteChartPreviewModel(loaded!, selectPalettePreviewCase(loaded!, undefined, false)).state === 'svg', 'direct-loaded detail preview should render')
}

function testPublicPreviewDoesNotUseScreenshotsOrSourceImages(): void {
  const primary = previewCase('bar_error')
  const input = palette({
    source_image: 'https://example.invalid/journal-screenshot.png',
    primary_preview_case: primary,
    preview_cases: [primary]
  })
  const model = createPaletteChartPreviewModel(input, selectPalettePreviewCase(input, undefined, false))
  expect(!model.svgMarkup.includes('journal-screenshot'), 'public preview markup should not include source_image')
  expect(!model.svgMarkup.includes('<image'), 'public preview markup should not embed image screenshots')
  expect(!paletteCardSource.includes('source_image'), 'Palette cards should not use source_image for previews')
  expect(!paletteChartPreviewSource.includes('source_image'), 'PaletteChartPreview should not use source_image')
}

function testRendererRandomnessAndProjectWiring(): void {
  PREVIEW_RENDERERS.forEach((renderer) => {
    expect(!renderer.render.toString().includes('Math.random'), `${renderer.templateId} should not call uncontrolled Math.random()`)
  })
  expect(paletteDetailSource.includes('loadPaletteBySlug'), 'Palette Detail should use direct detail loading')
  expect(palettesViewSource.includes('PaletteFilterPanel'), 'Browse filters should remain wired')
  expect(palettesViewSource.includes('PaletteCard'), 'Browse should render palette cards')
  expect(addPaletteModalSource.includes('loadPalettes'), 'Paper Project add palette flow should load palettes')
  expect(addPaletteModalSource.includes('paletteToSearchText'), 'Paper Project add palette flow should use shared palette search text')
}

function testPhaseOneSeedSupportsChartFilterAcceptance(): void {
  expect(phase1SeedSource.includes('jsonb_build_array('), 'Phase 1 seed should build chart_applicability entries')
  expect(!phase1SeedSource.includes('Included for Phase 1 filter coverage.'), 'Phase 1 seed palettes should not declare every chart type as compatible')
  expect(phase1SeedSource.includes("'chart_type', generated.chart_type"), 'Phase 1 seed chart_applicability should use the generated primary chart type')
  expect(phase1SeedSource.includes("'suitability', 'best_fit'"), 'Phase 1 seed chart_applicability should mark the primary chart type best_fit')
  expect(phase1SeedSource.includes("'key', 'recovery', 'label', 'Recovery', 'color'"), 'boxplot seed should declare a fifth data group')
  expect(phase1SeedSource.includes("'key', 'follow_up', 'label', 'Follow-up', 'fill'"), 'bar seed should declare a fifth data group')
  expect(phase1SeedSource.includes("'key', 'follow_up', 'label', 'Follow-up', 'line'"), 'line seed should declare a fifth data series')
  expect(!phase1SeedSource.includes("'show_violin'"), 'boxplot seed should not retain the removed violin option')
}

function testCacheLookupBeforeLoadIsSilent(): void {
  const originalWarn = console.warn
  let warningCount = 0
  console.warn = () => { warningCount += 1 }
  try {
    expect(getPaletteBySlug('not-loaded') === undefined, 'cache lookup before catalog loading should return undefined')
    expect(warningCount === 0, 'cache lookup before catalog loading should not warn')
  } finally {
    console.warn = originalWarn
  }
}

testCacheLookupBeforeLoadIsSilent()
testPublishedPrimaryScenariosRenderInCardAndHeroModels()
testPreviewDeterminismAndNoMutation()
testPublicPreviewSelectionAndFallbackOrder()
testExportsAndStableColorIdsUseRoles()
await testApplicabilityFallbacksAndFilters()
await testPublicBrowseUsesPagedMetadataAndRemoteFilters()
await testPaginationResponseParsingAndLoadPalettesFallback()
await testPublicPaletteClientRejectsExplicitPrivatePayloads()
await testDirectPaletteDetailLoading()
testPublicPreviewDoesNotUseScreenshotsOrSourceImages()
testRendererRandomnessAndProjectWiring()
testPhaseOneSeedSupportsChartFilterAcceptance()
