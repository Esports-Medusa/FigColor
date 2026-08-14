import type { PaperProject, ProjectDetail, ProjectPalette, CreateProjectRequest, UpdateProjectRequest, UpdateRoleColorRequest, FigureAssignment, CreateFigureRequest, UpdateFigureRequest, CreateProjectPaletteRequest, UpdateProjectPaletteRequest } from '@/types/project'
import { getToken } from '@/api/auth'
import { API_BASE } from '@/api/baseUrl'

function getAuthHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { 'Authorization': `Bearer ${token}` } : {}
}

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...options?.headers,
    },
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }
  
  return response.json()
}

export const projectApi = {
  // ========== User-owned projects (/api/me/projects) ==========
  // These endpoints require auth and enforce user isolation

  // Get current user's projects
  async getMyProjects(): Promise<PaperProject[]> {
    return fetchJSON<PaperProject[]>(`${API_BASE}/me/projects`)
  },

  // Create a new project for current user
  async createMyProject(data: CreateProjectRequest): Promise<PaperProject> {
    return fetchJSON<PaperProject>(`${API_BASE}/me/projects`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  // Get project details for current user (enforces ownership)
  async getMyProjectDetail(projectId: string): Promise<ProjectDetail> {
    return fetchJSON<ProjectDetail>(`${API_BASE}/me/projects/${projectId}`)
  },

  // Update project (enforces ownership)
  async updateMyProject(projectId: string, data: UpdateProjectRequest): Promise<void> {
    await fetchJSON(`${API_BASE}/me/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },

  // Delete project (enforces ownership)
  async deleteMyProject(projectId: string): Promise<void> {
    await fetchJSON(`${API_BASE}/me/projects/${projectId}`, {
      method: 'DELETE',
    })
  },

  // Update role color (enforces ownership)
  async updateRoleColor(projectId: string, paletteId: string, roleId: string, data: UpdateRoleColorRequest): Promise<void> {
    await fetchJSON(`${API_BASE}/me/projects/${projectId}/palettes/${paletteId}/roles/${roleId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },

  // Add a base palette to a project
  async createProjectPalette(projectId: string, data: CreateProjectPaletteRequest): Promise<ProjectPalette> {
    return fetchJSON<ProjectPalette>(`${API_BASE}/me/projects/${projectId}/palettes`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async updateProjectPalette(projectId: string, paletteId: string, data: UpdateProjectPaletteRequest): Promise<ProjectPalette> {
    return fetchJSON<ProjectPalette>(`${API_BASE}/me/projects/${projectId}/palettes/${paletteId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  // Get figures for a project
  async getFigures(projectId: string): Promise<FigureAssignment[]> {
    return fetchJSON<FigureAssignment[]>(`${API_BASE}/me/projects/${projectId}/figures`)
  },

  // Create a figure
  async createFigure(projectId: string, data: CreateFigureRequest): Promise<FigureAssignment> {
    return fetchJSON<FigureAssignment>(`${API_BASE}/me/projects/${projectId}/figures`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  // Update a figure
  async updateFigure(projectId: string, figureId: string, data: UpdateFigureRequest): Promise<void> {
    await fetchJSON(`${API_BASE}/me/projects/${projectId}/figures/${figureId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },

  // Delete a figure
  async deleteFigure(projectId: string, figureId: string): Promise<void> {
    await fetchJSON(`${API_BASE}/me/projects/${projectId}/figures/${figureId}`, {
      method: 'DELETE',
    })
  },

  // ========== Legacy public endpoints (for browsing, no auth required) ==========
  // NOTE: These return ALL projects, no user isolation. Use /me/* endpoints for user data.

  // Get all projects (public - for browsing)
  async getProjects(): Promise<PaperProject[]> {
    return fetchJSON<PaperProject[]>(`${API_BASE}/projects`)
  },

  // Get project details (public - for browsing)
  async getProjectDetail(projectId: string): Promise<ProjectDetail> {
    return fetchJSON<ProjectDetail>(`${API_BASE}/projects/${projectId}`)
  },
}
