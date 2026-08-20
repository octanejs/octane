// @vitest-environment jsdom
import { act, render } from '@testing-library/react'
import React from 'react'
import { describe, expect, it } from 'vitest'
import { useScript } from '../src'
import { createHead, renderDOMHead, UnheadProvider } from '../src/client'

function wait(ms = 10) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

function getScript(head: any, src: string) {
  return head._scripts[src]
}

async function flushLoad(head: any, src: string, event: 'load' | 'error' = 'load') {
  await act(async () => {
    await renderDOMHead(head)
    await wait()
  })
  document.querySelector(`script[src="${src}"]`)?.dispatchEvent(new Event(event))
  await act(async () => {
    await wait()
  })
}

describe('react useScript', () => {
  it('loads a manual script and fires onLoaded exactly once', async () => {
    const head = createHead()
    let loaded = 0

    function Page() {
      const script = useScript('//react-happy.js', { trigger: 'manual', head })
      script.onLoaded(() => {
        loaded++
      })
      return null
    }

    render(
      <UnheadProvider head={head}>
        <Page />
      </UnheadProvider>,
    )
    await act(async () => {
      await wait()
    })

    const script = getScript(head, '//react-happy.js')
    expect(script.status).toBe('awaitingLoad')

    script.load()
    await flushLoad(head, '//react-happy.js')

    expect(loaded).toBe(1)
    expect(script.status).toBe('loaded')
  })

  it('fires onError when the script fails to load', async () => {
    const head = createHead()
    let errored = 0

    function Page() {
      const script = useScript('//react-error.js', { trigger: 'manual', head })
      script.onError(() => {
        errored++
      })
      return null
    }

    render(
      <UnheadProvider head={head}>
        <Page />
      </UnheadProvider>,
    )
    await act(async () => {
      await wait()
    })

    const script = getScript(head, '//react-error.js')
    script.load()
    await flushLoad(head, '//react-error.js', 'error')

    expect(errored).toBe(1)
    expect(script.status).toBe('error')
  })

  it('loads when a promise trigger resolves while mounted', async () => {
    const head = createHead()
    let resolveTrigger!: () => void
    const trigger = new Promise<void>((resolve) => {
      resolveTrigger = resolve
    })

    function Page() {
      useScript('//react-promise.js', { trigger, head })
      return null
    }

    render(
      <UnheadProvider head={head}>
        <Page />
      </UnheadProvider>,
    )
    await act(async () => {
      await wait()
    })

    const script = getScript(head, '//react-promise.js')
    expect(script.status).toBe('awaitingLoad')

    resolveTrigger()
    await act(async () => {
      await renderDOMHead(head)
      await wait()
    })

    expect(script.status).not.toBe('awaitingLoad')
    expect(document.querySelector('script[src="//react-promise.js"]')).not.toBeNull()
  })

  it('disposes the correct onLoaded callback when handles are removed out of order', async () => {
    const head = createHead()
    const calls: string[] = []
    let offFirst!: () => void
    let offSecond!: () => void

    function Page() {
      const script = useScript('//react-order.js', { trigger: 'manual', head })
      React.useEffect(() => {
        offFirst = script.onLoaded(() => {
          calls.push('first')
        }) as unknown as () => void
        offSecond = script.onLoaded(() => {
          calls.push('second')
        }) as unknown as () => void
        // intentionally no cleanup: the test disposes the handles manually
      }, [script])
      return null
    }

    render(
      <UnheadProvider head={head}>
        <Page />
      </UnheadProvider>,
    )
    await act(async () => {
      await wait()
    })

    // dispose out of order: index-based cleanup would leave `second` registered
    offFirst()
    offSecond()

    const script = getScript(head, '//react-order.js')
    script.load()
    await flushLoad(head, '//react-order.js')

    expect(calls).toEqual([])
  })

  it('passes the use() API to onLoaded after the script loads', async () => {
    const head = createHead()
    let initCalls = 0
    const api = {
      init() {
        initCalls++
      },
    }

    function Page() {
      const script = useScript<typeof api>('//react-use.js', {
        trigger: 'manual',
        head,
        use: () => api,
      })
      script.onLoaded((vm) => {
        vm.init()
      })
      return null
    }

    render(
      <UnheadProvider head={head}>
        <Page />
      </UnheadProvider>,
    )
    await act(async () => {
      await wait()
    })

    const script = getScript(head, '//react-use.js')
    script.load()
    await flushLoad(head, '//react-use.js')

    expect(initCalls).toBe(1)
  })

  it('preserves an async callback result', async () => {
    const head = createHead()
    let called = false

    function Page() {
      const script = useScript('//react-async-callback.js', { trigger: 'manual', head })
      script.onLoaded(async () => {
        await Promise.resolve()
        called = true
      })
      return null
    }

    render(
      <UnheadProvider head={head}>
        <Page />
      </UnheadProvider>,
    )
    await act(async () => {
      await wait()
    })

    const sharedScript = getScript(head, '//react-async-callback.js')
    const result = sharedScript._cbs.loaded![0]({})

    expect(result).toBeInstanceOf(Promise)
    await result
    expect(called).toBe(true)
  })
})
