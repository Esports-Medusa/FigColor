import paletteCard from '@/components/PaletteCard.vue?raw'
import paletteDetailView from '@/views/PaletteDetailView.vue?raw'
import palettesView from '@/views/PalettesView.vue?raw'
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
    paletteCard.includes('<router-link :to="`/palettes/${palette.slug}`" class="palette-card">'),
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
    paletteChartPreview.includes('<div v-else class="fallback-frame" aria-hidden="true">'),
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
    palettesView.includes('await loadPalettes()'),
    'Browse should continue using the existing palette list load path'
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

testPaletteCardUsesSharedPreviewAndPreservesStructure()
testPaletteDetailUsesHeroSharedPreview()
testPreviewComponentHasNoChartSpecificDispatch()
testPreviewAccessibilityTemplateWiring()
testBrowseUsesLoadedPreviewPayloadsWithoutPerCardFetch()
testBrowseLoadingSkeletonStability()
