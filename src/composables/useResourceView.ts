import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { Store } from 'n3'
import {
  getTitle,
  getBreadcrumbs,
  resolveSubjectUri,
  getDescription,
  getConformsTo,
  getAccessUrl,
  getDownloadUrl,
  getParentUri,
  getChildSections,
  getMetadataRows,
  uriLabel,
} from './rdfUtils'
import { getShapePropertyMap, getEditableFields } from './shaclUtils'
import { useRdfLoader, type ChildSummary } from './useRdfLoader'
import { getBaseUrl } from './urlUtils'
import type { ResourceIdentifier } from './fdpApi'

export type { ChildSummary }

/**
 * Derives all display data for ResourceView from the current route: resolves the resource URI,
 * delegates fetching to useRdfLoader, and exposes computed title, breadcrumbs, metadata rows, and child sections.
 */
export function useResourceView({
  loadChildSummaries = true,
}: { loadChildSummaries?: boolean } = {}) {
  const route = useRoute()
  const fdpBaseUri = getBaseUrl()

  const fdpUri = `${fdpBaseUri}/`

  const resource = computed<ResourceIdentifier>((previous) => {
    const resourceType = route.params.resourceType
    const id = route.params.id

    if (typeof resourceType === 'string' && typeof id === 'string') {
      // Reuse the previous object supplied by Vue so unchanged route params do not trigger refetches.
      if (previous?.resourceType === resourceType && previous.id === id) return previous
      return { resourceType, id }
    }

    return null
  })

  const resourceUri = computed(() =>
    resource.value ? `${fdpBaseUri}/${resource.value.resourceType}/${resource.value.id}` : fdpUri,
  )

  const {
    loading,
    error,
    quads,
    rawTurtle,
    childSummaries,
    parentSummaries,
    loadResource,
    loadChildSummary,
    loadParentChain,
    loadProfile,
  } = useRdfLoader()

  const shapeGraphs = ref<Record<string, Store>>({})
  const shapesLoading = ref(false)
  const shapesError = ref<string | null>(null)

  function resourceLabel(uri: string): string {
    return uriLabel(quads.value, uri)
  }

  const currentNodeUri = computed<string | null>(() =>
    resolveSubjectUri(quads.value, resourceUri.value),
  )

  const title = computed(() => getTitle(quads.value, currentNodeUri.value))

  const description = computed(() => getDescription(quads.value, currentNodeUri.value))
  const accessUrl = computed(() => getAccessUrl(quads.value, currentNodeUri.value))
  const downloadUrl = computed(() => getDownloadUrl(quads.value, currentNodeUri.value))

  const breadcrumbs = computed(() =>
    getBreadcrumbs(
      quads.value,
      currentNodeUri.value,
      resourceUri.value,
      fdpUri,
      parentSummaries.value,
    ),
  )

  const childSections = computed(() => getChildSections(quads.value, currentNodeUri.value))

  // Share the computed shape map between metadata display and editable-field selection.
  const shapeProperties = computed(() =>
    getShapePropertyMap(quads.value, currentNodeUri.value, Object.values(shapeGraphs.value)),
  )

  const allMetadataRows = computed(() =>
    getMetadataRows(quads.value, currentNodeUri.value, shapeProperties.value),
  )

  const metadataRows = computed(() => allMetadataRows.value.rows)
  const unknownMetadataRows = computed(() => allMetadataRows.value.unknownRows)

  // The same properties as the metadata table, filtered by dash:editor instead of dash:viewer.
  const editableFields = computed(() => getEditableFields(shapeProperties.value))

  watch(
    resourceUri,
    async (uri) => {
      await loadResource(uri)
    },
    { immediate: true },
  )

  // The edit page needs breadcrumbs, but not child summaries.
  if (loadChildSummaries) {
    watch(
      childSections,
      (sections) => {
        sections
          .flatMap((section) => section.items)
          .forEach((uri) => {
            void loadChildSummary(uri)
          })
      },
      { immediate: true },
    )
  }

  watch(
    currentNodeUri,
    (uri) => {
      if (!uri) return
      const parentUri = getParentUri(quads.value, uri)
      // Stop at the FDP root, which is already loaded as the main resource.
      if (parentUri && parentUri !== fdpUri) {
        void loadParentChain(parentUri)
      }
    },
    { immediate: true },
  )

  watch(
    currentNodeUri,
    async (uri, _previous, onCleanup) => {
      let cancelled = false
      onCleanup(() => {
        cancelled = true
      })
      shapeGraphs.value = {}
      shapesError.value = null
      shapesLoading.value = false
      if (!uri) return
      const profileUri = getConformsTo(quads.value, uri)
      if (!profileUri) return
      shapesLoading.value = true
      try {
        const result = await loadProfile(profileUri)
        if (!cancelled) {
          shapeGraphs.value = result.graphs
          shapesError.value = result.error
        }
      } catch (err) {
        if (!cancelled) {
          shapesError.value = err instanceof Error ? err.message : 'Unable to load resource shapes.'
        }
      } finally {
        if (!cancelled) shapesLoading.value = false
      }
    },
    { immediate: true },
  )

  return {
    shapesLoading,
    shapesError,
    loading,
    error,
    rawTurtle,
    resource,
    resourceUri,
    currentNodeUri,
    title,
    description,
    accessUrl,
    downloadUrl,
    breadcrumbs,
    quads,
    metadataRows,
    unknownMetadataRows,
    editableFields,
    childSections,
    childSummaries,
    resourceLabel,
  }
}
