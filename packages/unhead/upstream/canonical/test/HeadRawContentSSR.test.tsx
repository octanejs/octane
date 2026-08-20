// @vitest-environment node
import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Head } from '../src'
import { createHead, renderSSRHead, UnheadProvider } from '../src/server'

describe('head raw content in SSR', () => {
  it('renders raw content without serializing the React control prop', () => {
    const head = createHead({ disableDefaults: true })

    renderToString(
      <UnheadProvider value={head}>
        <Head>
          <script
            type="application/javascript"
            dangerouslySetInnerHTML={{ __html: 'window.payload = "</script><script>evil()</script>"' }}
          />
          <style dangerouslySetInnerHTML={{ __html: 'body::before { content: "</style><script>evil()</script>"; }' }} />
          <noscript dangerouslySetInnerHTML={{ __html: '<img src="pixel.gif" alt="pixel">' }} />
          <title dangerouslySetInnerHTML={{ __html: '<b>Title</b> & value' }} />
        </Head>
      </UnheadProvider>,
    )

    const { headTags } = renderSSRHead(head)
    expect(headTags).toContain('<script type="application/javascript">window.payload = "<\\/script><script>evil()<\\/script>"</script>')
    expect(headTags).toContain('<style>body::before { content: "<\\/style><script>evil()</script>"; }</style>')
    expect(headTags).toContain('<noscript><img src="pixel.gif" alt="pixel"></noscript>')
    expect(headTags).toContain('<title>&lt;b&gt;Title&lt;&#x2F;b&gt; &amp; value</title>')
    expect(headTags.toLowerCase()).not.toContain('dangerouslysetinnerhtml')
  })

  it.each(['title', 'script', 'style', 'noscript'])(
    'rejects children combined with dangerouslySetInnerHTML on <%s>',
    (tagName) => {
      const head = createHead({ disableDefaults: true })
      const rawElement = React.createElement(tagName, {
        dangerouslySetInnerHTML: { __html: 'raw' },
      }, 'child')

      expect(() => renderToString(
        <UnheadProvider value={head}>
          <Head>{rawElement}</Head>
        </UnheadProvider>,
      )).toThrow('Can only set one of `children` or `props.dangerouslySetInnerHTML`.')
    },
  )

  it('rejects malformed dangerouslySetInnerHTML values', () => {
    const head = createHead({ disableDefaults: true })
    const rawElement = React.createElement('script', {
      dangerouslySetInnerHTML: {} as { __html: string },
    })

    expect(() => renderToString(
      <UnheadProvider value={head}>
        <Head>{rawElement}</Head>
      </UnheadProvider>,
    )).toThrow('`props.dangerouslySetInnerHTML` must be in the form `{__html: ...}`.')
  })

  it.each(['base', 'link', 'meta'])(
    'rejects dangerouslySetInnerHTML on self-closing <%s>',
    (tagName) => {
      const head = createHead({ disableDefaults: true })
      const rawElement = React.createElement(tagName, {
        dangerouslySetInnerHTML: { __html: 'raw' },
      })

      expect(() => renderToString(
        <UnheadProvider value={head}>
          <Head>{rawElement}</Head>
        </UnheadProvider>,
      )).toThrow(`${tagName} is a self-closing tag and must neither have \`children\` nor use \`dangerouslySetInnerHTML\`.`)
    },
  )
})
