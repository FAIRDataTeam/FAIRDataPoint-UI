<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useRoute } from 'vue-router'
import { internalHref } from '../composables/urlUtils'
import { searchResources } from '../composables/fdpApi'

type SearchResult = {
  uri: string
  types: string[]
  title: string | null
  description: string | null
}

const route = useRoute()

const results = ref<SearchResult[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const query = computed(() => (route.query.q as string) ?? '')

// Every FDP resource is also typed as dcat:Resource (the common superclass), so that type
// is skipped to show the more specific label (e.g. 'Dataset', 'Catalog', 'Distribution').
function resourceTypeLabel(types: string[]): string {
  for (const t of types) {
    const local = t.split(/[/#]/).pop() ?? ''
    if (local && local !== 'Resource') return local
  }
  return 'Resource'
}

async function search(q: string) {
  if (!q.trim()) {
    results.value = []
    return
  }
  loading.value = true
  error.value = null
  try {
    results.value = (await searchResources(q)) as SearchResult[]
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Search failed'
  } finally {
    loading.value = false
  }
}

watch(query, (q) => void search(q), { immediate: true })
</script>

<template>
  <div class="search-page">
    <h1 class="search-page__heading">
      Search results <span v-if="query">for "{{ query }}"</span>
    </h1>

    <p v-if="loading" class="search-page__status">Searching…</p>
    <p v-else-if="error" class="search-page__status search-page__status--error">{{ error }}</p>
    <p v-else-if="!query" class="search-page__status">Enter a query in the search bar above.</p>
    <p v-else-if="results.length === 0" class="search-page__status">No results found.</p>

    <ul v-else class="search-results">
      <li v-for="result in results" :key="result.uri" class="search-result">
        <span class="search-result__type">{{ resourceTypeLabel(result.types) }}</span>
        <RouterLink :to="internalHref(result.uri)" class="search-result__title">
          {{ result.title ?? result.uri }}
        </RouterLink>
        <p v-if="result.description" class="search-result__description">
          {{ result.description }}
        </p>
      </li>
    </ul>
  </div>
</template>
