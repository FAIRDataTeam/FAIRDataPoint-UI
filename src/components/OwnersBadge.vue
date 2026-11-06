<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'

// names: owners other than the current user; isOwner: the current user owns it too.
// ownersLoaded: the owners list was fetched, so an empty names list means no other owners.
// memberNames: other non-owners by membership.
const props = defineProps<{
  names: string[]
  memberNames: Record<string, string[]>
  isOwner: boolean
  ownersLoaded: boolean
  resourceType: string | null
}>()

const open = ref(false)
const tooltipId = useId()

const listFormat = new Intl.ListFormat('en', { type: 'conjunction' })
const hasMembers = computed(() => Object.keys(props.memberNames).length > 0)

// A single owner of someone else's resource, with no other members, is a plain badge below.
const label = computed(() => {
  const count = props.names.length
  if (props.isOwner) return count > 0 ? `Owner +${count}` : 'Owner'
  if (count === 0) return 'No owners'
  return count === 1 ? `Owned by ${props.names[0]}` : `${count} owners`
})

const ownersText = computed(() => {
  if (props.isOwner && props.names.length === 0) {
    // Without the owners list (non-admins, or a failed request) sole ownership is unknown.
    const article = props.ownersLoaded ? 'the' : 'an'
    return `You are ${article} owner of this ${props.resourceType ?? 'resource'}`
  }
  // Possible once the backend removes the last owner, e.g. when deleting their account.
  if (!props.isOwner && props.names.length === 0) return 'No owners'
  const owners = props.isOwner ? ['you', ...props.names] : props.names
  return `Owned by ${listFormat.format(owners)}`
})

const description = computed(() =>
  [
    ownersText.value,
    ...Object.entries(props.memberNames).map(
      ([membership, names]) => `${membership}: ${listFormat.format(names)}`,
    ),
  ].join('. '),
)

// Only keyboard focus opens it; focus from a click, a tap or returning to the tab does not.
function onFocus(event: FocusEvent) {
  if ((event.target as HTMLElement).matches(':focus-visible')) open.value = true
}

// Escape closes it from anywhere, since hovering does not focus the button.
function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') open.value = false
}

watch(open, (isOpen) => {
  if (isOpen) document.addEventListener('keydown', onDocumentKeydown)
  else document.removeEventListener('keydown', onDocumentKeydown)
})

onBeforeUnmount(() => document.removeEventListener('keydown', onDocumentKeydown))
</script>

<template>
  <span v-if="!isOwner && names.length === 1 && !hasMembers" class="membership-badge">
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
    >
      {{ label }}
    </button>
    <span v-show="open" :id="tooltipId" role="tooltip" class="owners-badge__tooltip">
      {{ description }}
    </span>
  </span>
</template>
