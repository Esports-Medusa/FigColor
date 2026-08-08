import favoritesViewSource from '@/views/FavoritesView.vue?raw'
import paginationSource from '@/components/common/PaginationControls.vue?raw'
import type { RawPaletteDTO } from '@/types/palette'

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

const catalog = Array.from({ length: 45 }, (_, index): RawPaletteDTO => ({
  id: `palette-${index + 1}`,
  slug: `palette-${index + 1}`,
  name: `Palette ${index + 1}`,
  colors: [{ id: `color-${index + 1}`, hex: '#2458A6', rgb: [36, 88, 166], order: 0 }],
  color_count: 1,
  type: 'categorical',
  chart_types: ['bar'],
  journal_style: [],
  discipline: [],
  use_case: [],
  avoid_case: [],
  tags: [],
  status: 'published',
  visibility: 'public',
  source_type: 'curated',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  primary_preview_case: null
}))

const requestedUrls: string[] = []
;(globalThis as unknown as { fetch: typeof fetch }).fetch = async (input) => {
  const url = new URL(String(input), 'https://figcolor.test')
  requestedUrls.push(url.toString())
  const page = Number(url.searchParams.get('page') || '1')
  const pageSize = Number(url.searchParams.get('page_size') || '20')
  const chartType = url.searchParams.get('chart_type')
  const filtered = chartType ? catalog.filter((palette) => palette.chart_types?.includes(chartType)) : catalog
  const start = (page - 1) * pageSize
  return new Response(JSON.stringify({
    palettes: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    page_size: pageSize,
    total_pages: Math.max(1, Math.ceil(filtered.length / pageSize))
  }), { status: 200 })
}

// A query suffix gives this regression test an isolated module-level cache,
// matching a fresh SPA session without exposing cache-reset production APIs.
const isolatedPaletteClientPath = '/src/lib/palette.ts?favorites-cache-boundary'
const paletteClient = await import(isolatedPaletteClientPath) as typeof import('@/lib/palette')

const browsePage = await paletteClient.loadPalettePage({ page: 1, pageSize: 20 })
expect(browsePage.palettes.length === 20, 'Browse should initially load only page 1')
expect(browsePage.totalPages === 3, 'Browse pagination metadata should remain correct')

const favoritesOutsidePageOne = Array.from({ length: 25 }, (_, index) => `palette-${index + 21}`)
const completeCatalog = await paletteClient.loadPalettes()
const resolvedFavorites = completeCatalog.filter((palette) => favoritesOutsidePageOne.includes(palette.id))
expect(completeCatalog.length === 45, 'Favorites should load the complete catalog after Browse page 1')
expect(resolvedFavorites.length === 25, 'favorites outside Browse page 1 should all resolve')
expect(Math.ceil(resolvedFavorites.length / 20) === 2, 'Favorites should retain the correct two-page count')

const requestsAfterCompleteLoad = requestedUrls.length
expect((await paletteClient.loadPalettes()).length === 45, 'direct Favorites entry should use the complete catalog')
expect(requestedUrls.length === requestsAfterCompleteLoad, 'complete catalog cache should prevent unconditional repeat requests')

const filteredBrowsePage = await paletteClient.loadPalettePage({ page: 2, pageSize: 10, chartType: 'bar' })
expect(filteredBrowsePage.page === 2 && filteredBrowsePage.palettes.length === 10, 'Browse filtering and page navigation should remain independent')
expect((await paletteClient.loadPalettes()).length === 45, 'later Browse pages must not overwrite the complete catalog')

expect(
  favoritesViewSource.includes(':total-pages="totalPages"') &&
    paginationSource.includes('v-if="totalPages > 1"'),
  'Favorites should show pagination whenever resolved favorites span multiple pages'
)
