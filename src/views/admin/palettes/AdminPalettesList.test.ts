import adminPalettesListSource from './AdminPalettesList.vue?raw'
import { CHART_TYPE_DEFINITIONS } from '@/lib/chart-types/registry'

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

function countOccurrences(value: string, needle: string): number {
  return value.split(needle).length - 1
}

function testAdminReviewHasOneCanonicalChartTypeFilter(): void {
  expect(countOccurrences(adminPalettesListSource, 'All Chart Types') === 1, 'Admin Review should render one Chart Type filter')
  expect(countOccurrences(adminPalettesListSource, 'All Status') === 1, 'Admin Review should render one Status filter')
  expect(!adminPalettesListSource.includes('All Types'), 'Admin Review should not render ambiguous All Types copy')
  expect(!adminPalettesListSource.includes('All Palette Types'), 'Admin Review should remove the legacy Palette Type filter')
  expect(!adminPalettesListSource.includes('aria-label="Palette Type"'), 'Admin Review should not render the removed Palette Type filter')
  expect(adminPalettesListSource.includes('aria-label="Chart Type"'), 'Chart Type filter should be explicitly labelled')
}

function testAdminReviewChartTypeFilterUsesRegistryOptions(): void {
  expect(adminPalettesListSource.includes('CHART_TYPE_DEFINITIONS.map'), 'Admin Review chart filter should derive options from the chart registry')
  CHART_TYPE_DEFINITIONS.forEach(({ chartType }) => {
    expect(adminPalettesListSource.includes(`${chartType}:`), `Admin Review chart filter should label ${chartType}`)
  })
  expect(!adminPalettesListSource.includes('<option value="line">Line</option>'), 'Admin Review chart filter should not use legacy broad line option')
  expect(!adminPalettesListSource.includes('<option value="bar">Bar</option>'), 'Admin Review chart filter should not use legacy broad bar option')
  expect(adminPalettesListSource.includes('scatter_grouped:'), 'Admin Review chart filter should include canonical Scatter')
  expect(adminPalettesListSource.includes('violin_distribution:'), 'Admin Review chart filter should include canonical Violin')
  expect(!adminPalettesListSource.includes('<option value="area">Area</option>'), 'Admin Review chart filter should not include unsupported Phase 1 area option')
}

function testAdminReviewFilterStateAndPagination(): void {
  expect(!adminPalettesListSource.includes('paletteType'), 'Admin Review should remove stale palette type state')
  expect(!adminPalettesListSource.includes('type: filters.paletteType || undefined'), 'Admin Review should stop sending the removed palette type filter')
  expect(adminPalettesListSource.includes('<th>Type</th>'), 'Admin Review should keep the Type table column')
  expect(adminPalettesListSource.includes('chartType'), 'Admin Review should keep chart type state')
  expect(!adminPalettesListSource.includes('journal_style: filters.journal_style'), 'Admin Review should not retain hidden journal_style filter query logic')
  expect(!adminPalettesListSource.includes('discipline: filters.discipline'), 'Admin Review should not retain hidden discipline filter query logic')
  expect(adminPalettesListSource.includes('chart_type: filters.chartType || undefined'), 'Admin Review should map Chart Type to the backend chart_type query')
  expect(adminPalettesListSource.includes('function handleFiltersChanged()') && adminPalettesListSource.includes('page.value = 1'), 'Admin Review should reset to page 1 when filters change')
  expect(adminPalettesListSource.includes('PaginationControls'), 'Admin Review should use the shared Browse-style pagination controls')
  expect(adminPalettesListSource.includes('@go="goToPage"'), 'Admin Review pagination should support direct page jumps')
  expect(adminPalettesListSource.includes('function goToPage'), 'Admin Review should handle pagination jump events')
  expect(adminPalettesListSource.includes('Showing {{ paginationStart }}-{{ paginationEnd }} of {{ total }} palettes'), 'Admin Review should show paged result counts')
  expect(!adminPalettesListSource.includes('Previous</button>'), 'Admin Review should remove the legacy previous-only pagination')
}

function testAdminReviewConfirmActionsUseSpecificLabels(): void {
  expect(adminPalettesListSource.includes(':confirm-text="confirmAction.confirmText"'), 'Admin Review should pass explicit confirm button text')
  expect(adminPalettesListSource.includes("confirmText: 'Yes, publish'"), 'Publish confirmation should use publish-specific button text')
  expect(adminPalettesListSource.includes("confirmText: 'Yes, unpublish'"), 'Unpublish confirmation should use unpublish-specific button text')
  expect(adminPalettesListSource.includes("confirmText: 'Yes, delete'"), 'Delete confirmation should use delete-specific button text')
}

testAdminReviewHasOneCanonicalChartTypeFilter()
testAdminReviewChartTypeFilterUsesRegistryOptions()
testAdminReviewFilterStateAndPagination()
testAdminReviewConfirmActionsUseSpecificLabels()
