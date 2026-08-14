<template>
  <div class="register-view">
    <div class="auth-card">
      <h1 class="auth-title">Create Account</h1>
      <p class="auth-subtitle">Join FigColor to manage your color palettes</p>

      <form @submit.prevent="handleRegister" class="auth-form">
        <div class="form-group">
          <label for="name">Name (optional)</label>
          <input
            id="name"
            v-model="name"
            type="text"
            placeholder="Your name"
            autocomplete="name"
          />
        </div>

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
			<div class="password-input"><input
            id="password"
            v-model="password"
			:type="showPassword ? 'text' : 'password'"
			placeholder="At least 8 characters"
            required
			minlength="8"
			maxlength="128"
            autocomplete="new-password"
			/><button type="button" class="show-password" @click="showPassword=!showPassword">{{ showPassword ? 'Hide' : 'Show' }}</button></div>
        </div>
		<div class="form-group"><label for="confirm-password">Confirm password</label><input id="confirm-password" v-model="confirmPassword" :type="showPassword ? 'text' : 'password'" required autocomplete="new-password" /></div>

		<div class="form-hint" :class="{valid: passwordValid}">At least 8 characters, including a letter and a number.</div>
		<div v-if="confirmPassword && password !== confirmPassword" class="field-error">Passwords do not match.</div>

        <div v-if="error" class="error-message">
          {{ error }}
        </div>

        <button type="submit" class="btn-primary" :disabled="isLoading">
          {{ isLoading ? 'Creating account...' : 'Create Account' }}
        </button>
      </form>

      <div class="auth-footer">
        <p>
          Already have an account?
          <router-link to="/login" class="auth-link">Sign In</router-link>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'

const router = useRouter()
const { register, isLoading, error } = useAuth()

const name = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const passwordValid = computed(() => password.value.length >= 8 && password.value.length <= 128 && /[a-zA-Z]/.test(password.value) && /[0-9]/.test(password.value))

async function handleRegister() {
	if (!passwordValid.value || password.value !== confirmPassword.value) return

  try {
		await register(email.value, password.value, confirmPassword.value, name.value || undefined)
		router.push({path:'/verify-email/pending',query:{email:email.value.trim().toLowerCase()}})
  } catch (e) {
    // Error is handled by useAuth
  }
}
</script>

<style scoped>
.register-view {
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

.form-hint {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  margin-top: -0.5rem;
}
.form-hint.valid { color: #16794a; }
.field-error { color:#b42318;font-size:.8rem; }
.password-input { display:flex;position:relative; }
.password-input input { width:100%;padding-right:4rem; }
.show-password { position:absolute;right:.5rem;top:.45rem;border:0;background:none;color:var(--color-primary);cursor:pointer; }

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
  margin-top: 0.5rem;
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
</style>
