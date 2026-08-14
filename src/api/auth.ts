// Authentication API client for FigColor

import { API_BASE } from './baseUrl'

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
	confirmPassword: string
}

export interface ApiErrorBody { error?: { code?: string; message?: string } | string }
export class AuthApiError extends Error { constructor(public code: string, message: string, public status: number) { super(message) } }
async function throwAuthError(response: Response, fallback: string): Promise<never> {
	let body: ApiErrorBody = {}; try { body = await response.json() } catch {}
	const detail = body.error
	if (typeof detail === 'object' && detail) throw new AuthApiError(detail.code || 'REQUEST_FAILED', detail.message || fallback, response.status)
	throw new AuthApiError('REQUEST_FAILED', typeof detail === 'string' ? detail : fallback, response.status)
}

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
export async function register(data: RegisterRequest): Promise<void> {
  const response = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
		return throwAuthError(response, 'Registration failed')
  }

	await response.json()
}

// Login
export async function login(data: LoginRequest): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
		return throwAuthError(response, 'Login failed')
  }

  const result: AuthResponse = await response.json()
  setToken(result.token)
  return result
}

async function postPublic(path: string, data: unknown): Promise<void> {
	const response = await fetch(`${API_BASE}/auth/${path}`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) })
	if (!response.ok) return throwAuthError(response, 'Request failed')
}
export const verifyEmail = (token:string) => postPublic('verify-email',{token})
export const resendVerification = (email:string) => postPublic('resend-verification-email',{email})
export const forgotPassword = (email:string) => postPublic('forgot-password',{email})
export const resetPassword = (token:string,newPassword:string,confirmPassword:string) => postPublic('reset-password',{token,newPassword,confirmPassword})
export async function requestPasswordChange():Promise<void>{
	const response=await fetch(`${API_BASE}/auth/request-password-change`,{method:'POST',headers:getAuthHeaders()})
	if(!response.ok)return throwAuthError(response,'Unable to send password update email')
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
		return throwAuthError(response, 'Failed to get user')
  }

  return response.json()
}

// Check if user is authenticated
export function isAuthenticated(): boolean {
  return !!getToken()
}
