export interface PalettesBrowseState {
  search: string
  journalStyle: string
  chartType: string
  colorCount: number | ''
  useCase: string
  discipline: string
  tag: string
  page: number
  filtersExpanded: boolean
}

type QueryValue = string | null | (string | null)[] | undefined
type BrowseQuery = Record<string, QueryValue>

export function readPalettesBrowseState(query: BrowseQuery): PalettesBrowseState {
  const colorCount = positiveInteger(first(query.colors))
  const hasAdvancedFilter = ['journal', 'chart', 'colors', 'use', 'discipline', 'tag']
    .some((key) => Boolean(first(query[key])))
  return {
    search: first(query.q),
    journalStyle: first(query.journal),
    chartType: first(query.chart),
    colorCount: colorCount ?? '',
    useCase: first(query.use),
    discipline: first(query.discipline),
    tag: first(query.tag),
    page: positiveInteger(first(query.page)) ?? 1,
    filtersExpanded: first(query.filters) === '1' || hasAdvancedFilter
  }
}

export function createPalettesBrowseQuery(state: PalettesBrowseState): Record<string, string> {
  return compact({
    q: state.search.trim(),
    journal: state.journalStyle,
    chart: state.chartType,
    colors: state.colorCount === '' ? '' : String(state.colorCount),
    use: state.useCase,
    discipline: state.discipline,
    tag: state.tag,
    page: state.page > 1 ? String(state.page) : '',
    filters: state.filtersExpanded ? '1' : ''
  })
}

function first(value: QueryValue): string {
  if (Array.isArray(value)) return value.find((item): item is string => typeof item === 'string') ?? ''
  return typeof value === 'string' ? value : ''
}

function positiveInteger(value: string): number | null {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function compact(query: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(query).filter(([, value]) => value !== ''))
}
