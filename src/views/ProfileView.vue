<template>
  <div class="profile-view">
    <header class="page-header">
      <h1>My Profile</h1>
    </header>

    <div class="profile-content" v-if="currentUser">
      <div class="profile-card">
        <div class="profile-avatar">
          <span class="avatar-initial">{{ userInitial }}</span>
        </div>
        <div class="profile-info">
          <h2>{{ currentUser.name || 'User' }}</h2>
          <p class="profile-email">{{ currentUser.email }}</p>
          <p class="profile-status">
            Status: <span :class="['status-badge', currentUser.status]">{{ currentUser.status }}</span>
          </p>
          <p class="profile-email-verified">
            Email verified: <span :class="['verified-badge', currentUser.emailVerified ? 'yes' : 'no']">
              {{ currentUser.emailVerified ? 'Yes' : 'No' }}
            </span>
          </p>
          <p class="profile-member-since">
            Member since: {{ formatDate(currentUser.createdAt) }}
          </p>
        </div>
      </div>

      <div class="profile-actions">
        <button @click="handleLogout" class="btn-logout">Logout</button>
      </div>
    </div>

    <div v-else class="loading">Loading profile...</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'

const router = useRouter()
const { currentUser, logout } = useAuth()

const userInitial = computed(() => {
  if (currentUser.value?.name) {
    return currentUser.value.name.charAt(0).toUpperCase()
  }
  if (currentUser.value?.email) {
    return currentUser.value.email.charAt(0).toUpperCase()
  }
  return 'U'
})

function formatDate(dateStr: string): string {
  if (!dateStr) return 'N/A'
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

async function handleLogout() {
  await logout()
  router.push('/')
}
</script>

<style scoped>
.profile-view {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}

.page-header {
  margin-bottom: 2rem;
}

.page-header h1 {
  font-size: 2rem;
}

.profile-card {
  display: flex;
  gap: 2rem;
  background: white;
  border-radius: 12px;
  padding: 2rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.profile-avatar {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: linear-gradient(135deg, #0066cc, #7c3aed);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.avatar-initial {
  font-size: 2rem;
  font-weight: 600;
  color: white;
}

.profile-info {
  flex: 1;
}

.profile-info h2 {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
}

.profile-email {
  color: #666;
  margin-bottom: 0.5rem;
}

.profile-status,
.profile-email-verified,
.profile-member-since {
  font-size: 0.875rem;
  color: #666;
  margin-bottom: 0.25rem;
}

.status-badge,
.verified-badge {
  display: inline-block;
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
}

.status-badge.active {
  background: #d4edda;
  color: #155724;
}

.status-badge.inactive {
  background: #f8d7da;
  color: #721c24;
}

.verified-badge.yes {
  background: #d4edda;
  color: #155724;
}

.verified-badge.no {
  background: #fff3cd;
  color: #856404;
}

.profile-actions {
  margin-top: 2rem;
  padding-top: 2rem;
  border-top: 1px solid #eee;
}

.btn-logout {
  background: none;
  border: 1px solid #ddd;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: pointer;
  color: #666;
  transition: all 0.15s;
}

.btn-logout:hover {
  background: #f5f5f5;
  border-color: #ccc;
}

.loading {
  text-align: center;
  padding: 3rem;
  color: #666;
}
</style>