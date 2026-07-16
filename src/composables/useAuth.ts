import { ref, computed } from 'vue'
import { User, login as apiLogin, register as apiRegister, logout as apiLogout, getCurrentUser, removeToken, getToken } from '@/api/auth'

// Global auth state
const user = ref<User | null>(null)
const isLoading = ref(false)
const error = ref<string | null>(null)

// Initialize auth state from stored token
export function initAuth(): void {
  const token = getToken()
  if (token) {
    isLoading.value = true
    getCurrentUser()
      .then((u) => {
        user.value = u
      })
      .catch(() => {
        // Token invalid, remove it
        removeToken()
      })
      .finally(() => {
        isLoading.value = false
      })
  }
}

export function useAuth() {
  const isAuthenticated = computed(() => !!user.value)
  const currentUser = computed(() => user.value)

  async function login(email: string, password: string): Promise<void> {
    error.value = null
    isLoading.value = true
    try {
      const response = await apiLogin({ email, password })
      user.value = response.user
    } catch (e: any) {
      error.value = e.message
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function register(email: string, password: string, name?: string): Promise<void> {
    error.value = null
    isLoading.value = true
    try {
      const response = await apiRegister({ email, password, name })
      user.value = response.user
    } catch (e: any) {
      error.value = e.message
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function logout(): Promise<void> {
    error.value = null
    try {
      await apiLogout()
    } finally {
      user.value = null
      removeToken()
    }
  }

  async function fetchCurrentUser(): Promise<void> {
    error.value = null
    isLoading.value = true
    try {
      user.value = await getCurrentUser()
    } catch (e: any) {
      error.value = e.message
      user.value = null
      removeToken()
    } finally {
      isLoading.value = false
    }
  }

  return {
    user,
    isLoading,
    error,
    isAuthenticated,
    currentUser,
    login,
    register,
    logout,
    fetchCurrentUser,
  }
}
