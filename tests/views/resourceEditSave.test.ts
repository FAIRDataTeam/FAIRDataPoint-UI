import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { mountComponentSetup } from '../helpers/mountComponentSetup'
import { DataFactory, Store } from 'n3'
import type { ValidationResult } from '../../src/composables/validationReport'
import ResourceEditView from '../../src/views/ResourceEditView.vue'
import { ResourceSaveError, putResource } from '../../src/composables/fdpApi'

const mocks = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('../../src/composables/apiDocs', () => ({}))
vi.mock('../../src/composables/fdpApi', async (original) => ({
  ...(await original<typeof import('../../src/composables/fdpApi')>()),
  putResource: vi.fn(),
}))
vi.mock('../../src/composables/useMeta', () => ({
  useMeta: () => ({ canEdit: ref(true), loading: ref(false), error: ref(null) }),
}))
vi.mock('../../src/composables/useResourceView', () => ({
  useResourceView: () => ({
    resource: ref(null),
    currentNodeUri: ref('urn:resource'),
    quads: ref(new Store()),
    title: 'Resource',
    breadcrumbs: [],
    loading: ref(false),
    error: ref(null),
    shapesLoading: ref(false),
    shapesError: ref(null),
    editableFields: ref([
      {
        path: 'urn:title',
        label: 'Title',
        minCount: 1,
        maxCount: 1,
        editor: 'http://datashapes.org/dash#TextFieldEditor',
        nested: [],
      },
      {
        path: 'urn:link',
        label: 'Link',
        minCount: 1,
        maxCount: 1,
        editor: 'http://datashapes.org/dash#URIEditor',
        nested: [],
      },
      {
        path: 'urn:status',
        label: 'Status',
        minCount: 0,
        maxCount: 1,
        editor: 'http://datashapes.org/dash#BooleanSelectEditor',
        nested: [],
      },
    ]),
  }),
}))
function mountView() {
  return mountComponentSetup<{
    save: () => Promise<void>
    saving: boolean
    saved: boolean
    saveError: string | null
    rawResponse: string
    validationResults: ValidationResult[]
    unattachedResults: ValidationResult[]
    formValues: Record<string, { value: string }[]>
    showRdf: boolean
    rdfPreview: string
    rdfPreviewError: string | null
  }>(ResourceEditView)
}

const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

const report = `@prefix sh: <http://www.w3.org/ns/shacl#> .
  [] a sh:ValidationReport; sh:result [ sh:focusNode <urn:resource>;
    sh:resultPath <urn:title>; sh:resultMessage "Title rejected" ].`

beforeEach(() => {
  vi.clearAllMocks()
})

describe('resource save errors', () => {
  it.each([
    { body: report, message: 'Title rejected' },
    { body: '<html>Server failed</html>', message: 'Unable to save changes (HTTP 400).' },
  ])(
    'preserves edits, shows the response, clears on editing and allows retry',
    async ({ body, message }) => {
      vi.mocked(putResource)
        .mockRejectedValueOnce(new ResourceSaveError(400, body))
        .mockResolvedValueOnce()
      const view = mountView()
      try {
        view.state.formValues['urn:title']![0]!.value = 'My edited title'
        view.state.formValues['urn:link']![0]!.value = 'urn:example'
        await nextTick()
        const submit = view.state.save
        const saving = submit()
        await nextTick()
        expect(view.state.saving).toBe(true)
        await saving
        await nextTick()
        expect(view.state.saving).toBe(false)
        expect(
          [
            view.state.saveError,
            ...view.state.validationResults.flatMap((result) => result.messages),
          ].join(' '),
        ).toContain(message)
        expect(view.state.rawResponse).toBe(body)
        expect(view.state.formValues['urn:title']![0]!.value).toBe('My edited title')
        expect(mocks.push).not.toHaveBeenCalled()
        view.state.formValues['urn:title']![0]!.value = 'Corrected title'
        await nextTick()
        expect(view.state.saveError).toBeNull()
        expect(view.state.validationResults).toEqual([])
        expect(view.state.rawResponse).toBe('')
        await submit()
        expect(mocks.push).toHaveBeenCalledWith({ name: 'fdp-root' })
      } finally {
        view.unmount()
      }
    },
  )

  it('re-enables the form and shows the message when the save request times out', async () => {
    const request = Promise.withResolvers<void>()
    const started = Promise.withResolvers<void>()
    vi.mocked(putResource).mockImplementationOnce(() => {
      started.resolve()
      return request.promise
    })
    const view = mountView()
    try {
      view.state.formValues['urn:title']![0]!.value = 'My edited title'
      view.state.formValues['urn:link']![0]!.value = 'urn:example'
      await nextTick()
      const saving = view.state.save()
      await started.promise
      expect(view.state.saving).toBe(true)
      request.reject(new Error('The save request timed out. Check the resource before retrying.'))
      await saving
      expect(view.state.saving).toBe(false)
      expect(view.state.saveError).toBe(
        'The save request timed out. Check the resource before retrying.',
      )
      expect(view.state.validationResults).toEqual([])
      expect(mocks.push).not.toHaveBeenCalled()
    } finally {
      view.unmount()
    }
  })

  it('reports every missing required field, not just the first', async () => {
    const view = mountView()
    try {
      await view.state.save()
      await nextTick()
      expect(putResource).not.toHaveBeenCalled()
      expect(view.state.saveError).toBe(
        'The resource could not be saved. Please review the validation errors.',
      )
      expect(view.state.validationResults).toMatchObject([
        {
          path: { termType: 'NamedNode', value: 'urn:title' },
          messages: ['Title is required.'],
        },
        {
          path: { termType: 'NamedNode', value: 'urn:link' },
          messages: ['Link is required.'],
        },
      ])
      // Both results match rendered fields, so neither needs a summary entry.
      expect(view.state.unattachedResults).toEqual([])
    } finally {
      view.unmount()
    }
  })

  it('keeps a blank-node result in the summary, since it has nowhere else to attach', async () => {
    const view = mountView()
    try {
      const attached: ValidationResult = {
        focusNode: DataFactory.namedNode('urn:resource'),
        path: DataFactory.namedNode('urn:title'),
        messages: ['Shown inline next to Title'],
      }
      const unattached: ValidationResult = {
        focusNode: undefined,
        path: DataFactory.namedNode('urn:name'),
        messages: ['Only the blank-node record has this'],
      }
      view.state.validationResults = [attached, unattached]
      await nextTick()
      expect(view.state.unattachedResults).toEqual([unattached])
    } finally {
      view.unmount()
    }
  })

  it('keeps named-node errors without a rendered field in the summary', async () => {
    const view = mountView()
    try {
      const inline: ValidationResult = {
        focusNode: DataFactory.namedNode('urn:resource'),
        path: DataFactory.namedNode('urn:title'),
        messages: ['Title shown inline'],
      }
      const unbuiltWidget: ValidationResult = {
        focusNode: DataFactory.namedNode('urn:resource'),
        path: DataFactory.namedNode('urn:status'),
        messages: ['Status shown under the pending widget'],
      }
      const unknownPath: ValidationResult = {
        focusNode: DataFactory.namedNode('urn:resource'),
        path: DataFactory.namedNode('urn:other'),
        messages: ['Other path'],
      }
      const otherSubject: ValidationResult = {
        focusNode: DataFactory.namedNode('urn:other'),
        path: DataFactory.namedNode('urn:title'),
        messages: ['Other subject'],
      }
      view.state.validationResults = [inline, unbuiltWidget, unknownPath, otherSubject]
      await nextTick()
      expect(view.state.unattachedResults).toEqual([unknownPath, otherSubject])
    } finally {
      view.unmount()
    }
  })
})

