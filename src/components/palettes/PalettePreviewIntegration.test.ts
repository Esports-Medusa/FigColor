import paletteCard from '@/components/PaletteCard.vue?raw'
import paletteDetailView from '@/views/PaletteDetailView.vue?raw'
import favoritesView from '@/views/FavoritesView.vue?raw'
import palettesView from '@/views/PalettesView.vue?raw'
import adminPaletteForm from '@/views/admin/palettes/AdminPaletteForm.vue?raw'
import paginationControls from '@/components/common/PaginationControls.vue?raw'
import paletteChartPreview from './PaletteChartPreview.vue?raw'
import paletteChartPreviewLogic from './PaletteChartPreview.logic.ts?raw'

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

function testPaletteCardUsesSharedPreviewAndPreservesStructure(): void {
  expect(
    paletteCard.includes('<PaletteChartPreview :palette="palette" size="card" />'),
    'PaletteCard should render the shared preview component with the loaded palette'
  )
  expect(
    paletteCard.includes("name: 'palette-detail'") && paletteCard.includes('params: { slug: palette.slug }'),
    'PaletteCard should preserve router-link navigation structure'
  )
  expect(
    paletteCard.includes('@click.prevent="toggleFavorite"'),
    'PaletteCard should preserve favorite button click handling'
  )
}

function testPaletteDetailUsesHeroSharedPreview(): void {
  expect(
    paletteDetailView.includes('<PaletteChartPreview :palette="palette" size="hero" />'),
    'PaletteDetailView should render the same preview component with hero size'
  )
}

function testAdminPaletteFormUsesBrowsePreviewSystem(): void {
  expect(
    adminPaletteForm.includes('<PaletteChartPreview') &&
      adminPaletteForm.includes(':palette="canonicalPaletteForPreview"') &&
      adminPaletteForm.includes('<PalettePreview :colors="canonicalPaletteForPreview.colors" size="sm" />'),
    'Admin palette editing should reuse the Browse chart preview and palette strip'
  )
  expect(
    adminPaletteForm.includes('primary_preview_case: previewCases.value.find((previewCase) => previewCase.is_primary) ?? null') &&
      adminPaletteForm.includes('preview_cases: previewCases.value'),
    'Admin palette editing should supply loaded preview cases to the shared preview system'
  )
}

function testPreviewComponentHasNoChartSpecificDispatch(): void {
  const combinedPreviewSource = `${paletteChartPreview}\n${paletteChartPreviewLogic}`
  const bannedSnippets = [
    'CHART_TYPE_COMPONENT_MAP',
    "chart-type-",
    './previews/',
    "chartType ===",
    "chart_type ===",
    "'heatmap_annotated'",
    "'bar_error'",
    "'boxplot_jitter'",
    "'line_multiseries'"
  ]

  for (const snippet of bannedSnippets) {
    expect(
      !combinedPreviewSource.includes(snippet),
      `PaletteChartPreview should not contain chart-specific dispatch: ${snippet}`
    )
  }
}

function testPreviewAccessibilityTemplateWiring(): void {
  expect(
    paletteChartPreview.includes(":role=\"previewAccessibleLabel ? 'img' : undefined\""),
    'PaletteChartPreview should add an outer image role only for labeled fallback states'
  )
  expect(
    paletteChartPreview.includes(':aria-label="previewAccessibleLabel || undefined"'),
    'PaletteChartPreview should expose public fallback accessible labels'
  )
  expect(
    paletteChartPreview.includes('class="fallback-frame" aria-hidden="true"') &&
      paletteChartPreview.includes('class="placeholder-frame" aria-hidden="true"'),
    'PaletteChartPreview decorative fallback swatches should remain hidden from assistive tech'
  )
}

function testBrowseUsesLoadedPreviewPayloadsWithoutPerCardFetch(): void {
  expect(
    palettesView.includes(':palette="palette"'),
    'Browse should pass the already-loaded palette payload into PaletteCard'
  )
  expect(
    !palettesView.includes('preview-chart-type') && !palettesView.includes('getPrimaryChartType'),
    'Browse should not derive a separate legacy preview chart type per card'
  )
  expect(!palettesView.includes('fetch('), 'Browse should not introduce per-card preview fetches')
  expect(
    palettesView.includes('loadPalettePage') &&
      palettesView.includes('<PaginationControls') &&
      paginationControls.includes('of {{ totalPages }}'),
    'Browse should use paged palette loading with pagination metadata'
  )
  expect(
    palettesView.includes('v-if="loadError"') && palettesView.includes('Could not load palettes.'),
    'Browse should distinguish load failures from empty successful results'
  )
}

function testBrowseLoadingSkeletonStability(): void {
  expect(
    palettesView.includes('v-for="index in loadingSkeletonCount"'),
    'Browse loading state should render a fixed number of skeleton cards'
  )
  expect(
    palettesView.includes('class="palettes-grid" aria-hidden="true"'),
    'Browse loading skeletons should use the existing responsive grid'
  )
  expect(
    palettesView.includes('.skeleton-preview') && palettesView.includes('height: 160px;'),
    'Browse skeleton preview area should reserve the real card preview height'
  )
}

function testFavoritesUsesSharedPagination(): void {
  expect(
    favoritesView.includes('<PaginationControls') &&
      favoritesView.includes('paginatedFavoritePalettes') &&
      favoritesView.includes('Showing {{ paginationStart }}-{{ paginationEnd }}'),
    'Favorites should page favorite palettes with the shared pagination controls'
  )
}

testPaletteCardUsesSharedPreviewAndPreservesStructure()
testPaletteDetailUsesHeroSharedPreview()
testAdminPaletteFormUsesBrowsePreviewSystem()
testPreviewComponentHasNoChartSpecificDispatch()
testPreviewAccessibilityTemplateWiring()
testBrowseUsesLoadedPreviewPayloadsWithoutPerCardFetch()
testBrowseLoadingSkeletonStability()
testFavoritesUsesSharedPagination()
