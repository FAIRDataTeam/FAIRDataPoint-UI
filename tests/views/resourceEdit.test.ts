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

const state = vi.hoisted(() => ({ canEdit: false }))
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
        loading: false,
        error: null,
        title: 'Test resource',
        description: null,
        rawTurtle: ref(null),
        breadcrumbs: [],
        metadataRows: [],
        unknownMetadataRows: [],
        childSections: [],
        childSummaries: {},
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
})
