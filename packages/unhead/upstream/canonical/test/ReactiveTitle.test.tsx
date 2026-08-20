import { act, render } from '@testing-library/react'
import { renderSSRHead } from '@unhead/react/server'
// @vitest-environment jsdom
import React from 'react'
import { describe, expect, it } from 'vitest'
import { createHead, UnheadProvider } from '../src/client'
import { ReactiveTitle } from './fixtures/ReactiveTitle'

describe('unheadProvider', () => {
  it('updates head when title changes', async () => {
    const head = createHead()
    const { getByText } = render(
      <UnheadProvider head={head}>
        <ReactiveTitle />
      </UnheadProvider>,
    )

    expect(getByText('Test')).toBeDefined()

    await act(async () => {
      getByText('Update').click()
    })

    expect(getByText('Updated')).toBeDefined()
    const res = renderSSRHead(head)
    expect(res.headTags).toEqual(`<title>Updated</title>`)
  })
})
