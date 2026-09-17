<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const resourceType = computed(() => route.params.resourceType as string | undefined)
const backTo = computed(() =>
  resourceType.value
    ? { name: 'resource', params: { resourceType: resourceType.value, id: route.params.id } }
    : { name: 'fdp-root' },
)
</script>

<template>
  <main class="page-container">
    <h1>Edit {{ resourceType ?? 'FAIR Data Point' }}</h1>
    <p>Editing is not implemented yet.</p>
    <router-link :to="backTo" class="text-link">Cancel</router-link>
  </main>
</template>
