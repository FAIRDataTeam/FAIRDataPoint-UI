<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { fetchUsers, deleteUser as apiDeleteUser } from '../composables/fdpApi'
import { avatarColor } from '../composables/useAuth'
import type { User } from '../composables/useAuth'
import IconTrash from '../assets/icons/trash.svg?component'

const users = ref<User[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

/** Two-letter initials shown in the list avatar, e.g. "Albert Einstein" -> "AE". */
function nameInitials(user: User): string {
  return ((user.firstName[0] ?? '') + (user.lastName[0] ?? '')).toUpperCase()
}

/**
 * Fetches all users from the API and sorts them alphabetically by full name,
 * e.g. "Albert Einstein" before "Nikola Tesla".
 * */
async function loadUsers() {
  loading.value = true
  error.value = null
  try {
    const data = await fetchUsers()
    users.value = [...(data as User[])].sort((a, b) =>
      `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`),
    )
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unable to get users.'
  } finally {
    loading.value = false
  }
}

/** Deletes a user (after confirmation) and refreshes the list. */
async function handleDelete(user: User) {
  if (!window.confirm(`Are you sure you want to delete ${user.firstName} ${user.lastName}?`)) return
  try {
    await apiDeleteUser(user.uuid)
    await loadUsers()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unable to delete user.'
  }
}

onMounted(loadUsers)
</script>

<template>
  <main class="page-container">
    <div class="users-header">
      <h1 class="users-title">Users</h1>
      <RouterLink to="/users/create" class="users-create-link">+ Create user</RouterLink>
    </div>

    <p v-if="loading">Loading…</p>
    <p v-else-if="error" class="alert alert-danger">{{ error }}</p>

    <ul v-else class="user-list">
      <li v-for="user in users" :key="user.uuid" class="user-list__item">
        <div class="user-list__avatar" :style="{ background: avatarColor(user.email) }">
          {{ nameInitials(user) }}
        </div>
        <div class="user-list__info">
          <div class="user-list__name">
            <RouterLink :to="`/users/${user.uuid}`"
              >{{ user.firstName }} {{ user.lastName }}</RouterLink
            >
            <span class="role-badge">{{ user.role }}</span>
          </div>
          <div class="user-list__email">{{ user.email }}</div>
        </div>
        <div class="user-list__actions">
          <button class="user-list__delete" data-tooltip="Remove" @click="handleDelete(user)">
            <IconTrash />
          </button>
        </div>
      </li>
    </ul>
  </main>
</template>
