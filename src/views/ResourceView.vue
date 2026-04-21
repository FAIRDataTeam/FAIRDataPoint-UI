<script setup lang="ts">
import { computed, watchEffect, ref } from 'vue'
import { useRoute } from 'vue-router'
import { fetchRdf, flattenGraph, getFirstLiteral, compactUri } from '@/composables/rdfUtils'
import type { RdfNode, RdfValue } from '@/composables/rdfUtils'
import { DCT_TITLE, DCT_DESCRIPTION } from '@/composables/vocabularies'

const route = useRoute()

const resourceUri = computed(() => {
  const base = import.meta.env.VITE_FDP_BASE_URL.replace(/\/$/, '')
  const { resourceType, id } = route.params
  if (resourceType && id) return `${base}/${resourceType}/${id}`
  return base
})

const loading = ref(false)
const error = ref<string | null>(null)
const node = ref<RdfNode | null>(null)

watchEffect(async () => {
  loading.value = true
  error.value = null
  node.value = null

  try {
    const { nodes } = await fetchRdf(resourceUri.value)
    const graph = flattenGraph(nodes)
    node.value = graph.find((n) => n['@id'] === resourceUri.value) ?? graph[0] ?? null
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unknown error'
  } finally {
    loading.value = false
  }
})

const title = computed(() => getFirstLiteral(node.value, DCT_TITLE))
const description = computed(() => getFirstLiteral(node.value, DCT_DESCRIPTION))

const SKIP_KEYS = new Set(['@id', '@type', '@graph'])

const metadataRows = computed(() => {
  if (!node.value) return []
  return Object.keys(node.value)
    .filter((key) => !SKIP_KEYS.has(key))
    .map((predicate) => ({
      predicate,
      label: compactUri(predicate),
      values: (node.value![predicate] as RdfValue[]).flatMap((v) => {
        if (typeof v['@value'] === 'string') return [v['@value']]
        if (typeof v['@id'] === 'string') return [v['@id']]
        return []
      }),
    }))
    .filter((row) => row.values.length > 0)
})
</script>

<template>
  <main class="page-container">
    <p v-if="loading">Loading…</p>
    <p v-else-if="error">Error: {{ error }}</p>
    <template v-else-if="node">
      <h1 v-if="title">{{ title }}</h1>
      <p v-if="description">{{ description }}</p>
      <section v-if="metadataRows.length > 0" class="metadata-table">
        <div v-for="row in metadataRows" :key="row.predicate" class="metadata-row">
          <div class="metadata-label">{{ row.label }}</div>
          <div class="metadata-value">
            <div v-for="value in row.values" :key="value">{{ value }}</div>
          </div>
        </div>
      </section>
    </template>
  </main>
</template>
