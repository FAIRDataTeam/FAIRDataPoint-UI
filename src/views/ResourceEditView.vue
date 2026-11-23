<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useResourceView } from '../composables/useResourceView'
import { useMeta } from '../composables/useMeta'
import { internalHref } from '../composables/urlUtils'

const { loading, error, resource, resourceUri, title, breadcrumbs, resourceLabel } =
  useResourceView()
const { canEdit, loaded, error: metaError } = useMeta(resource)
const router = useRouter()

const resourcePath = computed(() => internalHref(resourceUri.value))

// Without edit access, go back to the resource, as the legacy client does.
watch(
  [loaded, canEdit],
  ([isLoaded, allowed]) => {
    if (isLoaded && !allowed) void router.replace(resourcePath.value)
  },
  { immediate: true },
)
</script>

<template>
  <div>
    <nav v-if="breadcrumbs.length > 0" class="breadcrumbs" aria-label="Breadcrumb">
      <div class="breadcrumbs__inner">
        <template v-for="item in breadcrumbs" :key="item.uri">
          <router-link :to="internalHref(item.uri)" class="breadcrumb-link">{{
            item.text
          }}</router-link>
          <span class="breadcrumb-sep">/</span>
        </template>
        <span class="breadcrumb-current">Edit</span>
      </div>
    </nav>

    <main class="page-container">
      <p v-if="error || metaError" class="alert alert-danger">Error: {{ error ?? metaError }}</p>
      <p v-else-if="loading || !loaded">Loading…</p>
      <template v-else>
        <h1 class="resource-title">Edit {{ title ?? resourceLabel(resourceUri) }}</h1>
        <p>Editing is not implemented yet.</p>
      </template>
      <router-link :to="resourcePath" class="text-link">Cancel</router-link>
    </main>
  </div>
</template>
