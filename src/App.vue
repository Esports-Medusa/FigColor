<template>
  <div class="app">
    <ChromaticSpectrumRail />
    <header class="app-header">
      <nav class="nav container" aria-label="Primary navigation">
        <router-link to="/" class="nav-brand" aria-label="FigColor home"><FigColorLogo /></router-link>
        <div class="nav-links">
          <router-link to="/palettes" class="nav-link">Palettes</router-link>
          <template v-if="isAuthenticated">
            <router-link v-if="isAdmin" to="/admin/palettes" class="nav-link">Review</router-link>
            <router-link to="/projects" class="nav-link">My Projects</router-link>
            <router-link to="/favorites" class="nav-link">Favorites</router-link>
            <router-link v-if="isAdmin" to="/admin" class="nav-link">Admin</router-link>
            <router-link to="/profile" class="nav-link profile-link">{{ currentUser?.name || currentUser?.email }}</router-link>
            <button @click="handleLogout" class="btn btn-secondary btn-logout">Logout</button>
          </template>
          <template v-else>
            <router-link to="/login" class="nav-link">Login</router-link>
            <router-link to="/register" class="btn btn-primary sign-up">Sign Up</router-link>
          </template>
        </div>
      </nav>
    </header>
    <main class="app-main"><div class="container"><router-view /></div></main>
    <footer class="app-footer"><div class="container"><p>FigColor – Publication-ready color palettes for scientific figures</p></div></footer>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import ChromaticSpectrumRail from '@/components/layout/ChromaticSpectrumRail.vue'
import FigColorLogo from '@/components/brand/FigColorLogo.vue'
const router = useRouter()
const { isAuthenticated, currentUser, logout } = useAuth()
const isAdmin = computed(() => currentUser.value?.role === 'admin')
async function handleLogout() { await logout(); router.push('/') }
</script>
<style scoped>
.app { min-height: 100vh; display: flex; flex-direction: column; background: var(--fc-bg); }
.app-header { position: sticky; top: 0; z-index: 100; background: #fff; }
.nav { position: relative; min-height: 72px; display: flex; align-items: center; justify-content: space-between; gap: 2rem; }
.nav::after { content: ''; position: absolute; inset: auto .5rem 0 .5rem; height: 1px; background: var(--fc-line); }
.nav-brand { text-decoration: none; flex: none; }
.nav-links { align-self: stretch; display: flex; align-items: center; gap: clamp(.8rem, 2vw, 2rem); }
.nav-link { position: relative; display: flex; height: 100%; align-items: center; color: var(--fc-text); font-size: .9rem; font-weight: 500; text-decoration: none; white-space: nowrap; }
.nav-link:hover { color: var(--fc-primary); text-decoration: none; }
.nav-link.router-link-active::after { content: ''; position: absolute; height: 3px; border-radius: 2px; background: var(--fc-primary); inset: auto 0 -1px; }
.btn-logout { padding: .45rem .85rem; }
.sign-up { padding: .5rem .9rem; text-decoration: none; }
.app-main { flex: 1; padding: 2.25rem 0 3.5rem; }
.app-footer { padding: 0 0 1.25rem; color: var(--fc-muted); font-size: .8rem; text-align: center; }
.app-footer .container { position: relative; padding-top: 1.25rem; }
.app-footer .container::before { content: ''; position: absolute; inset: 0 .5rem auto .5rem; height: 1px; background: var(--fc-line); }
@media (max-width: 1320px) { .nav::after, .app-footer .container::before { left: 2.75rem; } }
@media (max-width: 800px) { .nav { min-height: 64px; align-items: flex-start; padding-top: 1rem; padding-bottom: .7rem; } .nav::after, .app-footer .container::before { left: 1.5rem; right: .5rem; } .nav-links { align-self: auto; flex-wrap: wrap; justify-content: flex-end; gap: .55rem 1rem; } .nav-link { height: 28px; font-size: .82rem; } .profile-link { display:none; } }
@media (max-width: 520px) { .nav { display:block; } .nav-links { margin-top:.75rem; justify-content:flex-start; } .app-main { padding-top:1.5rem; } }
</style>
