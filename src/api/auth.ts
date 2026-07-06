// Authentication API client for FigColor

export interface User {
  id: string
  email: string
  emailVerified: boolean
  name: string | null
  avatarUrl: string | null
  role: string
  status: string
  createdAt: string
  updatedAt: string
}

export interface AuthResponse {
  user: User
  token: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  email: string
  password: string
  name?: string
}

const API_BASE = '/api'

// Store token in localStorage
export function setToken(token: string): void {
  localStorage.setItem('auth_token', token)
}

export function getToken(): string | null {
  return localStorage.getItem('auth_token')
}

export function removeToken(): void {
  localStorage.removeItem('auth_token')
}

// Get auth headers
export function getAuthHeaders(): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }
  const token = getToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

// Register a new user
export async function register(data: RegisterRequest): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Registration failed')
  }

  const result: AuthResponse = await response.json()
  setToken(result.token)
  return result
}

// Login
export async function login(data: LoginRequest): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Login failed')
  }

  const result: AuthResponse = await response.json()
  setToken(result.token)
  return result
}

// Logout
export async function logout(): Promise<void> {
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: getAuthHeaders(),
    })
  } finally {
    removeToken()
  }
}

// Get current user
export async function getCurrentUser(): Promise<User> {
  const response = await fetch(`${API_BASE}/auth/me`, {
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    if (response.status === 401) {
      removeToken()
      throw new Error('Not authenticated')
    }
    const error = await response.json()
    throw new Error(error.error || 'Failed to get user')
  }

  return response.json()
}

// Check if user is authenticated
export function isAuthenticated(): boolean {
  return !!getToken()
}