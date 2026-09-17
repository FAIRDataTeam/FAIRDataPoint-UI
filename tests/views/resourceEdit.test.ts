import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { RouterView } from 'vue-router'
import router from '../../src/router'

// Exercise the production routes and RouterLinks in Node without browser history.
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return { ...actual, createWebHistory: actual.createMemoryHistory }
})
vi.mock('../../src/composables/useAuth', () => ({
  useAuth: () => ({ isLoggedIn: { value: true }, isAdmin: { value: false } }),
}))
vi.mock('../../src/composables/apiDocs', () => ({
  apiDocsReady: Promise.resolve(),
  isOperationOffered: () => true,
}))
// Unrelated routes are not part of this render test.
vi.mock('../../src/views/LoginView.vue', () => ({ default: {} }))
vi.mock('../../src/views/SearchView.vue', () => ({ default: {} }))
vi.mock('../../src/views/UsersView.vue', () => ({ default: {} }))
vi.mock('../../src/views/UserFormView.vue', () => ({ default: {} }))
vi.mock('../../src/components/RdfGraph.vue', () => ({ default: {} }))

const state = vi.hoisted(() => ({
  canEdit: false,
  breadcrumbs: [] as { text: string; uri: string }[],
  shapesLoading: false,
  shapesError: null as string | null,
  editableFields: [] as {
    path: string
    label: string | null
    editor: string | null
    minCount: number | null
    maxCount: number | null
  }[],
}))
vi.mock('../../src/composables/useMeta', () => ({
  useMeta: () => ({ membershipName: null, canEdit: state.canEdit }),
}))
vi.mock('../../src/composables/useMembers', () => ({
  useMembers: () => ({ otherOwnerNames: [], loaded: true }),
}))
vi.mock('../../src/composables/useResourceView', async () => {
  const { computed, ref } = await import('vue')
  const { useRoute } = await import('vue-router')
  return {
    useResourceView: () => {
      const route = useRoute()
      return {
        resource: computed(() =>
          route.params.resourceType
            ? { resourceType: route.params.resourceType, id: route.params.id }
            : null,
        ),
        resourceUri: ref('http://localhost' + route.path),
        currentNodeUri: ref('http://localhost' + route.path),
        shapesLoading: state.shapesLoading,
        shapesError: state.shapesError,
        loading: false,
        error: null,
        title: 'Test resource',
        description: null,
        rawTurtle: ref(null),
        breadcrumbs: computed(() => state.breadcrumbs),
        metadataRows: [],
        unknownMetadataRows: [],
        childSections: [],
        childSummaries: {},
        editableFields: computed(() => state.editableFields),
        resourceLabel: () => 'Test resource',
      }
    },
  }
})

async function renderRoute() {
  return renderToString(createSSRApp({ render: () => h(RouterView) }).use(router))
}

function linkHref(html: string, label: string): string {
  const link = [...html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].find(
    ([anchor]) => anchor.replace(/<[^>]*>/g, '').trim() === label,
  )?.[0]
  expect(link, `Expected a rendered ${label} link`).toBeDefined()
  const href = link?.match(/href="([^"]*)"/)?.[1]
  expect(href).toBeDefined()
  return href!
}

beforeEach(() => {
  state.canEdit = false
  state.breadcrumbs = []
  state.shapesLoading = false
  state.shapesError = null
  state.editableFields = []
})

