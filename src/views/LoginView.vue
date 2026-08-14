<template>
  <div class="login-view">
    <div class="auth-card">
      <h1 class="auth-title">Welcome Back</h1>
      <p class="auth-subtitle">Sign in to your FigColor account</p>
      <div v-if="passwordChanged" class="success-message">Your password has been changed. Sign in with your new password.</div>

      <form @submit.prevent="handleLogin" class="auth-form">
        <div class="form-group">
          <label for="email">Email</label>
          <input
            id="email"
            v-model="email"
            type="email"
            placeholder="you@example.com"
            required
            autocomplete="email"
          />
        </div>

        <div class="form-group">
          <label for="password">Password</label>
          <input
            id="password"
            v-model="password"
            type="password"
            placeholder="Your password"
            required
            autocomplete="current-password"
          />
			<router-link to="/forgot-password" class="forgot-link">Forgot password?</router-link>
        </div>

        <div v-if="error" class="error-message">
          {{ error }}
			<button v-if="emailNotVerified" type="button" class="resend-link" @click="handleResend">Resend verification email</button>
        </div>
		<div v-if="resent" class="success-message">If the account exists, a verification email has been sent.</div>

        <button type="submit" class="btn-primary" :disabled="isLoading">
          {{ isLoading ? 'Signing in...' : 'Sign In' }}
        </button>
      </form>

      <div class="auth-footer">
        <p>
          Don't have an account?
          <router-link to="/register" class="auth-link">Sign Up</router-link>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { AuthApiError, resendVerification } from '@/api/auth'

const router = useRouter()
const route = useRoute()
const { login, isLoading, error } = useAuth()

const email = ref('')
const password = ref('')
const emailNotVerified = ref(false)
const resent = ref(false)
const passwordChanged = route.query.passwordChanged === '1'

async function handleLogin() {
  try {
		emailNotVerified.value = false
    await login(email.value, password.value)
    router.push('/')
	} catch (e) {
		emailNotVerified.value = e instanceof AuthApiError && e.code === 'EMAIL_NOT_VERIFIED'
    // Error is handled by useAuth
  }
}
async function handleResend(){ await resendVerification(email.value); resent.value=true }
</script>

<style scoped>
.login-view {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 60vh;
  padding: 2rem;
}

.auth-card {
  background: white;
  border-radius: var(--radius-lg);
  padding: 2rem;
  box-shadow: var(--shadow-lg);
  width: 100%;
  max-width: 400px;
}

.auth-title {
  font-size: 1.75rem;
  margin-bottom: 0.5rem;
  text-align: center;
}

.auth-subtitle {
  color: var(--color-text-secondary);
  text-align: center;
  margin-bottom: 1.5rem;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-group label {
  font-weight: 500;
  font-size: 0.875rem;
}

.form-group input {
  padding: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 1rem;
}

.form-group input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(0, 102, 204, 0.1);
}

.btn-primary {
  background: var(--color-primary);
  color: white;
  border: none;
  padding: 0.875rem;
  border-radius: var(--radius-md);
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-primary:hover:not(:disabled) {
  background: var(--color-primary-dark);
}

.btn-primary:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.error-message {
  color: #dc3545;
  font-size: 0.875rem;
  padding: 0.75rem;
  background: #f8d7da;
  border-radius: var(--radius-md);
}

.auth-footer {
  margin-top: 1.5rem;
  text-align: center;
  color: var(--color-text-secondary);
}

.auth-link {
  color: var(--color-primary);
  text-decoration: none;
  font-weight: 500;
}

.auth-link:hover {
  text-decoration: underline;
}
.forgot-link { align-self:flex-end;font-size:.8rem;color:var(--color-primary);text-decoration:none; }
.resend-link { display:block;margin-top:.5rem;border:0;background:none;color:var(--color-primary);padding:0;cursor:pointer; }
.success-message { color:#16794a;background:#ecfdf3;padding:.75rem;border-radius:var(--radius-md);font-size:.875rem; }
</style>
