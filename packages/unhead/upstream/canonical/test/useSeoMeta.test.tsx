// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react'
import React, { useEffect, useRef, useState } from 'react'
import { describe, expect, it } from 'vitest'
import { useSeoMeta } from '../src'
import { createHead, UnheadProvider } from '../src/client'
import { renderSSRHead } from '../src/server'

function TestComponentWithRef() {
  const [titleRef, updateTitle] = useState('Initial Title')

  useSeoMeta({
    title: titleRef,
    description: 'Initial Description',
  })

  useEffect(() => {
    updateTitle('Updated Title')
  }, [])

  return (
    <div>
      <p>{titleRef}</p>
    </div>
  )
}

function TestComponent() {
  const [title, setTitle] = useState('Initial Title')
  const inputRef = useRef<HTMLInputElement>(null)

  useSeoMeta({
    title,
    description: 'Initial Description',
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

describe('useSeoMeta hook', () => {
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

  it('updates head title based on ref value after effect', async () => {
    const head = createHead()

    render(
      <UnheadProvider head={head}>
        <TestComponentWithRef />
      </UnheadProvider>,
    )

    const { headTags } = renderSSRHead(head)
    expect(headTags).toContain('<title>Updated Title</title>')
  })
})
