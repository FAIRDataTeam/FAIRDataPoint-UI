<script setup lang="ts">
import { computed } from 'vue'
import { useResourceView } from '../composables/useResourceView'
import { useShapeForm } from '../composables/shapeForm'
import { internalHref } from '../composables/urlUtils'
import ShapeFormFields from '../components/ShapeFormFields.vue'

const {
  resource,
  quads,
  title,
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

const formValues = useShapeForm(quads, currentNodeUri, editableFields)
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
      <h1 class="user-form__title">
        Edit {{ title ?? resource?.resourceType ?? 'FAIR Data Point' }}
      </h1>

      <p v-if="loading || shapesLoading">Loading…</p>
      <p v-else-if="error || shapesError" class="alert alert-danger">
        Error: {{ error || shapesError }}
      </p>

      <template v-else>
        <p class="user-form__note">Saving is not implemented yet.</p>

        <form v-if="editableFields.length > 0" @submit.prevent>
          <ShapeFormFields :fields="editableFields" :values="formValues" />
        </form>
        <p v-else>No editable fields are declared for this resource.</p>
      </template>

      <router-link :to="backTo" class="text-link">Cancel</router-link>
    </main>
  </div>
</template>
