<script setup lang="ts">
import { isValidEmail } from '../composables/formUtils'

const firstName = defineModel<string>('firstName', { required: true })
const lastName = defineModel<string>('lastName', { required: true })
const email = defineModel<string>('email', { required: true })
const role = defineModel<string>('role', { required: true })

defineProps<{ submitted: boolean }>()
</script>

<template>
  <div
    class="user-form__group"
    :class="{ 'user-form__group--error': submitted && !firstName.trim() }"
  >
    <label for="uf-first-name">First name</label>
    <input id="uf-first-name" v-model="firstName" />
    <p v-if="submitted && !firstName.trim()" class="user-form__invalid">Field is required.</p>
  </div>
  <div
    class="user-form__group"
    :class="{ 'user-form__group--error': submitted && !lastName.trim() }"
  >
    <label for="uf-last-name">Last name</label>
    <input id="uf-last-name" v-model="lastName" />
    <p v-if="submitted && !lastName.trim()" class="user-form__invalid">Field is required.</p>
  </div>
  <div
    class="user-form__group"
    :class="{
      'user-form__group--error': submitted && (!email.trim() || !isValidEmail(email)),
    }"
  >
    <label for="uf-email">Email</label>
    <input id="uf-email" v-model="email" type="email" />
    <p v-if="submitted && !email.trim()" class="user-form__invalid">Field is required.</p>
    <p v-else-if="submitted && !isValidEmail(email)" class="user-form__invalid">
      This is not a valid email.
    </p>
  </div>
  <div class="user-form__group">
    <label for="uf-role">Role</label>
    <select id="uf-role" v-model="role">
      <option value="USER">USER</option>
      <option value="ADMIN">ADMIN</option>
    </select>
  </div>
</template>
