// @vitest-environment node
import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Head } from '../src'
import { UnheadProvider } from '../src/client'
import { createHead, renderSSRHead, transformHtmlTemplate } from '../src/server'
import { SimpleHead } from './fixtures/SimpleHead'

const HEAD_RE = /<head>(.*?)<\/head>/s

describe('simpleHead component in ssr', () => {
  it('renders default head tags correctly', async () => {
    const head = createHead({ disableDefaults: true })

    renderToString(
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
  it('renders head tags correctly with SSR', async () => {
    const head = createHead({ disableDefaults: true })
    const html = renderToString(
      <html>
        <head></head>
        <body>
          <UnheadProvider head={head}>
            <SimpleHead />
          </UnheadProvider>
        </body>
      </html>,
    )

    const transformed = await transformHtmlTemplate(head, html)

    const headContent = transformed.match(HEAD_RE)?.[1] || ''
    expect(headContent).toMatchInlineSnapshot(`
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

  it('normalizes React head prop names during SSR', async () => {
    const head = createHead({ disableDefaults: true })

    renderToString(
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
          />
        </Head>
      </UnheadProvider>,
    )

    const { headTags } = renderSSRHead(head)
    expect(headTags).toContain('http-equiv="refresh"')
    expect(headTags).not.toContain('httpequiv=')
    expect(headTags).toContain('class="refresh metadata"')
    expect(headTags).toContain('style="color:red"')
    expect(headTags).toContain('itemprop="refresh"')
    expect(headTags).not.toContain(' ref=')
    expect(headTags).not.toContain('suppresscontenteditablewarning')
    expect(headTags).not.toContain('suppresshydrationwarning')
    expect(headTags).toContain('crossorigin="anonymous"')
    expect(headTags).toContain('fetchpriority="high"')
    expect(headTags).toContain('hreflang="en"')
    expect(headTags).toContain('imagesrcset="/hero.png 1x, /hero-2x.png 2x"')
    expect(headTags).toContain('imagesizes="100vw"')
    expect(headTags).toContain('referrerpolicy="no-referrer"')
    expect(headTags).toContain('charset="utf-8"')
    expect(headTags).toContain('crossorigin="use-credentials"')
    expect(headTags).toContain('fetchpriority="low"')
    expect(headTags).toContain('nomodule')
    expect(headTags).toContain('referrerpolicy="origin"')
  })

  it('renders nested fragment children', async () => {
    const head = createHead({ disableDefaults: true })

    renderToString(
      <UnheadProvider head={head}>
        <Head>
          <>
            {[
              <meta key="meta" name="fragment-meta" content="nested" />,
              <React.Fragment key="script">
                {false}
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

  it('preserves numeric zero children', () => {
    const head = createHead({ disableDefaults: true })

    renderToString(
      <UnheadProvider head={head}>
        <Head>
          <title>{0}</title>
          <script type="text/plain">{0}</script>
          <style>{0}</style>
          <noscript>{0}</noscript>
        </Head>
      </UnheadProvider>,
    )

    const { headTags } = renderSSRHead(head)
    expect(headTags).toContain('<title>0</title>')
    expect(headTags).toContain('<script type="text/plain">0</script>')
    expect(headTags).toContain('<style>0</style>')
    expect(headTags).toContain('<noscript>0</noscript>')
  })
})
