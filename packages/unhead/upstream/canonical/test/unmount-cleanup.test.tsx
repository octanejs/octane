// @vitest-environment jsdom
import { act, fireEvent, render } from '@testing-library/react'
import React, { StrictMode, useState } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { useHead, useScript } from '../src'
import { createHead, renderDOMHead, UnheadProvider } from '../src/client'
import { Head } from '../src/components'
import { createHead as createServerHead, renderSSRHead } from '../src/server'

/**
 * Reproduction of https://github.com/unjs/unhead/issues/558
 * React 18 reporter says metadata persists after component unmount
 */

function Page1() {
  useHead({
    title: 'Page 1 title',
    meta: [{ name: 'description', content: 'page 1 description' }],
  })
  return <div>Page 1</div>
}

function Page2() {
  return <div>Page 2</div>
}

function App({ head }: { head: ReturnType<typeof createHead> }) {
  const [currPage, setCurrPage] = useState<'Page 1' | 'Page 2'>('Page 2')
  return (
    <UnheadProvider head={head}>
      <button onClick={() => setCurrPage('Page 1')}>Page 1</button>
      <button onClick={() => setCurrPage('Page 2')}>Page 2</button>
      {currPage === 'Page 1' ? <Page1 /> : <Page2 />}
    </UnheadProvider>
  )
}

function wait(ms = 10) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

