<template>
  <div class="app">
    <!-- Global Animated Background -->
    <div class="global-bg">
      <div class="glow-blob glow-blob-1"></div>
      <div class="glow-blob glow-blob-2"></div>
      <div class="glow-blob glow-blob-3"></div>
    </div>

    <header class="app-header">
      <nav class="nav container">
        <router-link to="/" class="nav-brand">
          <svg width="28" height="28" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="40" height="40" rx="10" fill="url(#nav-logo-gradient)"/>
            <circle cx="14" cy="14" r="5" fill="#ffffff" opacity="0.9"/>
            <circle cx="26" cy="14" r="5" fill="#ffffff" opacity="0.6"/>
            <circle cx="14" cy="26" r="5" fill="#ffffff" opacity="0.6"/>
            <circle cx="26" cy="26" r="5" fill="#ffffff" opacity="0.3"/>
            <defs>
              <linearGradient id="nav-logo-gradient" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
                <stop stop-color="#0066cc"/>
                <stop offset="1" stop-color="#7c3aed"/>
              </linearGradient>
            </defs>
          </svg>
          <span class="brand-text">FigColor</span>
        </router-link>
        <div class="nav-links">
          <router-link to="/palettes" class="nav-link">Palettes</router-link>
          <template v-if="isAuthenticated">
            <router-link v-if="isAdmin" to="/admin/palettes" class="nav-link nav-link-admin">Review</router-link>
            <router-link to="/projects" class="nav-link">My Projects</router-link>
            <router-link to="/favorites" class="nav-link">Favorites</router-link>
            <router-link to="/profile" class="nav-link">{{ currentUser?.name || currentUser?.email }}</router-link>
            <button @click="handleLogout" class="btn-logout">Logout</button>
          </template>
          <template v-else>
            <router-link to="/login" class="nav-link">Login</router-link>
            <router-link to="/register" class="nav-link nav-link-highlight">Sign Up</router-link>
          </template>
        </div>
      </nav>
    </header>
    <main class="app-main">
      <div class="container">
        <router-view />
      </div>
    </main>
    <footer class="app-footer">
      <div class="container">
        <p class="footer-text">FigColor - Publication-ready color palettes for scientific figures</p>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAuth } from '@/composables/useAuth'
import { useRouter } from 'vue-router'

const router = useRouter()
const { isAuthenticated, currentUser, logout } = useAuth()
const isAdmin = computed(() => currentUser.value?.role === 'admin')

async function handleLogout() {
  await logout()
  router.push('/')
}
</script>

<style scoped>
/* Global Animated Background */
.global-bg {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: -1;
  background: linear-gradient(135deg, #f8faff 0%, #f0f4ff 40%, #f5f2ff 70%, #fafaff 100%);
  overflow: hidden;
}

.glow-blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.6;
  animation: float 25s ease-in-out infinite;
}

.glow-blob-1 {
  width: 700px;
  height: 700px;
  background: radial-gradient(circle, rgba(0, 102, 204, 0.15) 0%, transparent 70%);
  top: -250px;
  left: -200px;
  animation-delay: 0s;
}

.glow-blob-2 {
  width: 600px;
  height: 600px;
  background: radial-gradient(circle, rgba(124, 58, 237, 0.12) 0%, transparent 70%);
  bottom: -200px;
  right: -150px;
  animation-delay: -8s;
}

.glow-blob-3 {
  width: 500px;
  height: 500px;
  background: radial-gradient(circle, rgba(0, 102, 204, 0.10) 0%, transparent 70%);
  top: 40%;
  left: 30%;
  animation-delay: -16s;
}

@keyframes float {
  0%, 100% {
    transform: translate(0, 0) scale(1);
  }
  33% {
    transform: translate(30px, -30px) scale(1.05);
  }
  66% {
    transform: translate(-20px, 20px) scale(0.95);
  }
}

.app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.app-header {
  background: #fff;
  border-bottom: 1px solid #e5e5e7;
  position: sticky;
  top: 0;
  z-index: 100;
}

.nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
}

.nav-brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  text-decoration: none;
  transition: opacity 0.15s ease;
}

.nav-brand:hover {
  text-decoration: none;
  opacity: 0.85;
}

.brand-text {
  font-size: 1.125rem;
  font-weight: 700;
  background: var(--gradient-brand);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: -0.01em;
}

.nav-links {
  display: flex;
  gap: 2rem;
}

.nav-link {
  font-size: 0.9375rem;
  font-weight: 500;
  color: #666;
  text-decoration: none;
  transition: color 0.15s;
}

.nav-link:hover {
  color: #0066cc;
  text-decoration: none;
}

.nav-link.router-link-active {
  color: #0066cc;
}

.nav-link-admin {
  color: #1d4ed8;
  font-weight: 700;
}

.user-menu {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.user-name {
  font-size: 0.875rem;
  color: #666;
}

.btn-logout {
  background: none;
  border: 1px solid #ddd;
  padding: 0.375rem 0.75rem;
  border-radius: 4px;
  font-size: 0.875rem;
  cursor: pointer;
  color: #666;
  transition: all 0.15s;
}

.btn-logout:hover {
  background: #f5f5f5;
  border-color: #ccc;
}

.nav-link-highlight {
  background: #0066cc;
  color: white !important;
  padding: 0.5rem 1rem;
  border-radius: 6px;
}

.nav-link-highlight:hover {
  background: #0052a3;
}

.app-main {
  flex: 1;
  padding: 2rem 0;
}

.app-footer {
  background: #fff;
  border-top: 1px solid #e5e5e7;
  padding: 1.5rem 0;
  margin-top: auto;
}

.footer-text {
  font-size: 0.875rem;
  color: #666;
  text-align: center;
}
</style>
