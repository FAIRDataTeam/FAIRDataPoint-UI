import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { mountComponentSetup } from '../helpers/mountComponentSetup'
import RawContentPanel from '../../src/components/RawContentPanel.vue'

describe('RawContentPanel', () => {
  it.each([
    { language: 'turtle' as const, text: '<urn:s> <urn:p> "<img src=x>" .' },
    { language: 'json' as const, text: '{"value":"<img src=x>"}' },
  ])('highlights $language and escapes embedded HTML', async (props) => {
    const html = await renderToString(createSSRApp(() => h(RawContentPanel, props)))
    expect(html).toContain('class="token')
    expect(html).toContain('&lt;img')
    expect(html).not.toContain('<img')
    expect(html).toContain('height:300px')
    expect(html).toContain('raw-resize-handle')
  })

  it('shows a message instead of the content and resize handle', async () => {
    const html = await renderToString(
      createSSRApp(() =>
        h(RawContentPanel, {
          text: 'stale content',
          language: 'turtle',
          message: 'Loading…',
        }),
      ),
    )
    expect(html).toContain('Loading…')
    expect(html).not.toContain('stale content')
    expect(html).not.toContain('raw-resize-handle')
  })
})

describe('RawContentPanel resizing', () => {
  let events: EventTarget
  let panel: ReturnType<typeof mountPanel>

  function mountPanel() {
    return mountComponentSetup<{
      height: number
      startResize: (event: MouseEvent) => void
    }>(RawContentPanel, { text: '', language: 'turtle' })
  }

  beforeEach(() => {
    events = new EventTarget()
    vi.stubGlobal('window', events)
    panel = mountPanel()
  })

  afterEach(() => {
    panel.unmount()
    vi.unstubAllGlobals()
  })

  function moveTo(clientY: number) {
    events.dispatchEvent(Object.assign(new Event('mousemove'), { clientY }))
  }

  it('tracks drag movement and enforces the minimum height', () => {
    expect(panel.state.height).toBe(300)
    panel.state.startResize({ clientY: 100 } as MouseEvent)
    moveTo(180)
    expect(panel.state.height).toBe(380)
    moveTo(-200)
    expect(panel.state.height).toBe(100)
    moveTo(120)
    expect(panel.state.height).toBe(320)
  })

  it.each(['mouseup', 'unmount'])('stops resizing on %s', (ending) => {
    const remove = vi.spyOn(events, 'removeEventListener')
    panel.state.startResize({ clientY: 100 } as MouseEvent)
    moveTo(150)
    expect(panel.state.height).toBe(350)
    if (ending === 'mouseup') events.dispatchEvent(new Event('mouseup'))
    else panel.unmount()
    expect(remove).toHaveBeenCalledWith('mousemove', expect.any(Function))
    expect(remove).toHaveBeenCalledWith('mouseup', expect.any(Function))
    moveTo(200)
    expect(panel.state.height).toBe(350)
  })
})
