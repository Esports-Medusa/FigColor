import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { getToken } from '@/api/auth'
import palettes from '@/data/palettes.json'

interface FavoritePalette {
  id: string
  userId: string
  paletteId: string
  createdAt: string
}

export function useFavorites() {
  const favorites = ref<FavoritePalette[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const favoritePaletteIds = computed(() => 
    favorites.value.map(f => f.paletteId)
  )

  async function loadFavorites() {
    const token = getToken()
    if (!token) return

    isLoading.value = true
    error.value = null

    try {
      const res = await fetch('/api/me/favorites', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (res.ok) {
        const data = await res.json()
        favorites.value = data.favorites || []
      } else if (res.status === 401) {
        favorites.value = []
      }
    } catch (e: any) {
      error.value = e.message
    } finally {
      isLoading.value = false
    }
  }

  async function addFavorite(paletteId: string) {
    const token = getToken()
    if (!token) return false

    try {
      const res = await fetch(`/api/me/favorites/${paletteId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (res.ok) {
        const data = await res.json()
        favorites.value.push(data)
        return true
      }
      return false
    } catch {
      return false
    }
  }

  async function removeFavorite(paletteId: string) {
    const token = getToken()
    if (!token) return false

    try {
      const res = await fetch(`/api/me/favorites/${paletteId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (res.ok) {
        favorites.value = favorites.value.filter(f => f.paletteId !== paletteId)
        return true
      }
      return false
    } catch {
      return false
    }
  }

  function isFavorited(paletteId: string): boolean {
    return favoritePaletteIds.value.includes(paletteId)
  }

  function getFavoritePalettes() {
    return palettes.filter(p => favoritePaletteIds.value.includes(p.id))
  }

  return {
    favorites,
    favoritePaletteIds,
    isLoading,
    error,
    loadFavorites,
    addFavorite,
    removeFavorite,
    isFavorited,
    getFavoritePalettes,
  }
}