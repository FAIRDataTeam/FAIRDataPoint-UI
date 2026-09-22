import { createRenderer, getCurrentInstance, ssrContextKey, type Component } from 'vue'

/** Runs setup and watchers without rendering. Does not test DOM events, focus or markup. */
export function mountComponentSetup<State>(component: Component, props?: Record<string, unknown>) {
  const renderer = createRenderer<object, object>({
    createElement: () => ({}),
    createText: () => ({}),
    createComment: () => ({}),
    setText() {},
    setElementText() {},
    patchProp() {},
    insert() {},
    remove() {},
    parentNode: () => null,
    nextSibling: () => null,
  })
  let state!: State
  const app = renderer.createApp({ ...component, render: () => null }, props)
  app.provide(ssrContextKey, {})
  app.mixin({
    created() {
      // Read internal script-setup bindings without exposing them in production.
      state = (getCurrentInstance() as unknown as { setupState: State }).setupState
    },
  })
  app.mount({})
  return { state, unmount: () => app.unmount() }
}
