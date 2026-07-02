<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useAuth, avatarColor, userInitials } from '../composables/useAuth'
import IconUsers from '../assets/icons/users.svg?component'
import IconUserEdit from '../assets/icons/user-edit.svg?component'
import IconLogOut from '../assets/icons/log-out.svg?component'
import IconChevronDown from '../assets/icons/chevron-down.svg?component'

const { isAdmin, userEmail, user, logout } = useAuth()
const router = useRouter()

const menuOpen = ref(false)
const menuEl = ref<HTMLElement | null>(null)

function handleLogout() {
  menuOpen.value = false
  logout()
  void router.push('/')
}

function onDocumentClick(e: MouseEvent) {
  if (menuEl.value && !menuEl.value.contains(e.target as Node)) {
    menuOpen.value = false
  }
}

function onEsc(e: KeyboardEvent) {
  if (e.key === 'Escape') menuOpen.value = false
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onEsc)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onEsc)
})
</script>

<template>
  <div ref="menuEl" class="user-menu">
    <button
      type="button"
      class="user-menu__trigger"
      :aria-expanded="menuOpen"
      aria-haspopup="true"
      @click="menuOpen = !menuOpen"
    >
      <span class="user-menu__avatar-stack">
        <span
          class="user-avatar"
          :style="{ background: userEmail ? avatarColor(userEmail) : undefined }"
          >{{ userInitials(userEmail) }}</span
        >
        <span v-if="isAdmin" class="user-menu__role">ADMIN</span>
      </span>
      <IconChevronDown class="user-menu__chevron" />
    </button>

    <div v-if="menuOpen" class="user-dropdown">
      <template v-if="isAdmin">
        <div class="user-dropdown__section-header">FAIR Data Point</div>
        <RouterLink to="/users" class="user-dropdown__item" @click="menuOpen = false">
          <IconUsers />
          Users
        </RouterLink>
        <hr class="user-dropdown__divider" />
      </template>
      <div class="user-dropdown__section-header">
        {{ user ? `${user.firstName} ${user.lastName}` : userEmail }}
      </div>
      <RouterLink to="/users/current" class="user-dropdown__item" @click="menuOpen = false">
        <IconUserEdit />
        Edit profile
      </RouterLink>
      <button type="button" class="user-dropdown__item" @click="handleLogout">
        <IconLogOut />
        Log out
      </button>
    </div>
  </div>
</template>
