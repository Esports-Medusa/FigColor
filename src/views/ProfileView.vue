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
		<details class="advanced-settings">
			<summary>Advanced settings</summary>
			<div class="advanced-content"><h2>Password</h2><p>We’ll email you a secure link to choose a new password. Completing the update signs you out on every device.</p>
				<button type="button" class="btn-update-password" :disabled="sendingPasswordEmail" @click="handlePasswordUpdate">{{ sendingPasswordEmail ? 'Sending…' : passwordLinkRequested ? 'Resend password change link' : 'Send password change link' }}</button>
				<p v-if="passwordMessage" :class="passwordMessageKind">{{ passwordMessage }}</p>
			</div>
		</details>

      <div class="profile-actions">
        <button @click="handleLogout" class="btn-logout">Logout</button>
      </div>
    </div>

    <div v-else class="loading">Loading profile...</div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { AuthApiError, requestPasswordChange } from '@/api/auth'

const router = useRouter()
const { currentUser, logout } = useAuth()
const sendingPasswordEmail=ref(false),passwordLinkRequested=ref(false),passwordMessage=ref(''),passwordMessageKind=ref('password-success')

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
async function handlePasswordUpdate(){passwordMessage.value='';sendingPasswordEmail.value=true;try{await requestPasswordChange();passwordLinkRequested.value=true;passwordMessageKind.value='password-success';passwordMessage.value=`Password change link sent to ${currentUser.value?.email}. You can stay on this page while you check your email.`}catch(e){passwordMessageKind.value='password-error';passwordMessage.value=e instanceof AuthApiError?e.message:'Unable to send the email.'}finally{sendingPasswordEmail.value=false}}
</script>

<style scoped>
.profile-view {
  max-width: 800px;
  margin: 0 auto;
  padding: 0;
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
  border: 1px solid var(--fc-line);
  border-radius: var(--fc-radius-card);
  padding: 2rem;
  box-shadow: none;
}

.profile-avatar {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: var(--fc-ink);
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
.advanced-settings{margin-top:1.25rem;border-top:1px solid var(--fc-line);padding-top:1rem}.advanced-settings summary{cursor:pointer;color:var(--color-text-secondary);font-weight:500}.advanced-content{padding:1rem 0 0;max-width:560px}.advanced-content h2{font-size:1.1rem;margin-bottom:.35rem}.advanced-content p{color:var(--color-text-secondary);font-size:.875rem}.btn-update-password{padding:.65rem .9rem;border:1px solid var(--color-border);border-radius:var(--radius-md);background:white;color:var(--fc-ink);cursor:pointer}.password-success{color:#16794a!important}.password-error{color:#b42318!important}

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
