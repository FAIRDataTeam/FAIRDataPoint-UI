<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { Network, type Options } from 'vis-network'
import { DataSet } from 'vis-data'
import type { Store } from 'n3'
import { buildGraphData, type GraphColors } from '../composables/graphUtils'

const props = defineProps<{
  graph: Store
}>()

const container = ref<HTMLDivElement | null>(null)
let network: Network | null = null

const colors: GraphColors = {
  subject: { background: '#dbeafe', border: '#005ea8' },
  type: { background: '#f0fdf4', border: '#16a34a' },
  blank: { background: '#fafafa', border: '#d9dde2' },
  external: { background: '#ffffff', border: '#8b949e' },
  literal: { background: '#f3f3f3', border: '#d9dde2' },
}

const options: Options = {
  layout: { randomSeed: 42 },
  physics: {
    solver: 'forceAtlas2Based',
    forceAtlas2Based: { gravitationalConstant: -60, springLength: 140 },
    stabilization: { iterations: 200 },
  },
  nodes: {
    shape: 'box',
    font: { size: 11, face: 'Inter, sans-serif' },
    widthConstraint: { maximum: 240 },
    margin: { top: 8, right: 8, bottom: 8, left: 8 },
  },
  edges: {
    arrows: 'to',
    font: { size: 9, face: 'Inter, sans-serif', align: 'middle' },
    color: { color: '#8b949e' },
    smooth: { enabled: true, type: 'dynamic', roundness: 0.5 },
  },
  interaction: { hover: true, tooltipDelay: 200 },
}

function init() {
  if (!container.value) return
  const { nodes, edges } = buildGraphData(props.graph, colors)
  network?.destroy()
  network = new Network(
    container.value,
    { nodes: new DataSet(nodes), edges: new DataSet(edges) },
    options,
  )
}

watch(() => props.graph, init, { deep: false })
onMounted(init)
onBeforeUnmount(() => network?.destroy())

const HANDLE_HEIGHT = 8
const wrapperHeight = ref(600)
const graphHeight = ref(600 - HANDLE_HEIGHT)

function startResize(e: MouseEvent) {
  const startY = e.clientY
  const startHeight = wrapperHeight.value

  function onMove(ev: MouseEvent) {
    const newHeight = Math.max(200, startHeight + (ev.clientY - startY))
    wrapperHeight.value = newHeight
    graphHeight.value = newHeight - HANDLE_HEIGHT
    if (container.value && network) {
      network.setSize(`${container.value.offsetWidth}px`, `${graphHeight.value}px`)
      network.redraw()
    }
  }

  function onUp() {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }

  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}
</script>

<template>
  <div class="rdf-graph-wrapper" :style="{ height: wrapperHeight + 'px' }">
    <div ref="container" class="rdf-graph" :style="{ height: graphHeight + 'px' }" />
    <div class="rdf-graph-resize-handle" @mousedown.prevent="startResize" />
  </div>
</template>
