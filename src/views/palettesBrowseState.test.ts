import palettesViewSource from './PalettesView.vue?raw'
import filterPanelSource from '@/components/PaletteFilterPanel.vue?raw'
import paletteCardSource from '@/components/PaletteCard.vue?raw'
import paletteDetailSource from '@/views/PaletteDetailView.vue?raw'
import { createPalettesBrowseQuery, readPalettesBrowseState } from './palettesBrowseState'

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

const restored = readPalettesBrowseState({
  q: 'immune',
  journal: 'nature',
  chart: 'heatmap',
  colors: '5',
  use: 'publication',
  discipline: 'biology',
  tag: 'colorblind-safe',
  page: '3',
  filters: '1'
})

expect(restored.search === 'immune', 'search query should restore from the URL')
expect(restored.journalStyle === 'nature', 'journal filter should restore from the URL')
expect(restored.chartType === 'heatmap', 'chart filter should restore from the URL')
expect(restored.colorCount === 5, 'color count should restore as a number')
expect(restored.useCase === 'publication', 'use case should restore from the URL')
expect(restored.discipline === 'biology', 'discipline should restore from the URL')
expect(restored.tag === 'colorblind-safe', 'tag should restore from the URL')
expect(restored.page === 3, 'Browse page should restore from the URL')
expect(restored.filtersExpanded, 'expanded filter state should restore from the URL')

const query = createPalettesBrowseQuery(restored)
expect(query.q === 'immune' && query.page === '3' && query.filters === '1', 'restored state should round-trip through query serialization')

const defaults = createPalettesBrowseQuery({
  search: '',
  journalStyle: '',
  chartType: '',
  colorCount: '',
  useCase: '',
  discipline: '',
  tag: '',
  page: 1,
  filtersExpanded: false
})
expect(Object.keys(defaults).length === 0, 'default Browse state should keep a clean URL')
expect(readPalettesBrowseState({ colors: 'invalid', page: '-4' }).page === 1, 'invalid query pagination should fall back safely')
expect(readPalettesBrowseState({ chart: 'bar' }).filtersExpanded, 'an advanced filter should remain visible after back navigation')

expect(
  palettesViewSource.includes('readPalettesBrowseState(route.query)') &&
    palettesViewSource.includes('createPalettesBrowseQuery') &&
    palettesViewSource.includes('await router.replace'),
  'Browse should initialize from and synchronize state to the route query'
)
expect(
  filterPanelSource.includes(`$emit('update:expanded', !expanded)`) &&
    palettesViewSource.includes('v-model:expanded="filtersExpanded"'),
  'filter panel expansion should survive detail navigation'
)
expect(
  palettesViewSource.includes(':detail-query="route.query"') &&
    paletteCardSource.includes("query: detailQuery") &&
    paletteDetailSource.includes("query: route.query"),
  'card navigation and the in-page Back link should preserve Browse query state'
)
