<script setup lang="ts">
import { computed, watch, watchEffect, ref } from 'vue'
import { useRoute } from 'vue-router'
import { fetchRdf, flattenGraph, getFirstLiteral, getIdValues, compactUri, internalHref } from '@/composables/rdfUtils'
import type { RdfNode, RdfValue } from '@/composables/rdfUtils'
import { DCT_TITLE, DCT_DESCRIPTION, LDP_CONTAINS } from '@/composables/vocabularies'

const route = useRoute()

const resourceUri = computed(() => {
  const base = import.meta.env.VITE_FDP_BASE_URL.replace(/\/$/, '')
  const { resourceType, id } = route.params
  if (resourceType && id) return `${base}/${resourceType}/${id}`
  return base
})

type ChildSummary = {
  title: string | null
  description: string | null
  type: string | null
}

const loading = ref(false)
const error = ref<string | null>(null)
const node = ref<RdfNode | null>(null)
const graph = ref<RdfNode[]>([])
const childSummaries = ref<Record<string, ChildSummary>>({})

watchEffect(async () => {
  loading.value = true
  error.value = null
  node.value = null
  graph.value = []
  childSummaries.value = {}

  try {
    const { nodes } = await fetchRdf(resourceUri.value)
    graph.value = flattenGraph(nodes)
    node.value = graph.value.find((n) => n['@id'] === resourceUri.value) ?? graph.value[0] ?? null
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

const children = computed(() => graph.value.flatMap((n) => getIdValues(n, LDP_CONTAINS)))

watch(
  children,
  async (uris) => {
    for (const uri of uris) {
      if (childSummaries.value[uri]) continue
      try {
        const { nodes } = await fetchRdf(uri)
        const g = flattenGraph(nodes)
        const n = g.find((x) => x['@id'] === uri) ?? g[0] ?? null
        childSummaries.value[uri] = {
          title: getFirstLiteral(n, DCT_TITLE),
          description: getFirstLiteral(n, DCT_DESCRIPTION),
          type: Array.isArray(n?.['@type']) ? ((n['@type'] as string[])[0] ?? null) : null,
        }
      } catch {
        // ignore
      }
    }
  },
  { immediate: true },
)

const childSections = computed(() => {
  const sections = new Map<string, string[]>()
  for (const uri of children.value) {
    const summary = childSummaries.value[uri]
    if (!summary) continue
    const label = summary.type
      ? (compactUri(summary.type).split(':').pop() ?? summary.type)
      : 'Resource'
    if (!sections.has(label)) sections.set(label, [])
    sections.get(label)!.push(uri)
  }
  return [...sections.entries()].map(([label, uris]) => ({ label, uris }))
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

      <section v-for="section in childSections" :key="section.label" class="child-section">
        <h2 class="section-title">{{ section.label }}</h2>
        <div class="child-list">
          <article v-for="uri in section.uris" :key="uri" class="child-card">
            <RouterLink :to="internalHref(uri)" class="child-card__title">
              {{ childSummaries[uri]?.title ?? uri }}
            </RouterLink>
            <p v-if="childSummaries[uri]?.description" class="child-card__description">
              {{ childSummaries[uri].description }}
            </p>
          </article>
        </div>
      </section>
    </template>
  </main>
</template>
