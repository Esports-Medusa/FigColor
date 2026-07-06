<template>
  <div class="access-denied">
    <div class="content">
      <h1>Access Denied</h1>
      <p>You don't have permission to access this page.</p>
      <p class="hint">Only admin users can access the admin dashboard.</p>
      <button class="btn" @click="router.push('/')">Go to Homepage</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<style scoped>
.access-denied {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f9fafb;
}

.content {
  text-align: center;
  padding: 2rem;
}

h1 {
  font-size: 2rem;
  font-weight: 700;
  color: #1a1a1a;
  margin-bottom: 0.5rem;
}

p {
  color: #6b7280;
  margin-bottom: 0.5rem;
}

.hint {
  font-size: 0.875rem;
  color: #9ca3af;
  margin-bottom: 1.5rem;
}

.btn {
  padding: 0.625rem 1.25rem;
  background: #2563eb;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: pointer;
}

.btn:hover {
  background: #1d4ed8;
}
</style>