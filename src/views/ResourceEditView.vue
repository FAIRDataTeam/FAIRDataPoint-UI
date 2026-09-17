<script setup lang="ts">
import { computed } from 'vue'
import { useResourceView } from '../composables/useResourceView'
import { predicateLabel } from '../composables/shaclFallback'
import { compactUri } from '../composables/rdfUtils'
import { internalHref } from '../composables/urlUtils'

const {
  resource,
  currentNodeUri,
  breadcrumbs,
  loading,
  error,
  shapesLoading,
  shapesError,
  editableFields,
} = useResourceView({
  loadChildSummaries: false,
})

const backTo = computed(() =>
  resource.value ? { name: 'resource', params: resource.value } : { name: 'fdp-root' },
)

const fieldLabel = (field: { label: string | null; path: string }) =>
  field.label ?? predicateLabel(field.path)

const cardinality = (field: { minCount: number | null; maxCount: number | null }) =>
  `${field.minCount ?? 0}..${field.maxCount ?? '*'}`
</script>

<template>
  <div>
    <nav v-if="currentNodeUri" class="breadcrumbs" aria-label="Breadcrumb">
      <div class="breadcrumbs__inner">
        <template v-for="item in breadcrumbs" :key="item.uri">
          <router-link :to="internalHref(item.uri)" class="breadcrumb-link">{{
            item.text
          }}</router-link>
          <span class="breadcrumb-sep">/</span>
        </template>
        <span class="breadcrumb-current" aria-current="page">Edit</span>
      </div>
    </nav>
    <main class="page-container">
      <h1>Edit {{ resource?.resourceType ?? 'FAIR Data Point' }}</h1>

      <p v-if="loading || shapesLoading">Loading…</p>
      <p v-else-if="error || shapesError" class="alert alert-danger">
        Error: {{ error || shapesError }}
      </p>

      <template v-else>
        <p>Editing is not implemented yet. The shape offers these fields:</p>

        <section v-if="editableFields.length > 0" class="metadata-table">
          <div v-for="field in editableFields" :key="field.path" class="metadata-row">
            <div class="metadata-label">
              {{ fieldLabel(field) }}
              <span
                v-if="(field.minCount ?? 0) > 0"
                class="editable-field__required"
                aria-label="required"
                >*</span
              >
            </div>
            <div class="metadata-value">
              {{ compactUri(field.editor) }}
              <span class="editable-field__meta">{{ cardinality(field) }}</span>
            </div>
          </div>
        </section>
        <p v-else>No editable fields are declared for this resource.</p>
      </template>

      <router-link :to="backTo" class="text-link">Cancel</router-link>
    </main>
  </div>
</template>
