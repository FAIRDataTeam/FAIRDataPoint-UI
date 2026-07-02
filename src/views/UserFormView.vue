<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { fetchUser, createUser, updateUser, updateUserPassword } from '../composables/fdpApi'
import { useAuth, type User } from '../composables/useAuth'
import UserProfileFields from '../components/UserProfileFields.vue'
import { isValidEmail } from '../composables/formUtils'

const route = useRoute()
const router = useRouter()
const { updateCurrentUser } = useAuth()

const isCreate = computed(() => route.name === 'user-create')
const isSelf = computed(() => route.name === 'user-profile')
const userId = computed(() => (route.params.id as string | undefined) ?? 'current')

const loading = ref(false)
const loadError = ref<string | null>(null)

// Fields mirror UserCreateDTO / UserChangeDTO from the backend.
// Role accepts only values defined in the backend's UserRole enum: ADMIN, USER.
const firstName = ref('')
const lastName = ref('')
const email = ref('')
const role = ref('USER')

const profileSaving = ref(false)
const profileError = ref<string | null>(null)
const profileSuccess = ref<string | null>(null)
const profileSubmitted = ref(false)

const newPassword = ref('')
const passwordConfirm = ref('')
const passwordSaving = ref(false)
const passwordError = ref<string | null>(null)
const passwordSuccess = ref<string | null>(null)
const passwordSubmitted = ref(false)

const savedName = ref('')
const savedUuid = ref('')
const pageTitle = computed(() => (isCreate.value ? 'Create user' : savedName.value || '…'))

async function loadUser() {
  loading.value = true
  loadError.value = null
  try {
    const u = (await fetchUser(userId.value)) as User
    firstName.value = u.firstName
    lastName.value = u.lastName
    email.value = u.email
    role.value = u.role
    savedName.value = `${u.firstName} ${u.lastName}`
    savedUuid.value = u.uuid
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : 'Unable to load user.'
  } finally {
    loading.value = false
  }
}

async function submitCreate() {
  profileSubmitted.value = true
  if (
    !firstName.value.trim() ||
    !lastName.value.trim() ||
    !email.value.trim() ||
    !isValidEmail(email.value) ||
    !newPassword.value ||
    newPassword.value !== passwordConfirm.value
  )
    return
  profileError.value = null
  profileSaving.value = true
  try {
    await createUser({
      firstName: firstName.value,
      lastName: lastName.value,
      email: email.value,
      role: role.value,
      password: newPassword.value,
    })
    await router.push('/users')
  } catch (err) {
    profileError.value = err instanceof Error ? err.message : 'Unable to create user.'
  } finally {
    profileSaving.value = false
  }
}

async function submitProfile() {
  profileSubmitted.value = true
  if (
    !firstName.value.trim() ||
    !lastName.value.trim() ||
    !email.value.trim() ||
    !isValidEmail(email.value)
  )
    return
  profileError.value = null
  profileSuccess.value = null
  profileSaving.value = true
  try {
    await updateUser(userId.value, {
      firstName: firstName.value,
      lastName: lastName.value,
      email: email.value,
      role: role.value,
    })
    savedName.value = `${firstName.value} ${lastName.value}`
    if (isSelf.value) {
      updateCurrentUser({
        uuid: savedUuid.value,
        firstName: firstName.value,
        lastName: lastName.value,
        email: email.value,
        role: role.value,
      })
    }
    profileSuccess.value = 'User profile was successfully updated!'
  } catch (err) {
    profileError.value = err instanceof Error ? err.message : 'Unable to update profile.'
  } finally {
    profileSaving.value = false
  }
}

async function submitPassword() {
  passwordSubmitted.value = true
  if (!newPassword.value || newPassword.value !== passwordConfirm.value) return
  passwordError.value = null
  passwordSuccess.value = null
  passwordSaving.value = true
  try {
    await updateUserPassword(userId.value, newPassword.value)
    newPassword.value = ''
    passwordConfirm.value = ''
    passwordSubmitted.value = false
    passwordSuccess.value = 'Password was successfully updated!'
  } catch (err) {
    passwordError.value = err instanceof Error ? err.message : 'Unable to update password.'
  } finally {
    passwordSaving.value = false
  }
}

