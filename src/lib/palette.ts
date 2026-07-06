import type { Palette, PaletteFilters } from '@/types/palette'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

// Cache for palettes loaded from API
let palettesCache: Palette[] | null = null
let cacheLoaded = false

export interface NormalizedPalette {
  id: string
  name: string
  slug: string
  colors: { hex: string; rgb: [number, number] }[]
  journal_style: string[]
  chart_type: string[]
  color_count: number
  use_case: string[]
  avoid_case?: string[]
  discipline: string[]
  tags: string[]
  created_at: string
  updated_at: string
}

/**
 * Normalize palette from API response to frontend format
 * Handles snake_case -> camelCase conversion and data structure fixes
 */
function normalizePalette(raw: any): NormalizedPalette {
  // Handle colors - API returns {hex, rgb: [r,g,b]} but frontend expects {hex, rgb: [r,g,b]}
  let colors = raw.colors || []
  if (typeof colors === 'string') {
    try {
      colors = JSON.parse(colors)
    } catch {
      colors = []
    }
  }

  return {
    id: raw.id || '',
    name: raw.name || '',
    slug: raw.slug || '',
    colors: colors.map((c: any) => ({
      hex: c.hex || '#000000',
      rgb: Array.isArray(c.rgb) ? [c.rgb[0], c.rgb[1], c.rgb[2]] as [number, number, number] : [0, 0, 0] as [number, number, number],
    })),
    // API uses chart_types, frontend expects chart_type
    chart_type: Array.isArray(raw.chart_types) ? raw.chart_types : [],
    // API uses journal_style (already snake_case), frontend expects journal_style
    journal_style: Array.isArray(raw.journal_style) ? raw.journal_style : [],
    color_count: raw.color_count || 0,
    // API uses use_case, frontend expects use_case
    use_case: Array.isArray(raw.use_case) ? raw.use_case : [],
    avoid_case: Array.isArray(raw.avoid_case) ? raw.avoid_case : undefined,
    // API uses discipline, frontend expects discipline
    discipline: Array.isArray(raw.discipline) ? raw.discipline : [],
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    created_at: raw.created_at || '',
    updated_at: raw.updated_at || '',
  }
}

/**
 * Fetch all palettes from public API
 */
async function fetchPalettesFromAPI(): Promise<Palette[]> {
  console.log('[Browse] fetching palettes from API...')
  
  try {
    const response = await fetch(`${API_BASE}/palettes`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    const data = await response.json()
    console.log('[Browse] raw API response:', data)
    
    // Handle different response structures: {palettes: []}, {items: []}, or []
    let rawPalettes = []
    if (Array.isArray(data)) {
      rawPalettes = data
    } else if (data.palettes && Array.isArray(data.palettes)) {
      rawPalettes = data.palettes
    } else if (data.items && Array.isArray(data.items)) {
      rawPalettes = data.items
    }
    
    console.log('[Browse] raw palettes count:', rawPalettes.length)
    
    // Normalize all palettes
    const normalized = rawPalettes.map(normalizePalette)
    console.log('[Browse] normalized palettes:', normalized)
    
    return normalized
  } catch (error) {
    console.error('[Browse] failed to fetch palettes from API:', error)
    return []
  }
}

/**
 * Load palettes from API (with caching)
 */
export async function loadPalettes(): Promise<Palette[]> {
  if (!cacheLoaded) {
    palettesCache = await fetchPalettesFromAPI()
    cacheLoaded = true
  }
  return palettesCache || []
}

/**
 * Get all palettes (sync) - returns cached data
 * Call loadPalettes() first to ensure data is loaded
 */
export function getAllPalettes(): Palette[] {
  if (!cacheLoaded) {
    console.warn('[Browse] getAllPalettes called before loadPalettes - this may return empty array')
    return []
  }
  return palettesCache as Palette[]
}

/**
 * Reload palettes from API (bust cache)
 */
export async function reloadPalettes(): Promise<Palette[]> {
  cacheLoaded = false
  palettesCache = null
  return loadPalettes()
}

export function getPaletteBySlug(slug: string): Palette | undefined {
  const palettes = getAllPalettes()
  return palettes.find((palette) => palette.slug === slug)
}

export function filterPalettes(filters: PaletteFilters): Palette[] {
  const palettes = getAllPalettes()
  
  return palettes.filter((palette) => {
    if (filters.chart_type && filters.chart_type.length > 0) {
      const hasChartType = filters.chart_type.some((ct) => palette.chart_type.includes(ct))
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

/**
 * Normalize text for search comparison
 * - Convert to lowercase
 * - Trim whitespace
 * - Handle empty values
 * - AI/ai should match each other
 */
export function normalizeText(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }
  return String(value).toLowerCase().trim()
}

/**
 * Convert palette to searchable text string
 * Includes: name, slug, journal_style, chart_type, use_case, avoid_case, discipline, tags, colors info
 */
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
    ...palette.colors.map(c => normalizeText(c.hex)),
    ...palette.colors.map(c => `rgb(${c.rgb.join(', ')})`),
  ]
  return parts.join(' ')
}

/**
 * Check if array field matches selected value
 * Returns true if selected is empty (All) or if array includes the selected value
 */
export function matchesArrayField(values: string[], selected: string): boolean {
  if (!selected) {
    return true
  }
  return values.includes(selected)
}
