import { ref, computed, watch } from 'vue'
import type { Ref } from 'vue'
import { fetchRdf } from './fetchUtils'

const formats = [
  { id: 'turtle', label: 'ttl', accept: 'text/turtle', param: 'ttl' },
  { id: 'json-ld', label: 'json-ld', accept: 'application/ld+json', param: 'jsonld' },
] as const

type FormatId = (typeof formats)[number]['id']

export { formats, type FormatId }

/**
 * Selects raw formats and fetches their content.
 * rawTurtle is passed in because it is already loaded by the parent; JSON-LD is fetched on demand.
 */
export function useRawFormat(resourceUri: Ref<string>, rawTurtle: Ref<string | null>) {
  const shownFormat = ref<FormatId | null>(null)
  const extraRawText = ref<Record<FormatId, string | null>>({ turtle: null, 'json-ld': null })
  const rawLoading = ref(false)

  const shownFormatByUri = new Map<string, FormatId | null>()
  const extraRawTextByUri = new Map<string, Record<FormatId, string | null>>()

  function rawTextFor(id: FormatId): string | null {
    if (id === 'turtle') return rawTurtle.value
    return extraRawText.value[id]
  }

  const rawContent = computed(() =>
    shownFormat.value ? (rawTextFor(shownFormat.value) ?? '') : '',
  )

  async function toggleFormat(id: FormatId, accept: string) {
    if (shownFormat.value === id) {
      shownFormat.value = null
      return
    }
    shownFormat.value = id
    if (rawTextFor(id) !== null) return
    rawLoading.value = true
    try {
      extraRawText.value[id] = await fetchRdf(resourceUri.value, accept)
    } catch {
      extraRawText.value[id] = 'Failed to load.'
    } finally {
      rawLoading.value = false
    }
  }

  // Persist per-URI view state (active format + fetched text) so navigating back restores the panel.
  watch(resourceUri, (newUri, oldUri) => {
    shownFormatByUri.set(oldUri, shownFormat.value)
    extraRawTextByUri.set(oldUri, { ...extraRawText.value })

    shownFormat.value = shownFormatByUri.get(newUri) ?? null
    extraRawText.value = extraRawTextByUri.get(newUri) ?? { turtle: null, 'json-ld': null }
  })

  return {
    shownFormat,
    rawLoading,
    rawContent,
    toggleFormat,
  }
}
