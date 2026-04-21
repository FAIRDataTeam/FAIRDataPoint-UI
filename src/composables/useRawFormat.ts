import { ref, computed, watch } from 'vue'
import type { Ref } from 'vue'
import type { RdfFormat } from './rdfUtils'
import { fetchRdfRaw } from './rdfUtils'
import Prism from 'prismjs'
import 'prismjs/components/prism-turtle'
import 'prismjs/components/prism-json'

const formats = [
  { id: 'turtle', label: 'ttl', accept: 'text/turtle', param: 'ttl' },
  { id: 'json-ld', label: 'json-ld', accept: 'application/ld+json', param: 'jsonld' },
] as const

type FormatId = (typeof formats)[number]['id']

export { formats, type FormatId }

export function useRawFormat(
  resourceUri: Ref<string>,
  activeFormat: Ref<RdfFormat | null>,
  activeRawText: Ref<string | null>,
) {
  const shownFormat = ref<FormatId | null>(null)
  const extraRawText = ref<Record<FormatId, string | null>>({ turtle: null, 'json-ld': null })
  const rawLoading = ref(false)
  const rawContentHeight = ref(300)

  const shownFormatByUri = new Map<string, FormatId | null>()
  const extraRawTextByUri = new Map<string, Record<FormatId, string | null>>()

  function rawTextFor(id: FormatId): string | null {
    if (id === activeFormat.value) return activeRawText.value
    return extraRawText.value[id]
  }

  const highlightedRawContent = computed(() => {
    if (!shownFormat.value) return ''
    const text = rawTextFor(shownFormat.value)
    if (!text) return ''
    const lang = shownFormat.value === 'turtle' ? 'turtle' : 'json'
    const grammar = Prism.languages[lang]
    if (!grammar) return text
    return Prism.highlight(text, grammar, lang)
  })

  async function toggleFormat(id: FormatId, accept: string) {
    if (shownFormat.value === id) {
      shownFormat.value = null
      return
    }
    shownFormat.value = id
    if (rawTextFor(id) !== null) return
    rawLoading.value = true
    try {
      extraRawText.value[id] = await fetchRdfRaw(resourceUri.value, accept)
    } catch {
      extraRawText.value[id] = 'Failed to load.'
    } finally {
      rawLoading.value = false
    }
  }

  function startRawResize(e: MouseEvent) {
    const startY = e.clientY
    const startHeight = rawContentHeight.value

    function onMove(ev: MouseEvent) {
      rawContentHeight.value = Math.max(100, startHeight + (ev.clientY - startY))
    }

    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  watch(resourceUri, (newUri, oldUri) => {
    shownFormatByUri.set(oldUri, shownFormat.value)
    extraRawTextByUri.set(oldUri, { ...extraRawText.value })

    shownFormat.value = shownFormatByUri.get(newUri) ?? null
    extraRawText.value = extraRawTextByUri.get(newUri) ?? { turtle: null, 'json-ld': null }
  })

  return {
    shownFormat,
    rawLoading,
    rawContentHeight,
    startRawResize,
    highlightedRawContent,
    toggleFormat,
  }
}