describe('save confirmation', () => {
  it.each([false, true])(
    'pauses before navigating, unless unmounted=%s',
    async (unmountDuringPause) => {
      vi.useFakeTimers()
      vi.mocked(putResource).mockResolvedValueOnce()
      const view = mountView()
      try {
        view.state.formValues['urn:title']![0]!.value = 'Title'
        view.state.formValues['urn:link']![0]!.value = 'urn:example'
        await nextTick()
        const saving = view.state.save()
        await vi.advanceTimersByTimeAsync(0)
        expect(view.state.saved).toBe(true)
        expect(view.state.saving).toBe(true)
        await vi.advanceTimersByTimeAsync(999)
        expect(mocks.push).not.toHaveBeenCalled()
        if (unmountDuringPause) view.unmount()
        await vi.advanceTimersByTimeAsync(1)
        await saving
        if (unmountDuringPause) expect(mocks.push).not.toHaveBeenCalled()
        else expect(mocks.push).toHaveBeenCalledWith({ name: 'fdp-root' })
        expect(view.state.saving).toBe(false)
      } finally {
        if (!unmountDuringPause) view.unmount()
        vi.useRealTimers()
      }
    },
  )
})

describe('RDF preview', () => {
  it('does not compute a preview until opened', async () => {
    const view = mountView()
    try {
      await flushPromises()
      expect(view.state.rdfPreview).toBe('')
      expect(view.state.rdfPreviewError).toBeNull()
    } finally {
      view.unmount()
    }
  })

  it('identifies the missing required field', async () => {
    const view = mountView()
    try {
      view.state.showRdf = true
      await flushPromises()
      expect(view.state.rdfPreviewError).toBe('Title is required.')
      expect(view.state.rdfPreview).toBe('')
    } finally {
      view.unmount()
    }
  })

  it('reports an invalid IRI and recovers when it is corrected', async () => {
    const view = mountView()
    try {
      view.state.formValues['urn:title']![0]!.value = 'Draft title'
      view.state.formValues['urn:link']![0]!.value = 'not-an-iri'
      view.state.showRdf = true
      await flushPromises()
      expect(view.state.rdfPreviewError).toBe('Link must be a valid absolute IRI.')
      view.state.formValues['urn:link']![0]!.value = 'urn:example'
      await flushPromises()
      expect(view.state.rdfPreviewError).toBeNull()
      expect(view.state.rdfPreview).toContain('urn:example')
    } finally {
      view.unmount()
    }
  })

  it('serializes the current draft once required fields are filled', async () => {
    const view = mountView()
    try {
      view.state.formValues['urn:title']![0]!.value = 'Draft title'
      view.state.formValues['urn:link']![0]!.value = 'urn:example'
      view.state.showRdf = true
      await flushPromises()
      expect(view.state.rdfPreviewError).toBeNull()
      expect(view.state.rdfPreview).toContain('Draft title')
    } finally {
      view.unmount()
    }
  })

  it('updates the preview as the draft changes while still open', async () => {
    const view = mountView()
    try {
      view.state.formValues['urn:title']![0]!.value = 'First title'
      view.state.formValues['urn:link']![0]!.value = 'urn:example'
      view.state.showRdf = true
      await flushPromises()
      expect(view.state.rdfPreview).toContain('First title')

      view.state.formValues['urn:title']![0]!.value = 'Second title'
      await flushPromises()
      expect(view.state.rdfPreview).toContain('Second title')
      expect(view.state.rdfPreview).not.toContain('First title')
    } finally {
      view.unmount()
    }
  })
})
