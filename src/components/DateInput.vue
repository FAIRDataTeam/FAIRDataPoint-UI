<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import {
  fromDateInputValue,
  fromDateTimeInputValue,
  toDateInputValue,
  toDateTimeInputValue,
} from '../composables/formUtils'

const props = defineProps<{ type: 'date' | 'datetime-local' }>()
const model = defineModel<string>({ required: true })
const input = useTemplateRef<HTMLInputElement>('input')
const conversion = computed(() =>
  props.type === 'date'
    ? { parse: fromDateInputValue, format: toDateInputValue }
    : { parse: fromDateTimeInputValue, format: toDateTimeInputValue },
)
const displayValue = computed({
  get: () => conversion.value.format(model.value) ?? '',
  set(value: string) {
    const edited = conversion.value.parse(value, model.value)
    const shown = conversion.value.format(edited) ?? ''
    // Restore rejected edits even when the model does not change. Avoid writing an empty
    // value over an incomplete native input, which would clear its remaining segments.
    if (input.value && input.value.value !== shown) input.value.value = shown
    model.value = edited
  },
})
</script>

<template>
  <!-- v-model updates the property without mirroring the value attribute, which resets segments. -->
  <input
    ref="input"
    v-model="displayValue"
    :type="type"
    :step="type === 'datetime-local' ? 1 : undefined"
  />
</template>