describe.each([
  { resourcePath: '/', editPath: '/edit', heading: 'Edit FAIR Data Point' },
  { resourcePath: '/catalog/abc', editPath: '/catalog/abc/edit', heading: 'Edit catalog' },
])('resource editing from $resourcePath', ({ resourcePath, editPath, heading }) => {
  it('hides the Edit link when editing is unavailable', async () => {
    await router.push(resourcePath)
    const html = await renderRoute()
    expect(html).toContain('Test resource')
    expect(html).not.toContain('resource-edit-link')
    expect(html).not.toContain(`href="${editPath}"`)
  })

  it('links to the placeholder and returns to the resource through Cancel', async () => {
    state.canEdit = true
    await router.push(resourcePath)
    const editHref = linkHref(await renderRoute(), 'Edit')
    expect(editHref).toBe(editPath)

    await router.push(editHref)
    const placeholder = await renderRoute()
    expect(placeholder).toContain(`<h1>${heading}</h1>`)
    expect(placeholder).toContain('Editing is not implemented yet.')
    const cancelHref = linkHref(placeholder, 'Cancel')
    expect(cancelHref).toBe(resourcePath)

    await router.push(cancelHref)
    expect(router.currentRoute.value.path).toBe(resourcePath)
    expect(await renderRoute()).toContain('Test resource')
  })

  it('links the breadcrumb trail back to the resource and ends with Edit', async () => {
    state.breadcrumbs = [{ text: 'My FAIR Data Point', uri: 'http://localhost/' }]
    if (resourcePath !== '/') {
      state.breadcrumbs.push({ text: 'My catalog', uri: 'http://localhost' + resourcePath })
    }
    await router.push(editPath)
    const html = await renderRoute()
    const nav = html.match(/<nav[^>]*>[\s\S]*?<\/nav>/)?.[0]
    expect(nav).toBeDefined()
    expect(linkHref(nav!, 'My FAIR Data Point')).toBe('/')
    if (resourcePath !== '/') expect(linkHref(nav!, 'My catalog')).toBe(resourcePath)
    expect(nav).toContain('<span class="breadcrumb-current" aria-current="page">Edit</span>')
    expect(nav!.indexOf('breadcrumb-current')).toBeGreaterThan(nav!.lastIndexOf('</a>'))

    const currentResourceLabel = resourcePath === '/' ? 'My FAIR Data Point' : 'My catalog'
    await router.push(linkHref(nav!, currentResourceLabel))
    expect(router.currentRoute.value.path).toBe(resourcePath)
  })

  it('lists the shape-declared editable fields, falling back to a known predicate label', async () => {
    state.canEdit = true
    state.editableFields = [
      {
        path: 'http://purl.org/dc/terms/title',
        label: 'Title',
        editor: 'http://datashapes.org/dash#TextFieldEditor',
        minCount: 1,
        maxCount: 1,
      },
      {
        // No sh:name, so the label comes from shaclFallback's curated map.
        path: 'http://www.w3.org/ns/dcat#keyword',
        label: null,
        editor: 'http://datashapes.org/dash#TextFieldEditor',
        minCount: null,
        maxCount: null,
      },
    ]
    await router.push(editPath)
    const html = await renderRoute()

    expect(html).toContain('Title')
    expect(html).toContain('Keyword')
    expect(html).toContain('dash:TextFieldEditor')
    expect(html).toContain('1..1')
    expect(html).toContain('0..*')
  })

  it('shows loading instead of an empty field list while shapes are pending', async () => {
    state.shapesLoading = true
    await router.push(editPath)
    const html = await renderRoute()
    expect(html).toContain('Loading…')
    expect(html).not.toContain('No editable fields')
  })

  it('shows shape failures instead of an empty field list', async () => {
    state.shapesError = 'HTTP 503'
    await router.push(editPath)
    const html = await renderRoute()
    expect(html).toContain('Error: HTTP 503')
    expect(html).not.toContain('No editable fields')
  })

  it('shows the error instead of fields from an incomplete set of shapes', async () => {
    state.shapesError = 'HTTP 503'
    state.editableFields = [
      {
        path: 'http://purl.org/dc/terms/title',
        label: 'Partial field',
        editor: 'http://datashapes.org/dash#TextFieldEditor',
        minCount: null,
        maxCount: null,
      },
    ]
    await router.push(editPath)
    const html = await renderRoute()
    expect(html).toContain('Error: HTTP 503')
    expect(html).not.toContain('Partial field')
  })

  it('says so when the shape declares no editable fields', async () => {
    state.canEdit = true
    await router.push(editPath)
    expect(await renderRoute()).toContain('No editable fields are declared')
  })
})
