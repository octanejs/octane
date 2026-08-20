// @vitest-environment jsdom
import { render } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createHead, renderDOMHead, UnheadProvider } from '../src/client'
import { Helmet } from '../src/helmet'
import { renderSSRHead } from '../src/server'

describe('helmet compat', () => {
  it('renders basic head tags from JSX children', async () => {
    const head = createHead()

    render(
      <UnheadProvider head={head}>
        <Helmet>
          <title>My Page</title>
          <meta name="description" content="A test page" />
          <link rel="canonical" href="https://example.com" />
        </Helmet>
      </UnheadProvider>,
    )

    const { headTags } = renderSSRHead(head)
    expect(headTags).toContain('<title>My Page</title>')
    expect(headTags).toContain('<meta name="description" content="A test page">')
    expect(headTags).toContain('<link rel="canonical" href="https://example.com">')
  })

  it('supports titleTemplate prop', async () => {
    const head = createHead()

    render(
      <UnheadProvider head={head}>
        <Helmet titleTemplate="%s | My Site">
          <title>Page</title>
        </Helmet>
      </UnheadProvider>,
    )

    const { headTags } = renderSSRHead(head)
    expect(headTags).toContain('<title>Page | My Site</title>')
  })

  it('applies defaultTitle when no title child is provided', async () => {
    const head = createHead()

    render(
      <UnheadProvider head={head}>
        <Helmet defaultTitle="My Site">
          <meta name="description" content="Homepage" />
        </Helmet>
      </UnheadProvider>,
    )

    const { headTags } = renderSSRHead(head)
    expect(headTags).toContain('<title>My Site</title>')
  })

  it('ignores defaultTitle when a title child is provided', async () => {
    const head = createHead()

    render(
      <UnheadProvider head={head}>
        <Helmet defaultTitle="My Site">
          <title>Custom Page</title>
          <meta name="description" content="A page" />
        </Helmet>
      </UnheadProvider>,
    )

    const { headTags } = renderSSRHead(head)
    expect(headTags).toContain('<title>Custom Page</title>')
    expect(headTags).not.toContain('My Site')
  })

  it('does not apply titleTemplate to defaultTitle', async () => {
    const head = createHead()

    render(
      <UnheadProvider head={head}>
        <Helmet defaultTitle="Home" titleTemplate="%s | My Site">
          <meta name="description" content="Homepage" />
        </Helmet>
      </UnheadProvider>,
    )

    const { headTags } = renderSSRHead(head)
    expect(headTags).toContain('<title>Home</title>')
    expect(headTags).not.toContain('Home | My Site')
  })

  it('does not let a later root fallback override a sibling page title', async () => {
    const head = createHead()

    render(
      <UnheadProvider head={head}>
        <>
          <Helmet>
            <title>Explore</title>
          </Helmet>
          <Helmet defaultTitle="Mastodon" titleTemplate="%s | Mastodon" />
        </>
      </UnheadProvider>,
    )

    const { headTags } = renderSSRHead(head)
    expect(headTags).toContain('<title>Explore | Mastodon</title>')
  })

  it('calls onChangeClientState after DOM render', async () => {
    const head = createHead()
    const onChangeClientState = vi.fn()

    render(
      <UnheadProvider head={head}>
        <Helmet onChangeClientState={onChangeClientState}>
          <title>Test Page</title>
        </Helmet>
      </UnheadProvider>,
    )

    await renderDOMHead(head, { document })

    expect(onChangeClientState).toHaveBeenCalled()
    const [state] = onChangeClientState.mock.calls[0]
    expect(state.title).toBe('Test Page')
  })

  it('renders script tags with innerHTML', async () => {
    const head = createHead()

    render(
      <UnheadProvider head={head}>
        <Helmet>
          <script type="application/ld+json">
            {JSON.stringify({ '@context': 'https://schema.org' })}
          </script>
        </Helmet>
      </UnheadProvider>,
    )

    const { headTags } = renderSSRHead(head)
    expect(headTags).toContain('application/ld+json')
    expect(headTags).toContain('https://schema.org')
  })

  it('accepts deprecated props without error', async () => {
    const head = createHead()

    // Should not throw
    render(
      <UnheadProvider head={head}>
        <Helmet encodeSpecialCharacters={false} defer={false}>
          <title>Test</title>
        </Helmet>
      </UnheadProvider>,
    )

    const { headTags } = renderSSRHead(head)
    expect(headTags).toContain('<title>Test</title>')
  })

  it('preserves falsy inner content like 0', async () => {
    const head = createHead()

    render(
      <UnheadProvider head={head}>
        <Helmet>
          <title>{0}</title>
        </Helmet>
      </UnheadProvider>,
    )

    const { headTags } = renderSSRHead(head)
    expect(headTags).toContain('<title>0</title>')
  })

  it('renders multiple meta and link tags', async () => {
    const head = createHead()

    render(
      <UnheadProvider head={head}>
        <Helmet>
          <meta name="description" content="Desc" />
          <meta property="og:title" content="OG Title" />
          <meta property="og:description" content="OG Desc" />
          <link rel="canonical" href="https://example.com" />
          <link rel="alternate" hrefLang="en" href="https://example.com/en" />
        </Helmet>
      </UnheadProvider>,
    )

    const { headTags } = renderSSRHead(head)
    expect(headTags).toContain('name="description"')
    expect(headTags).toContain('property="og:title"')
    expect(headTags).toContain('property="og:description"')
    expect(headTags).toContain('rel="canonical"')
    expect(headTags).toContain('rel="alternate"')
  })

  it('renders style tags with textContent', async () => {
    const head = createHead()

    render(
      <UnheadProvider head={head}>
        <Helmet>
          <style>{'body { color: red; }'}</style>
        </Helmet>
      </UnheadProvider>,
    )

    const { headTags } = renderSSRHead(head)
    expect(headTags).toContain('body { color: red; }')
  })

  it('renders noscript tags', async () => {
    const head = createHead()

    render(
      <UnheadProvider head={head}>
        <Helmet>
          <noscript>{'<img src="pixel.gif" />'}</noscript>
        </Helmet>
      </UnheadProvider>,
    )

    const { headTags } = renderSSRHead(head)
    expect(headTags).toContain('<noscript>')
  })

  it('renders base tag', async () => {
    const head = createHead()

    render(
      <UnheadProvider head={head}>
        <Helmet>
          <base href="https://example.com/" />
        </Helmet>
      </UnheadProvider>,
    )

    const { headTags } = renderSSRHead(head)
    expect(headTags).toContain('href="https://example.com/"')
  })

  it('normalizes html and body to htmlAttrs and bodyAttrs', async () => {
    const head = createHead()

    render(
      <UnheadProvider head={head}>
        <Helmet>
          <html lang="en" />
          {/* @ts-expect-error class is the HTML attr, not className */}
          <body class="dark" />
        </Helmet>
      </UnheadProvider>,
    )

    const { bodyAttrs, htmlAttrs } = renderSSRHead(head)
    expect(htmlAttrs).toContain('lang="en"')
    expect(bodyAttrs).toContain('class="dark"')
  })

  it('ignores invalid child elements', async () => {
    const head = createHead()

    render(
      <UnheadProvider head={head}>
        <Helmet>
          <title>Valid</title>
          <div>Invalid</div>
        </Helmet>
      </UnheadProvider>,
    )

    const { headTags } = renderSSRHead(head)
    expect(headTags).toContain('<title>Valid</title>')
    expect(headTags).not.toContain('div')
  })

  it('renders with no children', async () => {
    const head = createHead()

    render(
      <UnheadProvider head={head}>
        <Helmet defaultTitle="Fallback" />
      </UnheadProvider>,
    )

    const { headTags } = renderSSRHead(head)
    expect(headTags).toContain('<title>Fallback</title>')
  })

  it('works without UnheadProvider (self-registers)', async () => {
    render(
      <Helmet>
        <title>No Provider</title>
        <meta name="description" content="Auto-created head" />
      </Helmet>,
    )

    // The singleton head should have applied the tags to the DOM
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(document.title).toBe('No Provider')
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe('Auto-created head')
  })

  it('supports prop-based title', async () => {
    const head = createHead()

    render(
      <UnheadProvider head={head}>
        <Helmet title="Prop Title" />
      </UnheadProvider>,
    )

    const { headTags } = renderSSRHead(head)
    expect(headTags).toContain('<title>Prop Title</title>')
  })

  it('supports prop-based meta, link, and script', async () => {
    const head = createHead()

    render(
      <UnheadProvider head={head}>
        <Helmet
          meta={[{ name: 'description', content: 'Prop desc' }]}
          link={[{ rel: 'canonical', href: 'https://example.com' }]}
          script={[{ src: 'https://example.com/app.js' }]}
        />
      </UnheadProvider>,
    )

    const { headTags } = renderSSRHead(head)
    expect(headTags).toContain('name="description" content="Prop desc"')
    expect(headTags).toContain('rel="canonical" href="https://example.com"')
    expect(headTags).toContain('src="https://example.com/app.js"')
  })

  it('supports prop-based htmlAttributes and bodyAttributes', async () => {
    const head = createHead()

    render(
      <UnheadProvider head={head}>
        <Helmet
          htmlAttributes={{ lang: 'fr' }}
          bodyAttributes={{ class: 'dark' }}
        />
      </UnheadProvider>,
    )

    const { htmlAttrs, bodyAttrs } = renderSSRHead(head)
    expect(htmlAttrs).toContain('lang="fr"')
    expect(bodyAttrs).toContain('class="dark"')
  })

  it('children override prop-based title', async () => {
    const head = createHead()

    render(
      <UnheadProvider head={head}>
        <Helmet title="Prop Title">
          <title>Child Title</title>
        </Helmet>
      </UnheadProvider>,
    )

    const { headTags } = renderSSRHead(head)
    expect(headTags).toContain('<title>Child Title</title>')
    expect(headTags).not.toContain('Prop Title')
  })

  it('cleans up on unmount', async () => {
    const head = createHead()

    const { unmount } = render(
      <UnheadProvider head={head}>
        <Helmet>
          <title>Will Unmount</title>
          <meta name="description" content="Gone soon" />
        </Helmet>
      </UnheadProvider>,
    )

    unmount()

    const { headTags } = renderSSRHead(head)
    expect(headTags).toBe('')
  })
})
