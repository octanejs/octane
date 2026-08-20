// @vitest-environment jsdom
import { act, render } from '@testing-library/react'
import { useHead } from '@unhead/react'
import { createHead, UnheadProvider } from '@unhead/react/client'
import React, { StrictMode, useEffect, useRef } from 'react'
import { describe, expect, it } from 'vitest'

console.warn('React version:', React.version, '(debug tests)')

function wait(ms = 50) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

describe('debug React 18 StrictMode entry lifecycle', () => {
  it('traces entry creation in StrictMode', async () => {
    const head = createHead({
      init: [{ title: 'Init' }],
    })

    const events: string[] = []

    function PageWithHead() {
      const renderCount = useRef(0)
      renderCount.current++
      events.push(`render #${renderCount.current}`)

      useHead({ title: 'Component' })

      events.push(`after useHead, entries: ${head.entries.size}, keys: [${[...head.entries.keys()]}]`)

      useEffect(() => {
        events.push(`patch effect setup, entries: ${head.entries.size}, keys: [${[...head.entries.keys()]}]`)
        return () => {
          events.push(`patch effect cleanup`)
        }
      })

      useEffect(() => {
        events.push(`dispose effect setup, entries: ${head.entries.size}, keys: [${[...head.entries.keys()]}]`)
        return () => {
          events.push(`dispose effect cleanup, entries before: ${head.entries.size}`)
        }
      }, [])

      return <div>Has Head</div>
    }

    events.push(`before mount, entries: ${head.entries.size}`)

    render(
      <StrictMode>
        <UnheadProvider head={head}>
          <PageWithHead />
        </UnheadProvider>
      </StrictMode>,
    )

    await act(async () => {
      await wait()
    })

    events.push(`after mount settled, entries: ${head.entries.size}, keys: [${[...head.entries.keys()]}]`)

    console.warn('\n=== Event Log ===')
    events.forEach((e, i) => console.warn(`${i}: ${e}`))
    console.warn('=================\n')

    // Verify we only have init + component
    expect(head.entries.size).toBe(2)
  })

  it('traces the actual withSideEffects ref behavior', async () => {
    const head = createHead({
      init: [{ title: 'Init' }],
    })

    const events: string[] = []
    const entryIds: number[] = []

    function PageWithHead() {
      // Manually replicate withSideEffects to trace behavior
      const entryRef = useRef<any>(null)

      if (!entryRef.current) {
        events.push(`creating entry (ref was null)`)
        entryRef.current = head.push({ title: 'Component' })
        entryIds.push(entryRef.current._i)
        events.push(`entry created with _i=${entryRef.current._i}, entries: ${head.entries.size}`)
      }
      else {
        events.push(`reusing entry _i=${entryRef.current._i}`)
      }

      const entry = entryRef.current

      useEffect(() => {
        events.push(`patch effect: entry._i=${entry._i}, calling patch`)
        entry?.patch({ title: 'Component' })
        events.push(`after patch, entries: ${head.entries.size}, keys: [${[...head.entries.keys()]}]`)
      }, [entry])

      useEffect(() => {
        events.push(`dispose effect setup: entry._i=${entry._i}`)
        return () => {
          events.push(`dispose cleanup: entry._i=${entry._i}, entries before dispose: ${head.entries.size}`)
          entry?.dispose()
          events.push(`after dispose, entries: ${head.entries.size}, keys: [${[...head.entries.keys()]}]`)
          entryRef.current = null
          events.push(`ref cleared`)
        }
      }, [entry])

      return <div>Has Head</div>
    }

    events.push(`init, entries: ${head.entries.size}`)

    render(
      <StrictMode>
        <UnheadProvider head={head}>
          <PageWithHead />
        </UnheadProvider>
      </StrictMode>,
    )

    await act(async () => {
      await wait()
    })

    events.push(`settled, entries: ${head.entries.size}, keys: [${[...head.entries.keys()]}]`)

    console.warn('\n=== withSideEffects Trace ===')
    events.forEach((e, i) => console.warn(`${i}: ${e}`))
    console.warn(`entry IDs created: [${entryIds}]`)
    console.warn('=============================\n')
  })
})
