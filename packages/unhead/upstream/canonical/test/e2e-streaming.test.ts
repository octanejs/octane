import { PassThrough } from 'node:stream'
import { createElement, Suspense, use, useContext } from 'react'
import { renderToPipeableStream } from 'react-dom/server'
import { renderSSRHeadSuspenseChunk } from 'unhead/stream/server'
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { useHead } from '../src/composables'
import { UnheadContext } from '../src/context'
import { createStreamableHead, renderSSRHeadShell } from '../src/stream/server'

const XSS_RE = /<title>.*<script>alert.*<\/title>/i

// Manual HeadStream for testing
function HeadStream() {
  const head = useContext(UnheadContext)
  if (!head)
    return null

  const update = renderSSRHeadSuspenseChunk(head)
  if (update)
    return createElement('script', { dangerouslySetInnerHTML: { __html: update } })

  return null
}

function UnheadProvider({ children, value }: { children?: React.ReactNode, value: any }) {
  return createElement(UnheadContext.Provider, { value }, children)
}

// Helper to collect stream into string
function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = []
    stream.on('data', chunk => chunks.push(chunk.toString()))
    stream.on('end', () => resolve(chunks.join('')))
    stream.on('error', reject)
  })
}

// Create a promise that can be resolved externally
function createResolvablePromise<T>() {
  let resolve: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve: resolve! }
}

