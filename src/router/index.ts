import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import PalettesView from '@/views/PalettesView.vue'
import PaletteDetailView from '@/views/PaletteDetailView.vue'
import ChartTypesView from '@/views/ChartTypesView.vue'
import ProjectsView from '@/views/ProjectsView.vue'
import ProjectDetailView from '@/views/ProjectDetailView.vue'
import LoginView from '@/views/LoginView.vue'
import RegisterView from '@/views/RegisterView.vue'
import FavoritesView from '@/views/FavoritesView.vue'
import ProfileView from '@/views/ProfileView.vue'
import AdminDashboard from '@/views/admin/AdminDashboard.vue'
import AdminPalettesList from '@/views/admin/palettes/AdminPalettesList.vue'
import AdminPaletteForm from '@/views/admin/palettes/AdminPaletteForm.vue'
import AccessDeniedView from '@/views/AccessDeniedView.vue'
import { isAuthenticated } from '@/api/auth'
import { useAuth } from '@/composables/useAuth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView
    },
    {
      path: '/palettes',
      name: 'palettes',
      component: PalettesView
    },
    {
      path: '/palettes/:slug',
      name: 'palette-detail',
      component: PaletteDetailView
    },
    {
      path: '/chart-types',
      name: 'chart-types',
      component: ChartTypesView
    },
    {
      path: '/projects',
      name: 'projects',
      component: ProjectsView
    },
    {
      path: '/projects/:projectId',
      name: 'project-detail',
      component: ProjectDetailView
    },
    {
      path: '/favorites',
      name: 'favorites',
      component: FavoritesView,
      meta: { requiresAuth: true }
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: { guestOnly: true }
    },
    {
      path: '/register',
      name: 'register',
      component: RegisterView,
      meta: { guestOnly: true }
    },
    {
      path: '/profile',
      name: 'profile',
      component: ProfileView,
      meta: { requiresAuth: true }
    },
    // Admin routes
    {
      path: '/admin',
      name: 'admin',
      component: AdminDashboard,
      meta: { requiresAuth: true, requiresAdmin: true }
    },
    {
      path: '/admin/palettes',
      name: 'admin-palettes',
      component: AdminPalettesList,
      meta: { requiresAuth: true, requiresAdmin: true }
    },
    {
      path: '/admin/palettes/new',
      name: 'admin-palette-new',
      component: AdminPaletteForm,
      meta: { requiresAuth: true, requiresAdmin: true }
    },
    {
      path: '/admin/palettes/:id/edit',
      name: 'admin-palette-edit',
      component: AdminPaletteForm,
      meta: { requiresAuth: true, requiresAdmin: true }
    },
    {
      path: '/access-denied',
      name: 'access-denied',
      component: AccessDeniedView
    }
  ]
})

// Navigation guard for auth and admin
router.beforeEach(async (to, _from, next) => {
  const { currentUser, fetchCurrentUser } = useAuth()
  const authenticated = isAuthenticated()
  
  console.log('[Router Guard] checking route:', to.path)
  console.log('[Router Guard] authenticated:', authenticated)
  console.log('[Router Guard] currentUser:', currentUser.value)
  console.log('[Router Guard] currentUser.role:', currentUser.value?.role)
  
  // Redirect authenticated users away from guest-only routes
  if (to.meta.guestOnly && authenticated) {
    next('/')
    return
  }
  
  // Redirect unauthenticated users to login for protected routes
  if (to.meta.requiresAuth && !authenticated) {
    next('/login')
    return
  }
  
  // Check admin requirement
  if (to.meta.requiresAdmin) {
    // If we have token but no user loaded yet, try to load user
    if (!currentUser.value && authenticated) {
      try {
        await fetchCurrentUser()
      } catch (e) {
        // Failed to fetch user, redirect to login
        next('/login')
        return
      }
    }
    
    if (!currentUser.value) {
      console.log('[Router Guard] no currentUser, redirecting to login')
      next('/login')
      return
    }
    if (currentUser.value.role !== 'admin') {
      console.log('[Router Guard] role is not admin, redirecting to access-denied')
      next('/access-denied')
      return
    }
    console.log('[Router Guard] admin check passed')
  }
  
  next()
})

export default router
