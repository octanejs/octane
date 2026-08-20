// @vitest-environment jsdom
import { render } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { Head } from '../src'
import { createHead, renderDOMHead, UnheadProvider } from '../src/client'

describe('head raw content in the DOM', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
  })

  it('maps dangerouslySetInnerHTML to supported head tag content', async () => {
    const head = createHead()
    const script = '<span data-value="script">& raw</span>'
    const style = 'body::before { content: "<unsafe>"; }'
    const noscript = '<img src="pixel.gif" alt="pixel">'
    const title = '<b>Title</b> & value'

    render(
      <UnheadProvider head={head}>
        <Head>
          <script data-test="script" type="text/plain" dangerouslySetInnerHTML={{ __html: script }} />
          <style data-test="style" dangerouslySetInnerHTML={{ __html: style }} />
          <noscript data-test="noscript" dangerouslySetInnerHTML={{ __html: noscript }} />
          <title dangerouslySetInnerHTML={{ __html: title }} />
        </Head>
      </UnheadProvider>,
    )

    await renderDOMHead(head, { document })

    expect(document.head.querySelector('[data-test="script"]')?.textContent).toBe(script)
    expect(document.head.querySelector('[data-test="style"]')?.textContent).toBe(style)
    expect(document.head.querySelector('[data-test="noscript"]')?.textContent).toBe(noscript)
    expect(document.title).toBe(title)
    expect(document.head.querySelector('[dangerouslysetinnerhtml]')).toBeNull()
  })
})
