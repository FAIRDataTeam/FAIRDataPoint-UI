<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'

// ownersLoaded: the owners list was fetched, so no other owners means there are none.
const props = defineProps<{
  membershipName: string | null
  otherOwnerNames: string[]
  otherMemberNames: Record<string, string[]>
  ownersLoaded: boolean
  resourceType: string | null
}>()

const tooltipOpen = ref(false)
const tooltipId = useId()

const listFormat = new Intl.ListFormat('en', { type: 'conjunction' })
const isOwner = computed(() => props.membershipName === 'Owner')
const hasOtherMembers = computed(() => Object.keys(props.otherMemberNames).length > 0)

// A single owner of someone else's resource, with no other members, is a plain badge below.
const label = computed(() => {
  const otherOwnerCount = props.otherOwnerNames.length
  if (isOwner.value) return otherOwnerCount > 0 ? `Owner +${otherOwnerCount}` : 'Owner'
  if (props.membershipName) return props.membershipName
  if (otherOwnerCount === 0) return 'No owners'
  return otherOwnerCount === 1
    ? `Owned by ${props.otherOwnerNames[0]}`
    : `${otherOwnerCount} owners`
})

function ownSentence(membership: string, article: string): string {
  return `You are ${article} ${membership.toLowerCase()} of this ${props.resourceType ?? 'resource'}`
}

const ownersSentences = computed(() => {
  const { membershipName, otherOwnerNames, ownersLoaded } = props
  if (isOwner.value) {
    // Without the owners list (non-admins, or a failed request) sole ownership is unknown.
    if (otherOwnerNames.length === 0) return [ownSentence('owner', ownersLoaded ? 'the' : 'an')]
    return [`Owned by ${listFormat.format(['you', ...otherOwnerNames])}`]
  }
  const sentences = membershipName
    ? [ownSentence(membershipName, /^[aeiou]/i.test(membershipName) ? 'an' : 'a')]
    : []
  if (otherOwnerNames.length > 0) sentences.push(`Owned by ${listFormat.format(otherOwnerNames)}`)
  // Possible once the backend removes the last owner, e.g. when deleting their account.
  else if (ownersLoaded) sentences.push('No owners')
  return sentences
})

// One sentence per line, without dots.
const description = computed(() =>
  [
    ...ownersSentences.value,
    ...Object.entries(props.otherMemberNames).map(
      ([membership, names]) => `${membership}: ${listFormat.format(names)}`,
    ),
  ].join('\n'),
)

// Only keyboard focus opens it; focus from a click, a tap or returning to the tab does not.
function onFocus(event: FocusEvent) {
  if ((event.target as HTMLElement).matches(':focus-visible')) tooltipOpen.value = true
}

// Escape closes it from anywhere, since hovering does not focus the button.
function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') tooltipOpen.value = false
}

watch(tooltipOpen, (isOpen) => {
  if (isOpen) document.addEventListener('keydown', onDocumentKeydown)
  else document.removeEventListener('keydown', onDocumentKeydown)
})

onBeforeUnmount(() => document.removeEventListener('keydown', onDocumentKeydown))
</script>

<template>
  <span
    v-if="!membershipName && otherOwnerNames.length === 1 && !hasOtherMembers"
    class="membership-badge"
  >
    Owned by {{ otherOwnerNames[0] }}
  </span>
  <span
    v-else
    class="membership-details"
    @mouseenter="tooltipOpen = true"
    @mouseleave="tooltipOpen = false"
  >
    <!-- Click is for touch devices, which have no hover. It only opens: with a mouse, hover already did. -->
    <button
      type="button"
      class="membership-badge membership-details__trigger"
      :aria-describedby="tooltipId"
      @focus="onFocus"
      @blur="tooltipOpen = false"
      @click="tooltipOpen = true"
    >
      {{ label }}
    </button>
    <span v-show="tooltipOpen" :id="tooltipId" role="tooltip" class="membership-details__tooltip">
      {{ description }}
    </span>
  </span>
</template>
