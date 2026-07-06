// Admin API Client for FigColor

import { getAuthHeaders } from './auth'

const API_BASE = '/api'

export interface PaletteColor {
  hex: string
  rgb: [number, number, number]
}

export interface Accessibility {
  colorblind_safe: boolean
  print_friendly: boolean
  dark_background: boolean
}

export interface AdminPalette {
  id: string
  slug: string
  name: string
  colors: PaletteColor[]
  color_count: number
  type: 'categorical' | 'sequential' | 'diverging' | 'qualitative' | 'heatmap'
  chart_types: string[]
  journal_style: string[]
  discipline: string[]
  use_case: string[]
  avoid_case?: string[]
  tags: string[]
  accessibility: Accessibility
  source_type: 'manual' | 'figure_extracted' | 'curated'
  source_image?: string
  source_note?: string
  status: 'draft' | 'candidate' | 'published' | 'archived'
  version?: string
  created_by?: string
  created_at: string
  updated_at: string
  published_at?: string
  archived_at?: string
}

export interface CreatePaletteRequest {
  name: string
  slug?: string
  colors: PaletteColor[]
  color_count?: number
  type: string
  chart_types?: string[]
  journal_style?: string[]
  discipline?: string[]
  use_case?: string[]
  tags?: string[]
  accessibility?: Accessibility
  source_type?: string
  source_image?: string
  source_note?: string
  version?: string
  status?: string
}

export interface UpdatePaletteRequest {
  name?: string
  slug?: string
  colors?: PaletteColor[]
  color_count?: number
  type?: string
  chart_types?: string[]
  journal_style?: string[]
  discipline?: string[]
  use_case?: string[]
  avoid_case?: string[]
  tags?: string[]
  accessibility?: Accessibility
  source_type?: string
  source_image?: string
  source_note?: string
  version?: string
  status?: string
}

export interface PaletteListResponse {
  items: AdminPalette[]
  total: number
  page: number
  pageSize: number
}

export interface PaletteStats {
  total: number
  draft: number
  candidate: number
  published: number
  archived: number
}

// Admin Palette API

export async function getPalettes(params?: {
  status?: string
  type?: string
  chart_type?: string
  journal_style?: string
  discipline?: string
  page?: number
  page_size?: number
}): Promise<PaletteListResponse> {
  const query = new URLSearchParams()
  if (params?.status) query.set('status', params.status)
  if (params?.type) query.set('type', params.type)
  if (params?.chart_type) query.set('chart_type', params.chart_type)
  if (params?.journal_style) query.set('journal_style', params.journal_style)
  if (params?.discipline) query.set('discipline', params.discipline)
  if (params?.page) query.set('page', String(params.page))
  if (params?.page_size) query.set('page_size', String(params.page_size))

  const response = await fetch(`${API_BASE}/admin/palettes?${query}`, {
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to fetch palettes')
  }

  const data = await response.json()

  // Normalize response to ensure consistent format
  return {
    items: Array.isArray(data.items) ? data.items : (Array.isArray(data.palettes) ? data.palettes : []),
    total: typeof data.total === 'number' ? data.total : 0,
    page: typeof data.page === 'number' ? data.page : 1,
    pageSize: typeof data.pageSize === 'number' ? data.pageSize : (typeof data.page_size === 'number' ? data.page_size : 20)
  }
}

export async function getPalette(id: string): Promise<AdminPalette> {
  const response = await fetch(`${API_BASE}/admin/palettes/${id}`, {
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to fetch palette')
  }

  return response.json()
}

export async function createPalette(data: CreatePaletteRequest): Promise<AdminPalette> {
  const response = await fetch(`${API_BASE}/admin/palettes`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to create palette')
  }

  return response.json()
}

export async function updatePalette(id: string, data: UpdatePaletteRequest): Promise<AdminPalette> {
  const response = await fetch(`${API_BASE}/admin/palettes/${id}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to update palette')
  }

  return response.json()
}

export async function publishPalette(id: string): Promise<AdminPalette> {
  const response = await fetch(`${API_BASE}/admin/palettes/${id}/publish`, {
    method: 'POST',
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to publish palette')
  }

  return response.json()
}

export async function unpublishPalette(id: string): Promise<AdminPalette> {
  const response = await fetch(`${API_BASE}/admin/palettes/${id}/unpublish`, {
    method: 'POST',
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to unpublish palette')
  }

  return response.json()
}

export async function deletePalette(id: string): Promise<{ message: string; palette: AdminPalette }> {
  const response = await fetch(`${API_BASE}/admin/palettes/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to delete palette')
  }

  return response.json()
}

export async function getPaletteStats(): Promise<PaletteStats> {
  const response = await fetch(`${API_BASE}/admin/stats`, {
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to fetch stats')
  }

  return response.json()
}

// Utility functions

export function hexToRgb(hex: string): [number, number, number] {
  const cleanHex = hex.replace('#', '')
  const r = parseInt(cleanHex.substring(0, 2), 16)
  const g = parseInt(cleanHex.substring(2, 4), 16)
  const b = parseInt(cleanHex.substring(4, 6), 16)
  return [r, g, b]
}

export function isValidHex(hex: string): boolean {
  const cleanHex = hex.replace('#', '')
  return /^[0-9A-Fa-f]{6}$/.test(cleanHex)
}

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function parseColorsInput(input: string): { hex: string; rgb: [number, number, number] }[] {
  const lines = input.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  return lines.map(line => {
    const hex = line.startsWith('#') ? line : `#${line}`
    return {
      hex: hex.toUpperCase(),
      rgb: hexToRgb(hex),
    }
  })
}