describe('react streaming SSR e2e', () => {
  describe('suspense with HeadStream integration', () => {
    it('streams initial head tags in shell (pushed before render)', async () => {
      const { head } = createStreamableHead()

      // Push head tags BEFORE React render (simulating pre-render setup)
      head.push({
        title: 'Initial Title',
        meta: [{ name: 'description', content: 'Initial description' }],
      })

      const template = `<!DOCTYPE html><html><head></head><body><!--app-html--></body></html>`
      const [htmlStart] = template.split('<!--app-html-->')

      // Render shell
      const shell = await renderSSRHeadShell(head, htmlStart)

      // Shell should contain initial head tags
      expect(shell).toContain('<title>Initial Title</title>')
      expect(shell).toContain('name="description"')
      expect(shell).toContain('Initial description')
      expect(shell).toContain('window.__unhead__')
    })

    it('suspense with HeadStream streams head updates inline with async content', async () => {
      const { head } = createStreamableHead()
      const { promise: dataPromise, resolve: resolveData } = createResolvablePromise<{ title: string }>()

      // Async component that uses useHead after data loads
      function AsyncComponent() {
        const data = use(dataPromise)
        useHead({ title: data.title })
        return createElement('div', null, `Loaded: ${data.title}`)
      }

      // App with Suspense and HeadStream - head calls happen during React render
      function App() {
        return createElement(
          Suspense,
          { fallback: createElement('div', null, 'Loading...') },
          createElement(AsyncComponent),
          createElement(HeadStream),
        )
      }

      const template = `<!DOCTYPE html><html><head></head><body><!--app-html--></body></html>`
      const [htmlStart, htmlEnd] = template.split('<!--app-html-->')

      // Render shell first (no useHead calls yet - those happen during React render)
      const shell = await renderSSRHeadShell(head, htmlStart)
      let fullHtml = shell

      // Start streaming
      const passThrough = new PassThrough()
      const { pipe } = renderToPipeableStream(
        createElement(UnheadProvider, { value: head }, createElement(App)),
        {
          onShellReady() {
            pipe(passThrough)
          },
        },
      )

      // Give time for shell to stream
      await new Promise(r => setTimeout(r, 50))

      // Resolve the async data
      resolveData({ title: 'Async Title' })

      // Wait for stream to complete
      const streamedContent = await streamToString(passThrough)
      fullHtml += streamedContent

      fullHtml += htmlEnd

      // Verify the full output contains the head update mechanism
      expect(fullHtml).toContain('window.__unhead__')
      // The async title should appear in the full output
      expect(fullHtml).toContain('Async Title')
      // Content should be rendered
      expect(streamedContent).toContain('Loaded: Async Title')
    })

    it('handles multiple async components with useHead', async () => {
      const { head } = createStreamableHead()
      const { promise: promise1, resolve: resolve1 } = createResolvablePromise<string>()
      const { promise: promise2, resolve: resolve2 } = createResolvablePromise<string>()

      function AsyncComponent1() {
        const title = use(promise1)
        useHead({
          title,
          meta: [{ property: 'og:title', content: title }],
        })
        return createElement('div', null, title)
      }

      function AsyncComponent2() {
        const desc = use(promise2)
        useHead({
          meta: [{ property: 'og:description', content: desc }],
        })
        return createElement('div', null, desc)
      }

      function App() {
        return createElement(
          'div',
          null,
          createElement(
            Suspense,
            { fallback: createElement('div', null, 'Loading 1...') },
            createElement(AsyncComponent1),
            createElement(HeadStream),
          ),
          createElement(
            Suspense,
            { fallback: createElement('div', null, 'Loading 2...') },
            createElement(AsyncComponent2),
            createElement(HeadStream),
          ),
        )
      }

      const template = `<!DOCTYPE html><html><head></head><body><!--app-html--></body></html>`
      const [htmlStart, htmlEnd] = template.split('<!--app-html-->')

      const shell = await renderSSRHeadShell(head, htmlStart)

      const passThrough = new PassThrough()
      const { pipe } = renderToPipeableStream(
        createElement(UnheadProvider, { value: head }, createElement(App)),
        {
          onShellReady() {
            pipe(passThrough)
          },
        },
      )

      // Resolve async components in order
      await new Promise(r => setTimeout(r, 10))
      resolve1('First Component Title')

      await new Promise(r => setTimeout(r, 10))
      resolve2('Second Component Description')

      const streamedContent = await streamToString(passThrough)
      const fullHtml = shell + streamedContent + htmlEnd

      // Both component contents should be in the output
      expect(fullHtml).toContain('First Component Title')
      expect(fullHtml).toContain('Second Component Description')
      // Head updates should be streamed
      expect(fullHtml).toContain('window.__unhead__')
    })

    it('escapes XSS in head content', async () => {
      const { head } = createStreamableHead()

      // Test that XSS is escaped when pushing directly
      head.push({
        title: '</script><script>alert("xss")</script>',
      })

      const template = `<!DOCTYPE html><html><head></head><body><!--app-html--></body></html>`
      const [htmlStart] = template.split('<!--app-html-->')

      const shell = await renderSSRHeadShell(head, htmlStart)

      // The title should be escaped - no raw </script> inside <title>
      // The title tag itself should have the escaped content
      expect(shell).toContain('<title>')
      // Should NOT contain unescaped script injection
      expect(shell).not.toMatch(XSS_RE)
    })

    it('handles nested Suspense with head updates', async () => {
      const { head } = createStreamableHead()
      const { promise: outerPromise, resolve: resolveOuter } = createResolvablePromise<string>()
      const { promise: innerPromise, resolve: resolveInner } = createResolvablePromise<string>()

      // Push initial title before render
      head.push({ title: 'Nested Test' })

      function InnerAsync() {
        const data = use(innerPromise)
        useHead({
          meta: [{ name: 'inner', content: data }],
        })
        return createElement('div', null, `Inner: ${data}`)
      }

      function OuterAsync() {
        const data = use(outerPromise)
        useHead({
          meta: [{ name: 'outer', content: data }],
        })
        return createElement(
          'div',
          null,
          `Outer: ${data}`,
          createElement(
            Suspense,
            { fallback: createElement('div', null, 'Inner loading...') },
            createElement(InnerAsync),
            createElement(HeadStream),
          ),
        )
      }

      function App() {
        return createElement(
          Suspense,
          { fallback: createElement('div', null, 'Outer loading...') },
          createElement(OuterAsync),
          createElement(HeadStream),
        )
      }

      const template = `<!DOCTYPE html><html><head></head><body><!--app-html--></body></html>`
      const [htmlStart, htmlEnd] = template.split('<!--app-html-->')

      const shell = await renderSSRHeadShell(head, htmlStart)
      expect(shell).toContain('<title>Nested Test</title>')

      const passThrough = new PassThrough()
      const { pipe } = renderToPipeableStream(
        createElement(UnheadProvider, { value: head }, createElement(App)),
        {
          onShellReady() {
            pipe(passThrough)
          },
        },
      )

      await new Promise(r => setTimeout(r, 10))
      resolveOuter('outer-data')

      await new Promise(r => setTimeout(r, 10))
      resolveInner('inner-data')

      const streamedContent = await streamToString(passThrough)
      const fullHtml = shell + streamedContent + htmlEnd

      // Both data should be in the output
      expect(fullHtml).toContain('outer-data')
      expect(fullHtml).toContain('inner-data')
    })
  })

  describe('zero-config streaming', () => {
    it('works without any middleware when using Suspense with HeadStream', async () => {
      const { head } = createStreamableHead()
      const { promise: dataPromise, resolve: resolveData } = createResolvablePromise<string>()

      function AsyncPage() {
        const title = use(dataPromise)
        useHead({ title })
        return createElement('h1', null, title)
      }

      // This simulates what the Vite plugin does - adds HeadStream to Suspense
      function App() {
        return createElement(
          Suspense,
          { fallback: createElement('div', null, 'Loading...') },
          createElement(AsyncPage),
          createElement(HeadStream),
        )
      }

      const template = `<!DOCTYPE html><html><head></head><body><!--app-html--></body></html>`
      const [htmlStart, htmlEnd] = template.split('<!--app-html-->')

      // Simple server - NO transform stream, NO middleware
      const shell = await renderSSRHeadShell(head, htmlStart)
      let fullHtml = shell

      const passThrough = new PassThrough()
      const { pipe } = renderToPipeableStream(
        createElement(UnheadProvider, { value: head }, createElement(App)),
        {
          onShellReady() {
            pipe(passThrough)
          },
        },
      )

      await new Promise(r => setTimeout(r, 10))
      resolveData('Zero Config Title')

      const streamedContent = await streamToString(passThrough)
      fullHtml += streamedContent
      fullHtml += htmlEnd

      // Verify the full HTML contains everything needed
      expect(fullHtml).toContain('<!DOCTYPE html>')
      expect(fullHtml).toContain('<head>')
      expect(fullHtml).toContain('window.__unhead__')
      expect(fullHtml).toContain('Zero Config Title')
      expect(fullHtml).toContain('</body></html>')
    })
  })
})
