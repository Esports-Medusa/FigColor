import paginationSource from './PaginationControls.vue?raw'
import palettesSource from '@/views/PalettesView.vue?raw'

function expect(condition: boolean, message: string): void { if (!condition) throw new Error(message) }

expect(palettesSource.includes('const pageSize = 16'), 'Public palette browse should show 16 cards per page')
expect(paginationSource.includes('class="jump-cluster"'), 'Page input, total, and Go should remain one visual group')
expect(paginationSource.includes('class="page-total">of {{ totalPages }}'), 'Total page count should remain explicit')
expect(paginationSource.includes('white-space: nowrap'), 'Page total should not split onto another line')
expect(paginationSource.includes('width: 3.5rem !important'), 'Global input width should not stretch the page jump input')
