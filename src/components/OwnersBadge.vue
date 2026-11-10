<script setup lang="ts">
import { computed, ref, useId } from 'vue'

// names: owners other than the current user; isOwner: the current user owns it too.
// ownersLoaded: the owners list was fetched, so an empty names list means no other owners.
const props = defineProps<{
  names: string[]
  isOwner: boolean
  ownersLoaded: boolean
  resourceType: string | null
}>()

const open = ref(false)
const tooltipId = useId()

// A single owner of someone else's resource is shown as a plain badge below, so no "1 owner" label.
const label = computed(() => {
  const count = props.names.length
  if (props.isOwner) return count > 0 ? `Owner +${count}` : 'Owner'
  return `${count} owners`
})

const description = computed(() => {
  if (props.isOwner && props.names.length === 0) {
    // Without the owners list (non-admins, or a failed request) sole ownership is unknown.
    const article = props.ownersLoaded ? 'the' : 'an'
    return `You are ${article} owner of this ${props.resourceType ?? 'resource'}`
  }
  const owners = props.isOwner ? ['you', ...props.names] : props.names
  return `Owned by ${new Intl.ListFormat('en', { type: 'conjunction' }).format(owners)}`
})

// Only keyboard focus opens it; focus from a click, a tap or returning to the tab does not.
function onFocus(event: FocusEvent) {
  if ((event.target as HTMLElement).matches(':focus-visible')) open.value = true
}
</script>

<template>
  <span v-if="!isOwner && names.length === 1" class="membership-badge">
    Owned by {{ names[0] }}
  </span>
  <span v-else class="owners-badge" @mouseenter="open = true" @mouseleave="open = false">
    <!-- Click is for touch devices, which have no hover. It only opens: with a mouse, hover already did. -->
    <button
      type="button"
      class="membership-badge owners-badge__trigger"
      :aria-describedby="tooltipId"
      @focus="onFocus"
      @blur="open = false"
      @click="open = true"
      @keydown.esc="open = false"
    >
      {{ label }}
    </button>
    <span v-show="open" :id="tooltipId" role="tooltip" class="owners-badge__tooltip">
      {{ description }}
    </span>
  </span>
</template>
