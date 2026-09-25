<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useResourceView } from '../composables/useResourceView'
import { useMeta } from '../composables/useMeta'
import {
  isNestedField,
  useShapeForm,
  type NestedValue,
  type NodeValues,
} from '../composables/shapeForm'
import type { EditableField } from '../composables/shaclUtils'
import { buildResourceGraph, RequiredFieldsError } from '../composables/shapeGraph'
import { serializeTurtle } from '../composables/rdfUtils'
import { putResource, ResourceSaveError } from '../composables/fdpApi'
import { internalHref } from '../composables/urlUtils'
import { parseValidationReport, type ValidationResult } from '../composables/validationReport'
import { predicateLabel } from '../composables/shaclFallback'
import RawContentPanel from '../components/RawContentPanel.vue'
import ShapeFormFields from '../components/ShapeFormFields.vue'
import IconSpinner from '../assets/icons/spinner.svg?component'
import IconCheck from '../assets/icons/check.svg?component'
import IconChevronDown from '../assets/icons/chevron-down.svg?component'

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
const readyToEdit = computed(
  () =>
    !loading.value &&
    !shapesLoading.value &&
    !accessLoading.value &&
    !error.value &&
    !shapesError.value &&
    !accessError.value &&
    canEdit.value,
)
const showForm = computed(() => readyToEdit.value && editableFields.value.length > 0)

const saving = ref(false)
const saved = ref(false)
let unmounted = false
let cancelConfirmation: (() => void) | undefined
onUnmounted(() => {
  unmounted = true
  cancelConfirmation?.()
})
const savingDialog = useTemplateRef<HTMLDialogElement>('savingDialog')
// A modal dialog makes the whole page inert, including header and breadcrumb links.
watch(
  saving,
  (active) => {
    if (active) savingDialog.value?.showModal()
    else savingDialog.value?.close()
  },
  { flush: 'post' },
)
const saveError = ref<string | null>(null)
const validationResults = ref<ValidationResult[]>([])
const rawResponse = ref('')
const formEl = useTemplateRef<HTMLFormElement>('formEl')
const alertEl = useTemplateRef<HTMLElement>('alertEl')

function isShownInline(
  result: ValidationResult,
  subjectUri: string | undefined,
  fields: EditableField[],
  values: NodeValues,
): boolean {
  if (result.focusNode?.termType !== 'NamedNode' || result.path?.termType !== 'NamedNode')
    return false
  if (
    result.focusNode.value === subjectUri &&
    fields.some((field) => field.path === result.path?.value)
  )
    return true
  return fields.some(
    (field) =>
      isNestedField(field) &&
      (values[field.path] ?? []).some((entry) => {
        const record = entry as NestedValue
        return isShownInline(
          result,
          record.originalTerm?.termType === 'NamedNode' ? record.originalTerm.value : undefined,
          field.nested,
          record.values,
        )
      }),
  )
}

/** Show errors in the summary when no field displays them inline. */
const unattachedResults = computed(() =>
  validationResults.value.filter(
    (result) =>
      !isShownInline(
        result,
        currentNodeUri.value ?? undefined,
        editableFields.value,
        formValues.value,
      ),
  ),
)

function clearSaveErrors() {
  saveError.value = null
  validationResults.value = []
  rawResponse.value = ''
}

watch(formValues, clearSaveErrors, { deep: true })

const showRdf = ref(false)
const rdfPreview = ref('')
const rdfPreviewError = ref<string | null>(null)
/** Recomputed only while the preview is open, from the same draft graph save() would send. */
async function updateRdfPreview() {
  if (!showRdf.value || !currentNodeUri.value) return
  try {
    const graph = buildResourceGraph(
      quads.value,
      currentNodeUri.value,
      editableFields.value,
      formValues.value,
    )
    rdfPreview.value = await serializeTurtle(graph)
    rdfPreviewError.value = null
  } catch (err) {
    rdfPreviewError.value =
      err instanceof RequiredFieldsError ? err.message : 'Unable to preview the RDF.'
  }
}

watch([formValues, showRdf], updateRdfPreview, { deep: true })

