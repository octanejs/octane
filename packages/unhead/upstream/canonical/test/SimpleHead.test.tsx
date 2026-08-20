import { render } from '@testing-library/react'
// @vitest-environment jsdom
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Head } from '../src'
import { createHead, renderDOMHead, UnheadProvider } from '../src/client'
import { renderSSRHead } from '../src/server'
import { SimpleHead } from './fixtures/SimpleHead'

describe('simpleHead component', () => {
  it('renders default head tags correctly', async () => {
    const head = createHead()

    render(
      <UnheadProvider head={head}>
        <SimpleHead />
      </UnheadProvider>,
    )

    const { headTags } = renderSSRHead(head)
    expect(headTags).toMatchInlineSnapshot(`
      "<meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Default Title 2</title>
      <script async src="https://example.com/async-script.js"></script>
      <script nomodule src="https://example.com/nomodule.js"></script>
      <link rel="stylesheet" href="default-styles.css">
      <style>body { background-color: #f0f0f0; }</style>
      <link rel="preload" href="https://example.com/font.woff2" as="font" type="font/woff2">
      <script type="module" src="https://example.com/module.js"></script>
      <script defer src="https://example.com/defer-script.js"></script>
      <link rel="dns-prefetch" href="//example.com">
      <link rel="prefetch" href="https://example.com/next-page">
      <link rel="prerender" href="https://example.com/next-page">
      <meta name="description" content="Default Description">
      <meta http-equiv="Content-Security-Policy" content="default-src 'self'">
      <link rel="icon" href="favicon.ico">
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"Example","url":"https://www.example.com"}</script>"
    `)
  })
  it('renders nothing if component is unmounted', async () => {
    const head = createHead()

    const { unmount } = render(
      <UnheadProvider head={head}>
        <SimpleHead />
      </UnheadProvider>,
    )

    unmount()

    const { headTags } = renderSSRHead(head)
    expect(headTags).toBe('')
  })

  it('normalizes React head prop names in the DOM', async () => {
    const head = createHead()
    const onLoad = vi.fn()

    render(
      <UnheadProvider head={head}>
        <Head>
          <meta
            ref={React.createRef<HTMLMetaElement>()}
            httpEquiv="refresh"
            content="0;url=/next"
            className="refresh metadata"
            style={{ color: 'red' }}
            itemProp="refresh"
            suppressContentEditableWarning
            suppressHydrationWarning
          />
          <link
            rel="preload"
            href="/hero.png"
            as="image"
            crossOrigin="anonymous"
            fetchPriority="high"
            hrefLang="en"
            imageSrcSet="/hero.png 1x, /hero-2x.png 2x"
            imageSizes="100vw"
            referrerPolicy="no-referrer"
          />
          <script
            src="/legacy.js"
            charSet="utf-8"
            crossOrigin="use-credentials"
            fetchPriority="low"
            noModule
            referrerPolicy="origin"
            onLoad={onLoad}
          />
        </Head>
      </UnheadProvider>,
    )

    await renderDOMHead(head, { document })

    const meta = document.head.querySelector('meta[http-equiv="refresh"]')
    expect(meta).not.toBeNull()
    expect(meta?.getAttribute('httpequiv')).toBeNull()
    expect(meta?.className).toBe('refresh metadata')
    expect((meta as HTMLElement).style.color).toBe('red')
    expect(meta?.getAttribute('itemprop')).toBe('refresh')
    expect(meta?.hasAttribute('ref')).toBe(false)
    expect(meta?.hasAttribute('suppresscontenteditablewarning')).toBe(false)
    expect(meta?.hasAttribute('suppresshydrationwarning')).toBe(false)

    const link = document.head.querySelector('link[href="/hero.png"]')
    expect(link?.getAttribute('crossorigin')).toBe('anonymous')
    expect(link?.getAttribute('fetchpriority')).toBe('high')
    expect(link?.getAttribute('hreflang')).toBe('en')
    expect(link?.getAttribute('imagesrcset')).toBe('/hero.png 1x, /hero-2x.png 2x')
    expect(link?.getAttribute('imagesizes')).toBe('100vw')
    expect(link?.getAttribute('referrerpolicy')).toBe('no-referrer')

    const script = document.head.querySelector('script[src="/legacy.js"]')
    expect(script?.getAttribute('charset')).toBe('utf-8')
    expect(script?.getAttribute('crossorigin')).toBe('use-credentials')
    expect(script?.getAttribute('fetchpriority')).toBe('low')
    expect(script?.hasAttribute('nomodule')).toBe(true)
    expect(script?.getAttribute('referrerpolicy')).toBe('origin')
    script?.dispatchEvent(new Event('load'))
    expect(onLoad).toHaveBeenCalledOnce()
  })

  it('renders nested fragment children', async () => {
    const head = createHead()

    render(
      <UnheadProvider head={head}>
        <Head>
          <>
            {[
              <meta key="meta" name="fragment-meta" content="nested" />,
              <React.Fragment key="script">
                {null}
                <meta name="fragment-meta-2" content="nested-2" />
                <script>window.__FRAGMENT_TEST__ = true</script>
              </React.Fragment>,
            ]}
          </>
        </Head>
      </UnheadProvider>,
    )

    const { headTags } = renderSSRHead(head)
    expect(headTags).toMatchInlineSnapshot(`
      "<script>window.__FRAGMENT_TEST__ = true</script>
      <meta name="fragment-meta" content="nested">
      <meta name="fragment-meta-2" content="nested-2">"
    `)
  })
})
