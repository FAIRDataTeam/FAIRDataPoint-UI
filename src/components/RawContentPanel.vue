<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import Prism from 'prismjs'
import 'prismjs/components/prism-turtle'
import 'prismjs/components/prism-json'
import 'prismjs/themes/prism.css'

const props = defineProps<{
  text: string
  language: 'turtle' | 'json'
  message?: string | null
}>()

const height = ref(300)
let stopResize: (() => void) | undefined
onUnmounted(() => stopResize?.())

function startResize(e: MouseEvent) {
  stopResize?.()
  const startY = e.clientY
  const startHeight = height.value

  function onMove(ev: MouseEvent) {
    height.value = Math.max(100, startHeight + (ev.clientY - startY))
  }

  function onUp() {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    stopResize = undefined
  }

  stopResize = onUp
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}
const highlighted = computed(() => {
  const grammar = Prism.languages[props.language]
  return grammar ? Prism.highlight(props.text, grammar, props.language) : null
})
</script>

<template>
  <section class="raw-section">
    <p v-if="message" class="raw-loading">{{ message }}</p>
    <template v-else>
      <!-- Keep formatting whitespace out of the preformatted content. -->
      <pre
        class="raw-content language-none"
        :style="{ height: height + 'px' }"
      ><code v-if="highlighted !== null" v-html="highlighted" /><code v-else>{{ text }}</code></pre>
      <div class="raw-resize-handle" @mousedown.prevent="startResize" />
    </template>
  </section>
</template>
