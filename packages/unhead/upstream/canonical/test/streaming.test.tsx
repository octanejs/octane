import { Buffer } from 'node:buffer'
import { PassThrough } from 'node:stream'
// @vitest-environment node
import React, { Suspense, use } from 'react'
import { renderToPipeableStream } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { useHead } from '../src/composables'
import { UnheadProvider } from '../src/server'
import { createStreamableHead, renderSSRHeadShell, renderSSRHeadSuspenseChunk } from '../src/stream/server'

// Helper to collect stream output
function collectStream(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on('data', chunk => chunks.push(Buffer.from(chunk)))
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    stream.on('error', reject)
  })
}

describe('react streaming SSR', () => {
  describe('createStreamableHead', () => {
    it('creates streamable head instance', () => {
      const { head } = createStreamableHead()
      // Streamable head uses entries Map to track pending head updates
      expect(head.entries).toBeInstanceOf(Map)
    })

    it('uses custom stream key', async () => {
      const { head } = createStreamableHead({ streamKey: '__custom__' })
      head.push({ title: 'Test' })

      const shell = await renderSSRHeadShell(head, '<html><head></head><body>')
      expect(shell).toContain('window.__custom__')
    })
  })

  describe('renderSSRHeadShell', () => {
    it('renders initial head tags into shell', async () => {
      const { head } = createStreamableHead()
      head.push({
        title: 'React Streaming Test',
        meta: [{ name: 'description', content: 'Test description' }],
      })

      const template = '<!DOCTYPE html><html><head></head><body>'
      const result = await renderSSRHeadShell(head, template)

      expect(result).toContain('<title>React Streaming Test</title>')
      expect(result).toContain('<meta name="description" content="Test description">')
      expect(result).toContain('window.__unhead__')
    })

    it('applies html and body attrs', async () => {
      const { head } = createStreamableHead()
      head.push({
        htmlAttrs: { lang: 'en', dir: 'ltr' },
        bodyAttrs: { class: 'dark' },
      })

      const template = '<html><head></head><body>'
      const result = await renderSSRHeadShell(head, template)

      expect(result).toContain('lang="en"')
      expect(result).toContain('dir="ltr"')
      expect(result).toContain('class="dark"')
    })
  })

  describe('renderSSRHeadSuspenseChunk', () => {
    it('returns empty string when no new tags', async () => {
      const { head } = createStreamableHead()
      head.push({ title: 'Test' })

      await renderSSRHeadShell(head, '<html><head></head><body>')

      const result = await renderSSRHeadSuspenseChunk(head)
      expect(result).toBe('')
    })

    it('returns push script for new tags', async () => {
      const { head } = createStreamableHead()
      head.push({ title: 'Initial' })

      await renderSSRHeadShell(head, '<html><head></head><body>')

      head.push({
        title: 'Updated Title',
        meta: [{ name: 'description', content: 'New description' }],
      })

      const result = await renderSSRHeadSuspenseChunk(head)

      expect(result).toContain('window.__unhead__.push')
      expect(result).toContain('Updated Title')
      expect(result).toContain('New description')
    })
  })

  describe('react component integration', () => {
    it('renders component with useHead', async () => {
      const { head } = createStreamableHead()

      function TestComponent() {
        useHead({
          title: 'Component Title',
          meta: [{ name: 'author', content: 'Test Author' }],
        })
        return <div>Test Content</div>
      }

      const passThrough = new PassThrough()
      const { pipe } = renderToPipeableStream(
        <UnheadProvider value={head}>
          <TestComponent />
        </UnheadProvider>,
      )

      pipe(passThrough)
      await collectStream(passThrough)

      const shell = await renderSSRHeadShell(head, '<html><head></head><body>')
      expect(shell).toContain('<title>Component Title</title>')
      expect(shell).toContain('Test Author')
    })

    it('handles Suspense with async component', async () => {
      const { head } = createStreamableHead()

      // Simulate async data
      let resolveData: (value: { title: string }) => void
      const dataPromise = new Promise<{ title: string }>((resolve) => {
        resolveData = resolve
      })

      function AsyncComponent() {
        const data = use(dataPromise)
        useHead({
          title: data.title,
          meta: [{ name: 'async', content: 'loaded' }],
        })
        return <div>{data.title}</div>
      }

      function App() {
        useHead({ title: 'Loading...' })
        return (
          <Suspense fallback={<div>Loading...</div>}>
            <AsyncComponent />
          </Suspense>
        )
      }

      // Start rendering
      const passThrough = new PassThrough()
      const shellReady = new Promise<void>((resolve) => {
        renderToPipeableStream(
          <UnheadProvider value={head}>
            <App />
          </UnheadProvider>,
          {
            onShellReady() {
              resolve()
            },
          },
        ).pipe(passThrough)
      })

      // Wait for shell to be ready (useHead has run)
      await shellReady

      // Get initial shell
      const shell = await renderSSRHeadShell(head, '<html><head></head><body>')
      expect(shell).toContain('<title>Loading...</title>')

      // Resolve async data
      resolveData!({ title: 'Async Content Loaded' })

      // Wait for stream to complete
      await collectStream(passThrough)

      // Get chunk with new head tags
      const chunk = await renderSSRHeadSuspenseChunk(head)
      expect(chunk).toContain('Async Content Loaded')
      expect(chunk).toContain('async')
    })
  })

  describe('xSS prevention', () => {
    it('escapes script tags in content', async () => {
      const { head } = createStreamableHead()
      await renderSSRHeadShell(head, '<html><head></head><body>')

      head.push({
        title: '<script>alert("xss")</script>',
      })

      const result = await renderSSRHeadSuspenseChunk(head)
      expect(result).not.toContain('<script>alert')
      expect(result).toContain('\\u003c')
    })

    it('escapes closing script tags', async () => {
      const { head } = createStreamableHead()
      await renderSSRHeadShell(head, '<html><head></head><body>')

      head.push({
        script: [{ innerHTML: '</script><script>evil()</script>' }],
      })

      const result = await renderSSRHeadSuspenseChunk(head)
      expect(result).not.toContain('</script><script>')
    })
  })

  describe('multiple providers', () => {
    it('supports different stream keys', async () => {
      const { head: head1 } = createStreamableHead({ streamKey: '__react1__' })
      const { head: head2 } = createStreamableHead({ streamKey: '__react2__' })

      head1.push({ title: 'Provider 1' })
      head2.push({ title: 'Provider 2' })

      const shell1 = await renderSSRHeadShell(head1, '<html><head></head><body>')
      const shell2 = await renderSSRHeadShell(head2, '<html><head></head><body>')

      expect(shell1).toContain('window.__react1__')
      expect(shell1).toContain('Provider 1')
      expect(shell2).toContain('window.__react2__')
      expect(shell2).toContain('Provider 2')
    })
  })

  describe('unicode and special characters', () => {
    it('handles emoji in title', async () => {
      const { head } = createStreamableHead()
      head.push({ title: 'React App' })

      const shell = await renderSSRHeadShell(head, '<html><head></head><body>')
      expect(shell).toContain('React App')
    })

    it('handles unicode in meta', async () => {
      const { head } = createStreamableHead()
      await renderSSRHeadShell(head, '<html><head></head><body>')

      head.push({
        meta: [{ name: 'description', content: 'React' }],
      })

      const result = await renderSSRHeadSuspenseChunk(head)
      expect(result).toContain('React')
    })
  })
})
