<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useResourceView } from '../composables/useResourceView'
import { useMeta } from '../composables/useMeta'
import { useShapeForm } from '../composables/shapeForm'
import { buildResourceGraph } from '../composables/shapeGraph'
import { serializeTurtle } from '../composables/rdfUtils'
import { putResource } from '../composables/fdpApi'
import { internalHref } from '../composables/urlUtils'
import ShapeFormFields from '../components/ShapeFormFields.vue'

const router = useRouter()
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
const { canEdit, loading: accessLoading, error: accessError } = useMeta(resource)

const saving = ref(false)
const saveError = ref<string | null>(null)

/** Rebuilds the resource's graph from the form state and saves it, then returns to the view page. */
async function save() {
  if (
    saving.value ||
    !currentNodeUri.value ||
    !canEdit.value ||
    accessLoading.value ||
    accessError.value ||
    loading.value ||
    shapesLoading.value ||
    error.value ||
    shapesError.value
  )
    return
  saveError.value = null
  saving.value = true
  try {
    const graph = buildResourceGraph(
      quads.value,
      currentNodeUri.value,
      editableFields.value,
      formValues.value,
    )
    await putResource(resource.value, await serializeTurtle(graph))
    await router.push(backTo.value)
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : 'Unable to save changes.'
  } finally {
    saving.value = false
  }
}
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

      <p v-if="loading || shapesLoading || accessLoading">Loading…</p>
      <p v-else-if="error || shapesError || accessError" class="alert alert-danger">
        Error: {{ error || shapesError || accessError }}
      </p>
      <p v-else-if="!canEdit" class="alert alert-danger">You cannot edit this resource.</p>

      <template v-else>
        <p v-if="saveError" class="alert alert-danger" role="alert">{{ saveError }}</p>

        <form v-if="editableFields.length > 0" @submit.prevent="save">
          <fieldset class="user-form__fields" :disabled="saving" aria-label="Resource details">
            <ShapeFormFields :fields="editableFields" :values="formValues" />
            <div class="action-row">
              <button type="submit" class="user-form__btn" :disabled="saving">
                {{ saving ? 'Saving…' : 'Save' }}
              </button>
            </div>
          </fieldset>
        </form>
        <p v-else>No editable fields are declared for this resource.</p>
      </template>

      <router-link :to="backTo" class="text-link">Cancel</router-link>
    </main>
  </div>
</template>
