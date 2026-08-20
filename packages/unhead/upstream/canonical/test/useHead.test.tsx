// @vitest-environment jsdom
import { act, fireEvent, render } from '@testing-library/react'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useHead } from '../src'
import { createHead, renderDOMHead, UnheadProvider } from '../src/client'
import { renderSSRHead } from '../src/server'

function TestComponent() {
  const [title, setTitle] = useState('Initial Title')
  const inputRef = useRef<HTMLInputElement>(null)

  useHead({
    title,
  })

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.value = title
    }
  }, [title])

  return (
    <div>
      <input ref={inputRef} onChange={e => setTitle(e.target.value)} />
    </div>
  )
}

function TestComponentWithMemo() {
  const [title, setTitle] = useState('Initial Title')
  const [content, setContent] = useState('Initial Description')
  const inputRef = useRef<HTMLInputElement>(null)

  const headConfig = useMemo(() => ({
    title,
    meta: [
      { name: 'description', content },
      { property: 'og:title', content: title },
    ],
  }), [title, content])

  useHead(headConfig)

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.value = title
    }
  }, [title])

  return (
    <div>
      <input ref={inputRef} onChange={e => setTitle(e.target.value)} />
      <input value={content} onChange={e => setContent(e.target.value)} />
    </div>
  )
}

describe('useHead hook', () => {
  // Reset document state between tests to avoid interference from debounced renders
  beforeEach(async () => {
    // Wait for any pending debounced renders from previous tests
    await new Promise(resolve => setTimeout(resolve, 10))
    document.documentElement.className = ''
    document.body.className = ''
  })

  it('updates head title based on state', async () => {
    const head = createHead()

    const { getByRole } = render(
      <UnheadProvider head={head}>
        <TestComponent />
      </UnheadProvider>,
    )

    const input = getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Updated Title' } })

    const { headTags } = renderSSRHead(head)
    expect(headTags).toContain('<title>Updated Title</title>')
  })

  it('uses the head instance supplied through the universal value prop', () => {
    const head = createHead()

    render(
      <UnheadProvider value={head}>
        <TestComponent />
      </UnheadProvider>,
    )

    const { headTags } = renderSSRHead(head)
    expect(headTags).toContain('<title>Initial Title</title>')
  })

  it('rejects conflicting value and head props', () => {
    const value = createHead()
    const head = createHead()

    expect(() => render(
      // @ts-expect-error provider instances must be supplied through one prop
      <UnheadProvider value={value} head={head}>
        <TestComponent />
      </UnheadProvider>,
    )).toThrowError('UnheadProvider received both value and head props')
  })

  it('initializes input value with state', () => {
    const head = createHead()

    const { getByRole } = render(
      <UnheadProvider head={head}>
        <TestComponent />
      </UnheadProvider>,
    )

    const input = getByRole('textbox') as HTMLInputElement
    expect(input.value).toBe('Initial Title')
  })
  it('updates head title and meta tags based on state', async () => {
    const head = createHead()

    const { getAllByRole } = render(
      <UnheadProvider head={head}>
        <TestComponentWithMemo />
      </UnheadProvider>,
    )

    const input = getAllByRole('textbox')[0] as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Updated Title' } })

    const descriptionInput = getAllByRole('textbox')[1] as HTMLInputElement
    fireEvent.change(descriptionInput, { target: { value: 'Updated Description' } })

    const { headTags } = renderSSRHead(head)
    expect(headTags).toContain('<title>Updated Title</title>')
    expect(headTags).toContain('<meta name="description" content="Updated Description">')
    expect(headTags).toContain('<meta property="og:title" content="Updated Title">')
  })

  it('initializes input values with state', () => {
    const head = createHead()

    const { getAllByRole } = render(
      <UnheadProvider head={head}>
        <TestComponentWithMemo />
      </UnheadProvider>,
    )

    const input = getAllByRole('textbox')[0] as HTMLInputElement
    expect(input.value).toBe('Initial Title')

    const descriptionInput = getAllByRole('textbox')[1] as HTMLInputElement
    expect(descriptionInput.value).toBe('Initial Description')
  })

  it('properly toggles classes on html element', async () => {
    function TestClassToggleComponent() {
      const [dark, setDark] = useState(false)

      useHead({
        htmlAttrs: {
          class: {
            dark: () => dark,
          },
        },
      })

      return (
        <div>
          <button onClick={() => setDark(!dark)}>Toggle Dark Mode</button>
          <span>{dark ? 'dark' : 'light'}</span>
        </div>
      )
    }

    const head = createHead()
    const { getByRole, getByText } = render(
      <UnheadProvider head={head}>
        <TestClassToggleComponent />
      </UnheadProvider>,
    )

    const button = getByRole('button')
    const htmlElement = document.documentElement

    // Trigger initial DOM rendering
    await act(async () => {
      await renderDOMHead(head)
    })

    // Initially should not have dark class
    expect(htmlElement.classList.contains('dark')).toBe(false)
    expect(getByText('light')).toBeTruthy()

    // Toggle to dark mode
    await act(async () => {
      fireEvent.click(button)
    })
    await act(async () => {
      await renderDOMHead(head)
    })
    expect(htmlElement.classList.contains('dark')).toBe(true)
    expect(getByText('dark')).toBeTruthy()

    // Toggle back to light mode
    await act(async () => {
      fireEvent.click(button)
    })
    await act(async () => {
      await renderDOMHead(head)
    })
    expect(htmlElement.classList.contains('dark')).toBe(false)
    expect(getByText('light')).toBeTruthy()

    // Toggle again to dark mode
    await act(async () => {
      fireEvent.click(button)
    })
    await act(async () => {
      await renderDOMHead(head)
    })
    expect(htmlElement.classList.contains('dark')).toBe(true)
    expect(getByText('dark')).toBeTruthy()
  })

  it('handles initial dark class correctly', async () => {
    function TestInitialDarkComponent() {
      const [dark, setDark] = useState(true)

      useHead({
        htmlAttrs: {
          class: {
            dark: () => dark,
          },
        },
      })

      return (
        <div>
          <button onClick={() => setDark(!dark)}>Toggle Dark Mode</button>
          <span>{dark ? 'dark' : 'light'}</span>
        </div>
      )
    }

    const head = createHead()
    const { getByRole, getByText } = render(
      <UnheadProvider head={head}>
        <TestInitialDarkComponent />
      </UnheadProvider>,
    )

    const button = getByRole('button')
    const htmlElement = document.documentElement

    // Trigger initial DOM rendering
    await act(async () => {
      await renderDOMHead(head)
    })

    // Initially should have dark class
    expect(htmlElement.classList.contains('dark')).toBe(true)
    expect(getByText('dark')).toBeTruthy()

    // Toggle to light mode
    await act(async () => {
      fireEvent.click(button)
    })
    await act(async () => {
      await renderDOMHead(head)
    })
    expect(htmlElement.classList.contains('dark')).toBe(false)
    expect(getByText('light')).toBeTruthy()

    // Toggle back to dark mode
    await act(async () => {
      fireEvent.click(button)
    })
    await act(async () => {
      await renderDOMHead(head)
    })
    expect(htmlElement.classList.contains('dark')).toBe(true)
    expect(getByText('dark')).toBeTruthy()
  })
})
