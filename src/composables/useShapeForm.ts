import type { Store } from 'n3'
import { computed, ref, watch, type Ref } from 'vue'
import type { EditableField } from './shaclUtils'
import { fieldsSignature, seedValues, type NodeValues } from './shapeForm'

/** Re-seeds on record or structural changes, preserving edits through presentation changes. */
export function useShapeForm(
  store: Ref<Store>,
  subjectUri: Ref<string | null>,
  fields: Ref<EditableField[]>,
) {
  const values = ref<NodeValues>({})
  // The store is read but not watched, so a store change alone does not re-seed. A full reload
  // still resets: loadResource empties the store first, so the subject briefly resolves to null.
  watch(
    [subjectUri, computed(() => fieldsSignature(fields.value))],
    ([uri]) => {
      values.value = uri ? seedValues(store.value, uri, fields.value) : {}
    },
    { immediate: true },
  )
  return values
}
