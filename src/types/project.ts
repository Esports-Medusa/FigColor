// Paper Project related types
import type { RawPaletteDTO } from '@/types/palette'

export type PaletteRole = {
  id: string
  paletteId: string
  key: string
  label: string
  color: string
  roleType: 'semantic' | 'group' | 'ui' | 'custom'
  order: number
  createdAt: string
  updatedAt: string
}

export type ProjectPalette = {
  id: string
  projectId: string
  name: string
  basePaletteId?: string
  isDefault: boolean
  roles: PaletteRole[]
  previewPalette?: RawPaletteDTO
  createdAt: string
  updatedAt: string
}

export type PaperProject = {
  id: string
  userId?: string
  name: string
  description?: string
  defaultPaletteId?: string
  createdAt: string
  updatedAt: string
}

export type FigureAssignment = {
  id: string
  projectId: string
  paletteId: string // base palette id stored by figure_assignments.palette_id
  name: string
  panel?: string
  chartType: string
  // New: directly store selected color IDs
  selectedColorIds?: string[]
  // Legacy: store selected role keys (used when selectedColorIds is empty)
  selectedRoleKeys: string[]
  notes?: string
  createdAt: string
  updatedAt: string
}

export type ProjectDetail = {
  project: PaperProject
  palettes: ProjectPalette[]
  figures: FigureAssignment[]
}

export type CreateProjectRequest = {
  name: string
  description?: string
}

export type UpdateProjectRequest = {
  name?: string
  description?: string
}

export type UpdateRoleColorRequest = {
  color: string
}

export type CreateFigureRequest = {
  name: string
  panel?: string
  chartType: string
  paletteId: string // submit the selected ProjectPalette.basePaletteId
  // New: directly store selected color IDs
  selectedColorIds?: string[]
  // Legacy: selected role keys
  selectedRoleKeys: string[]
  notes?: string
}

export type UpdateFigureRequest = {
  name?: string
  panel?: string
  chartType?: string
  paletteId?: string // submit the selected ProjectPalette.basePaletteId
  // New: directly store selected color IDs
  selectedColorIds?: string[]
  // Legacy: selected role keys
  selectedRoleKeys?: string[]
  notes?: string
}

export type CreateProjectPaletteRequest = {
  basePaletteId?: string
  name: string
  roles?: Array<{
    key: string
    label: string
    color: string
  }>
}

export type UpdateProjectPaletteRequest = {
  name: string
  roles: Array<{
    id?: string
    key: string
    label: string
    color: string
    roleType: PaletteRole['roleType']
    order: number
  }>
}
