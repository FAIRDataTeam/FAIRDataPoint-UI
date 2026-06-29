import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
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
import { useRdfLoader, type ChildSummary } from './useRdfLoader'
import { getBaseUrl } from './urlUtils'

export type { ChildSummary }

// Derives all display data for ResourceView from the current route: resolves the resource URI,
// delegates fetching to useRdfLoader, and exposes computed title, breadcrumbs, metadata rows, and child sections.
export function useResourceView() {
  const route = useRoute()
  const fdpBaseUri = getBaseUrl()

  const fdpUri = `${fdpBaseUri}/`

  const resourceUri = computed(() => {
    const resourceType = route.params.resourceType
    const id = route.params.id

    if (typeof resourceType === 'string' && typeof id === 'string') {
      return `${fdpBaseUri}/${resourceType}/${id}`
    }

    return `${fdpBaseUri}/`
  })

  const {
    loading,
    error,
    quads,
    rawTurtle,
    childSummaries,
    parentSummaries,
    shapeGraphs,
    loadResource,
    loadChildSummary,
    loadParentChain,
    loadProfile,
  } = useRdfLoader()

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

  const allMetadataRows = computed(() =>
    getMetadataRows(quads.value, currentNodeUri.value, Object.values(shapeGraphs.value)),
  )

  const metadataRows = computed(() => allMetadataRows.value.rows)
  const unknownMetadataRows = computed(() => allMetadataRows.value.unknownRows)

  watch(
    resourceUri,
    async (uri) => {
      await loadResource(uri)
    },
    { immediate: true },
  )

  watch(
    childSections,
    (sections) => {
      sections.flatMap((section) => section.items).forEach((uri) => {
        void loadChildSummary(uri)
      })
    },
    { immediate: true },
  )

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
    (uri) => {
      if (!uri) return
      const profileUri = getConformsTo(quads.value, uri)
      if (profileUri) void loadProfile(profileUri)
    },
    { immediate: true },
  )

  return {
    loading,
    error,
    rawTurtle,
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
    childSections,
    childSummaries,
    resourceLabel,
  }
}