/** Rebuilds the resource's graph from the form state and saves it, then returns to the view page. */
async function save() {
  if (!readyToEdit.value || saving.value || !currentNodeUri.value) return
  clearSaveErrors()
  saved.value = false
  saving.value = true
  const destination = backTo.value
  try {
    const graph = buildResourceGraph(
      quads.value,
      currentNodeUri.value,
      editableFields.value,
      formValues.value,
    )
    await putResource(resource.value, await serializeTurtle(graph))
    if (unmounted) return
    saved.value = true
    // Allow the confirmation and its fade-out to finish before navigating (see main.css).
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 1000)
      cancelConfirmation = () => {
        clearTimeout(timer)
        resolve()
      }
    })
    cancelConfirmation = undefined
    if (!unmounted) await router.push(destination)
  } catch (err) {
    if (err instanceof ResourceSaveError) {
      rawResponse.value = err.body
      validationResults.value = parseValidationReport(err.body)
      saveError.value = validationResults.value.length
        ? 'The resource could not be saved. Please review the validation errors.'
        : `Unable to save changes (HTTP ${err.status}).`
    } else if (err instanceof RequiredFieldsError) {
      validationResults.value = err.results
      saveError.value = 'The resource could not be saved. Please review the validation errors.'
    } else {
      saveError.value = err instanceof Error ? err.message : 'Unable to save changes.'
    }
  } finally {
    saving.value = false
  }
  if (saveError.value) {
    // Wait for Vue to re-enable the fieldset before focusing an input.
    await nextTick()
    const invalidField = formEl.value?.querySelector<HTMLElement>('[aria-invalid="true"]')
    ;(invalidField ?? alertEl.value)?.focus()
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
        <div v-if="saveError" ref="alertEl" class="alert alert-danger" role="alert" tabindex="-1">
          <p>{{ saveError }}</p>
          <ul v-if="unattachedResults.length">
            <li v-for="(result, index) in unattachedResults" :key="index">
              <strong v-if="result.path?.termType === 'NamedNode'"
                >{{ predicateLabel(result.path.value) }}:
              </strong>
              {{ result.messages.join(' ') }}
            </li>
          </ul>
          <details v-if="rawResponse">
            <summary>Response details</summary>
            <pre class="validation-response">{{ rawResponse }}</pre>
          </details>
        </div>

        <form v-if="showForm" ref="formEl" @submit.prevent="save">
          <fieldset class="user-form__fields" :disabled="saving" aria-label="Resource details">
            <ShapeFormFields
              :fields="editableFields"
              :values="formValues"
              :subject-uri="currentNodeUri ?? undefined"
              :validation-results="validationResults"
            />

            <div class="action-row">
              <button
                type="button"
                :class="['action-button', { 'action-button--active': showRdf }]"
                :title="showRdf ? 'Close RDF preview' : 'Show RDF preview below'"
                :aria-expanded="showRdf"
                aria-controls="rdf-preview"
                @click="showRdf = !showRdf"
              >
                View RDF
                <IconChevronDown
                  class="action-button__chevron"
                  :class="{ 'action-button__chevron--open': showRdf }"
                />
              </button>
            </div>
            <RawContentPanel
              v-show="showRdf"
              id="rdf-preview"
              :text="showRdf ? rdfPreview : ''"
              language="turtle"
              :message="rdfPreviewError"
            />

            <div class="action-row">
              <button type="submit" class="user-form__btn" :disabled="saving">
                {{ saved ? 'Saved' : saving ? 'Saving…' : 'Save' }}
              </button>
              <router-link :to="backTo" class="user-form__btn user-form__btn--secondary"
                >Cancel</router-link
              >
            </div>
          </fieldset>
        </form>
        <p v-else>No editable fields are declared for this resource.</p>
      </template>

      <router-link v-if="!showForm" :to="backTo" class="text-link">Cancel</router-link>
    </main>

    <dialog
      ref="savingDialog"
      class="modal saving-overlay"
      :class="{ 'saving-overlay--saved': saved }"
      :aria-label="saved ? 'Resource saved' : 'Saving resource'"
      @cancel.prevent
    >
      <div class="saving-overlay__body" role="status" aria-live="polite">
        <div class="saving-overlay__icon" aria-hidden="true">
          <IconCheck v-if="saved" />
          <IconSpinner v-else class="saving-overlay__spinner" />
        </div>
        <p class="saving-overlay__message" tabindex="-1" autofocus>
          {{ saved ? 'Saved' : 'Saving…' }}
        </p>
      </div>
    </dialog>
  </div>
</template>
