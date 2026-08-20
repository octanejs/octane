// @vitest-environment node
import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { UnheadProvider } from '../src/client'
import { useHead, useHeadSafe, useSeoMeta } from '../src/composables'
import { createHead, renderSSRHead, transformHtmlTemplate } from '../src/server'
import { SimpleHead } from './fixtures/SimpleHead'

const HEAD_RE = /<head>(.*?)<\/head>/s

describe('react SSR useHead regression', () => {
  it('renders SimpleHead component tags correctly', async () => {
    const head = createHead()

    renderToString(
      <UnheadProvider head={head}>
        <SimpleHead />
      </UnheadProvider>,
    )

    const { headTags } = await renderSSRHead(head)
    expect(headTags).toContain('<title>Default Title 2</title>')
    expect(headTags).toContain('Default Description')
    expect(headTags).toContain('favicon.ico')
  })

  it('renders SimpleHead with transformHtmlTemplate', async () => {
    const head = createHead()
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
    expect(headContent).toContain('<title>Default Title 2</title>')
    expect(headContent).toContain('Default Description')
  })

  it('useHead entries are available during SSR', async () => {
    const head = createHead()

    function Page() {
      useHead({
        title: 'SSR Title',
        meta: [{ name: 'description', content: 'SSR Description' }],
      })
      return <div>Hello</div>
    }

    renderToString(
      <UnheadProvider head={head}>
        <Page />
      </UnheadProvider>,
    )

    const { headTags } = await renderSSRHead(head)
    expect(headTags).toContain('<title>SSR Title</title>')
    expect(headTags).toContain('SSR Description')
  })

  it('useHeadSafe entries are available during SSR', async () => {
    const head = createHead()

    function Page() {
      useHeadSafe({
        meta: [
          { name: 'description', content: 'Safe Desc' },
          { name: 'robots', content: 'noindex' },
        ],
      })
      return <div>Hello</div>
    }

    renderToString(
      <UnheadProvider head={head}>
        <Page />
      </UnheadProvider>,
    )

    const { headTags } = await renderSSRHead(head)
    expect(headTags).toContain('Safe Desc')
    expect(headTags).toContain('noindex')
  })

  it('useSeoMeta entries are available during SSR', async () => {
    const head = createHead()

    function Page() {
      useSeoMeta({
        title: 'SEO Title',
        ogTitle: 'OG Title',
        description: 'SEO Desc',
      })
      return <div>Hello</div>
    }

    renderToString(
      <UnheadProvider head={head}>
        <Page />
      </UnheadProvider>,
    )

    const { headTags } = await renderSSRHead(head)
    expect(headTags).toContain('<title>SEO Title</title>')
    expect(headTags).toContain('SEO Desc')
  })

  it('multiple useHead calls from nested components merge correctly', async () => {
    const head = createHead()

    function Layout({ children }: { children: React.ReactNode }) {
      useHead({
        htmlAttrs: { lang: 'en' },
        meta: [{ name: 'viewport', content: 'width=device-width' }],
      })
      return <div>{children}</div>
    }

    function Page() {
      useHead({
        title: 'Page Title',
        meta: [{ name: 'description', content: 'Page Desc' }],
      })
      return <div>Content</div>
    }

    renderToString(
      <UnheadProvider head={head}>
        <Layout>
          <Page />
        </Layout>
      </UnheadProvider>,
    )

    const { headTags, htmlAttrs } = await renderSSRHead(head)
    expect(headTags).toContain('<title>Page Title</title>')
    expect(headTags).toContain('width=device-width')
    expect(headTags).toContain('Page Desc')
    expect(htmlAttrs).toContain('lang="en"')
  })

  it('title deduplication works across components', async () => {
    const head = createHead()

    function Layout({ children }: { children: React.ReactNode }) {
      useHead({ title: 'Layout Title' })
      return <div>{children}</div>
    }

    function Page() {
      useHead({ title: 'Page Title' })
      return <div>Content</div>
    }

    renderToString(
      <UnheadProvider head={head}>
        <Layout>
          <Page />
        </Layout>
      </UnheadProvider>,
    )

    const { headTags } = await renderSSRHead(head)
    // Page title should win (last write wins)
    expect(headTags).toContain('<title>Page Title</title>')
    expect(headTags).not.toContain('Layout Title')
  })

  it('bodyAttrs and htmlAttrs render during SSR', async () => {
    const head = createHead()

    function Page() {
      useHead({
        htmlAttrs: { lang: 'fr', dir: 'ltr' },
        bodyAttrs: { class: 'dark' },
      })
      return <div>Hello</div>
    }

    renderToString(
      <UnheadProvider head={head}>
        <Page />
      </UnheadProvider>,
    )

    const { htmlAttrs, bodyAttrs } = await renderSSRHead(head)
    expect(htmlAttrs).toContain('lang="fr"')
    expect(htmlAttrs).toContain('dir="ltr"')
    expect(bodyAttrs).toContain('class="dark"')
  })
})