describe('issue #558 - unmount cleanup', () => {
  it('restores init values after component unmount (DOM rendering)', async () => {
    const head = createHead({
      init: [{
        title: 'Example fallback',
        meta: [{ name: 'description', content: 'some description' }],
      }],
    })

    const { getByText } = render(<App head={head} />)

    // Initial DOM render
    await act(async () => {
      await renderDOMHead(head)
      await wait()
    })

    expect(document.title).toBe('Example fallback')

    // Switch to Page 1
    await act(async () => {
      fireEvent.click(getByText('Page 1'))
      await wait()
    })
    await act(async () => {
      await renderDOMHead(head)
      await wait()
    })

    expect(document.title).toBe('Page 1 title')

    // Switch back to Page 2
    await act(async () => {
      fireEvent.click(getByText('Page 2'))
      await wait()
    })
    await act(async () => {
      await renderDOMHead(head)
      await wait()
    })

    expect(document.title).toBe('Example fallback')
  })

  it('handles multiple page switches correctly (DOM)', async () => {
    const head = createHead({
      init: [{
        title: 'Fallback',
        meta: [{ name: 'description', content: 'fallback desc' }],
      }],
    })

    const { getByText } = render(<App head={head} />)

    for (let i = 0; i < 3; i++) {
      await act(async () => {
        fireEvent.click(getByText('Page 1'))
        await wait()
      })
      await act(async () => {
        await renderDOMHead(head)
        await wait()
      })
      expect(document.title).toBe('Page 1 title')

      await act(async () => {
        fireEvent.click(getByText('Page 2'))
        await wait()
      })
      await act(async () => {
        await renderDOMHead(head)
        await wait()
      })
      expect(document.title).toBe('Fallback')
    }
  })

  it('direct unmount restores init values (DOM)', async () => {
    const head = createHead({
      init: [{
        title: 'Init Title',
        meta: [{ name: 'description', content: 'init description' }],
      }],
    })

    function PageWithHead() {
      useHead({
        title: 'Component Title',
        meta: [{ name: 'description', content: 'component description' }],
      })
      return <div>Has Head</div>
    }

    const { unmount } = render(
      <UnheadProvider head={head}>
        <PageWithHead />
      </UnheadProvider>,
    )

    await act(async () => {
      await renderDOMHead(head)
      await wait()
    })

    expect(document.title).toBe('Component Title')

    await act(async () => {
      unmount()
      await wait()
    })
    await act(async () => {
      await renderDOMHead(head)
      await wait()
    })

    expect(document.title).toBe('Init Title')
  })

  it('entries state is correct through mount/unmount cycle', async () => {
    const head = createHead({
      init: [{
        title: 'Init',
      }],
    })

    function PageWithHead() {
      useHead({ title: 'Component' })
      return <div>Has Head</div>
    }

    // Initially, only init entry
    expect(head.entries.size).toBe(1)

    const { unmount } = render(
      <UnheadProvider head={head}>
        <PageWithHead />
      </UnheadProvider>,
    )

    await act(async () => {
      await wait()
    })

    // After mount, should have 2 entries
    expect(head.entries.size).toBe(2)

    await act(async () => {
      unmount()
      await wait()
    })

    // After unmount, back to 1 entry (init only)
    expect(head.entries.size).toBe(1)
  })

  it('head component keeps one entry in StrictMode and disposes on unmount', async () => {
    const head = createHead({
      init: [{
        title: 'Init',
      }],
    })

    function PageWithHead() {
      return (
        <Head>
          <title>Component</title>
          <meta name="description" content="component description" />
        </Head>
      )
    }

    expect(head.entries.size).toBe(1)

    const { unmount } = render(
      <StrictMode>
        <UnheadProvider head={head}>
          <PageWithHead />
        </UnheadProvider>
      </StrictMode>,
    )

    await act(async () => {
      await wait()
    })

    expect(head.entries.size).toBe(2)
    let rendered = await renderSSRHead(head)
    expect(rendered.headTags).toContain('<title>Component</title>')
    expect(rendered.headTags).toContain('component description')

    await act(async () => {
      unmount()
      await wait()
    })

    expect(head.entries.size).toBe(1)
    rendered = await renderSSRHead(head)
    expect(rendered.headTags).toContain('<title>Init</title>')
    expect(rendered.headTags).not.toContain('Component')
  })

  it('head component pushes during React server rendering', async () => {
    const head = createServerHead({ disableDefaults: true })

    renderToString(
      <UnheadProvider head={head}>
        <Head>
          <title>Server Component</title>
          <meta name="description" content="server description" />
        </Head>
      </UnheadProvider>,
    )

    expect(head.entries.size).toBe(1)
    const rendered = await renderSSRHead(head)
    expect(rendered.headTags).toContain('<title>Server Component</title>')
    expect(rendered.headTags).toContain('server description')
  })

  it('head component patches the same StrictMode entry on prop updates', async () => {
    const head = createHead({
      init: [{
        title: 'Init',
      }],
    })

    function PageWithHead({ title }: { title: string }) {
      return (
        <Head>
          <title>{title}</title>
        </Head>
      )
    }

    const renderApp = (title: string) => (
      <StrictMode>
        <UnheadProvider head={head}>
          <PageWithHead title={title} />
        </UnheadProvider>
      </StrictMode>
    )

    const { rerender } = render(renderApp('First'))

    await act(async () => {
      await wait()
    })

    expect(head.entries.size).toBe(2)
    const entryKeys = [...head.entries.keys()]
    let rendered = await renderSSRHead(head)
    expect(rendered.headTags).toContain('<title>First</title>')

    rerender(renderApp('Second'))
    await act(async () => {
      await wait()
    })

    expect(head.entries.size).toBe(2)
    expect([...head.entries.keys()]).toEqual(entryKeys)
    rendered = await renderSSRHead(head)
    expect(rendered.headTags).toContain('<title>Second</title>')
    expect(rendered.headTags).not.toContain('<title>First</title>')
  })

  it('does not load a promise-triggered script after StrictMode unmount', async () => {
    const head = createHead()
    let resolveTrigger!: () => void
    const trigger = new Promise<void>((resolve) => {
      resolveTrigger = resolve
    })

    function PageWithScript() {
      useScript('//react-strict-script.js', {
        trigger,
        head,
      })
      return null
    }

    const { unmount } = render(
      <StrictMode>
        <UnheadProvider head={head}>
          <PageWithScript />
        </UnheadProvider>
      </StrictMode>,
    )

    await act(async () => {
      await wait()
    })

    const script = (head as any)._scripts['//react-strict-script.js']
    expect(script.status).toBe('awaitingLoad')

    await act(async () => {
      unmount()
      await wait()
    })

    resolveTrigger()
    await act(async () => {
      await wait()
    })

    expect(script.status).toBe('awaitingLoad')
    expect(document.querySelector('script[src="//react-strict-script.js"]')).toBeNull()
  })

  it('keeps script callbacks registered through StrictMode effect replay', async () => {
    const head = createHead()
    let loaded = 0

    function PageWithScript() {
      const script = useScript('//react-strict-callback.js', {
        trigger: 'manual',
        head,
      })
      script.onLoaded(() => {
        loaded++
      })
      return null
    }

    render(
      <StrictMode>
        <UnheadProvider head={head}>
          <PageWithScript />
        </UnheadProvider>
      </StrictMode>,
    )

    await act(async () => {
      await wait()
    })

    const script = (head as any)._scripts['//react-strict-callback.js']
    expect(script._cbs.loaded).toHaveLength(1)

    script.load()
    await act(async () => {
      await renderDOMHead(head)
      await wait()
    })

    document
      .querySelector('script[src="//react-strict-callback.js"]')
      ?.dispatchEvent(new Event('load'))

    await act(async () => {
      await wait()
    })

    expect(loaded).toBe(1)
  })

  it('keeps post-commit script callbacks registered across rerenders', async () => {
    const head = createHead()
    let loaded = 0

    function PageWithScript({ label }: { label: string }) {
      const script = useScript('//react-effect-callback.js', {
        trigger: 'manual',
        head,
      })
      React.useEffect(() => {
        return script.onLoaded(() => {
          loaded++
        })
      }, [script])
      return <div>{label}</div>
    }

    const renderApp = (label: string) => (
      <UnheadProvider head={head}>
        <PageWithScript label={label} />
      </UnheadProvider>
    )

    const { rerender } = render(renderApp('first'))

    await act(async () => {
      await wait()
    })

    const script = (head as any)._scripts['//react-effect-callback.js']
    expect(script._cbs.loaded).toHaveLength(1)

    rerender(renderApp('second'))
    await act(async () => {
      await wait()
    })

    expect(script._cbs.loaded).toHaveLength(1)

    script.load()
    await act(async () => {
      await renderDOMHead(head)
      await wait()
    })

    document
      .querySelector('script[src="//react-effect-callback.js"]')
      ?.dispatchEvent(new Event('load'))

    await act(async () => {
      await wait()
    })

    expect(loaded).toBe(1)
  })
})