onMounted(() => {
  if (!isCreate.value) void loadUser()
})
</script>

<template>
  <nav v-if="!isSelf" class="breadcrumbs" aria-label="Breadcrumb">
    <div class="breadcrumbs__inner">
      <RouterLink to="/users" class="breadcrumb-link">Users</RouterLink>
      <span class="breadcrumb-sep">/</span>
      <span class="breadcrumb-current">{{ pageTitle }}</span>
    </div>
  </nav>

  <main class="page-container">
    <h1 class="user-form__title">{{ pageTitle }}</h1>

    <p v-if="loading">Loading…</p>
    <p v-else-if="loadError" class="alert alert-danger">{{ loadError }}</p>

    <form v-else-if="isCreate" @submit.prevent="submitCreate">
      <p v-if="profileError" class="alert alert-danger">{{ profileError }}</p>

      <UserProfileFields
        v-model:firstName="firstName"
        v-model:lastName="lastName"
        v-model:email="email"
        v-model:role="role"
        :submitted="profileSubmitted"
      />
      <div
        class="user-form__group"
        :class="{ 'user-form__group--error': profileSubmitted && !newPassword }"
      >
        <label for="uf-password">Password</label>
        <input id="uf-password" v-model="newPassword" type="password" />
        <p v-if="profileSubmitted && !newPassword" class="user-form__invalid">Field is required.</p>
      </div>
      <div
        class="user-form__group"
        :class="{ 'user-form__group--error': profileSubmitted && newPassword !== passwordConfirm }"
      >
        <label for="uf-password-confirm">Confirm password</label>
        <input id="uf-password-confirm" v-model="passwordConfirm" type="password" />
        <p v-if="profileSubmitted && newPassword !== passwordConfirm" class="user-form__invalid">
          Passwords don't match.
        </p>
      </div>

      <button type="submit" class="user-form__btn" :disabled="profileSaving">
        {{ profileSaving ? 'Creating…' : 'Create user' }}
      </button>
    </form>

    <template v-else>
      <section class="user-form__section">
        <h2 class="user-form__section-title">Profile</h2>
        <form @submit.prevent="submitProfile">
          <p v-if="profileError" class="alert alert-danger">{{ profileError }}</p>
          <p v-if="profileSuccess" class="user-form__success">{{ profileSuccess }}</p>

          <UserProfileFields
            v-model:firstName="firstName"
            v-model:lastName="lastName"
            v-model:email="email"
            v-model:role="role"
            :submitted="profileSubmitted"
            :hide-role="isSelf"
          />

          <button type="submit" class="user-form__btn" :disabled="profileSaving">
            {{ profileSaving ? 'Saving…' : 'Save profile' }}
          </button>
        </form>
      </section>

      <section class="user-form__section">
        <h2 class="user-form__section-title">Password</h2>
        <form @submit.prevent="submitPassword">
          <p v-if="passwordError" class="alert alert-danger">{{ passwordError }}</p>
          <p v-if="passwordSuccess" class="user-form__success">{{ passwordSuccess }}</p>

          <div
            class="user-form__group"
            :class="{ 'user-form__group--error': passwordSubmitted && !newPassword }"
          >
            <label for="uf-new-password">New password</label>
            <input id="uf-new-password" v-model="newPassword" type="password" />
            <p v-if="passwordSubmitted && !newPassword" class="user-form__invalid">
              Field is required.
            </p>
          </div>
          <div
            class="user-form__group"
            :class="{
              'user-form__group--error': passwordSubmitted && newPassword !== passwordConfirm,
            }"
          >
            <label for="uf-password-confirm">Confirm password</label>
            <input id="uf-password-confirm" v-model="passwordConfirm" type="password" />
            <p
              v-if="passwordSubmitted && newPassword !== passwordConfirm"
              class="user-form__invalid"
            >
              Passwords don't match.
            </p>
          </div>

          <button type="submit" class="user-form__btn" :disabled="passwordSaving">
            {{ passwordSaving ? 'Updating…' : 'Update password' }}
          </button>
        </form>
      </section>
    </template>
  </main>
</template>
