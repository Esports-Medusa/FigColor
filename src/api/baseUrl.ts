const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() ?? ''

// Keep local development on Vite's same-origin /api proxy. In deployed builds,
// VITE_API_BASE_URL should be the API origin, for example https://api.figcolor.xxx.
export const apiBaseUrl = configuredApiBaseUrl.replace(/\/+$/, '')
export const API_BASE = `${apiBaseUrl}/api`

export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
}
