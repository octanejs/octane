// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { SequenceManager } from '@tanstack/hotkeys'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useHotkeySequences } from '../src/useHotkeySequences'
import type { UseHotkeySequenceDefinition } from '../src/useHotkeySequences'

function dispatchKey(key: string) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
}

describe('useHotkeySequences', () => {
  beforeEach(() => {
    SequenceManager.resetInstance()
  })

  afterEach(() => {
    SequenceManager.resetInstance()
  })

  it('should register multiple sequence handlers', () => {
    const a = vi.fn()
    const b = vi.fn()

    renderHook(() =>
      useHotkeySequences([
        { sequence: ['G', 'G'], callback: a },
        { sequence: ['D', 'D'], callback: b },
      ]),
    )

    expect(SequenceManager.getInstance().getRegistrationCount()).toBe(2)
  })

  it('should call the correct callback for each sequence', () => {
    const gg = vi.fn()
    const dd = vi.fn()

    renderHook(() =>
      useHotkeySequences([
        { sequence: ['G', 'G'], callback: gg },
        { sequence: ['D', 'D'], callback: dd },
      ]),
    )

    dispatchKey('g')
    dispatchKey('g')
    expect(gg).toHaveBeenCalledTimes(1)
    expect(dd).not.toHaveBeenCalled()

    dispatchKey('d')
    dispatchKey('d')
    expect(gg).toHaveBeenCalledTimes(1)
    expect(dd).toHaveBeenCalledTimes(1)
  })

  it('should unregister all sequences on unmount', () => {
    const { unmount } = renderHook(() =>
      useHotkeySequences([
        { sequence: ['G', 'G'], callback: vi.fn() },
        { sequence: ['D', 'D'], callback: vi.fn() },
      ]),
    )

    expect(SequenceManager.getInstance().getRegistrationCount()).toBe(2)
    unmount()
    expect(SequenceManager.getInstance().getRegistrationCount()).toBe(0)
  })

  it('should handle an empty array as a no-op', () => {
    renderHook(() => useHotkeySequences([]))
    expect(SequenceManager.getInstance().getRegistrationCount()).toBe(0)
  })

  it('should skip definitions with an empty sequence', () => {
    renderHook(() =>
      useHotkeySequences([
        { sequence: [], callback: vi.fn() },
        { sequence: ['G', 'G'], callback: vi.fn() },
      ]),
    )
    expect(SequenceManager.getInstance().getRegistrationCount()).toBe(1)
  })

  it('should register disabled sequences and keep them in the manager', () => {
    const enabledCb = vi.fn()
    const disabledCb = vi.fn()

    renderHook(() =>
      useHotkeySequences([
        { sequence: ['G', 'G'], callback: enabledCb },
        {
          sequence: ['D', 'D'],
          callback: disabledCb,
          options: { enabled: false },
        },
      ]),
    )

    dispatchKey('g')
    dispatchKey('g')
    dispatchKey('d')
    dispatchKey('d')
    expect(enabledCb).toHaveBeenCalledTimes(1)
    expect(disabledCb).not.toHaveBeenCalled()

    const manager = SequenceManager.getInstance()
    expect(manager.getRegistrationCount()).toBe(2)
    const disabledView = [...manager.registrations.state.values()].find(
      (r) => r.sequence[0] === 'D' && r.sequence[1] === 'D',
    )
    expect(disabledView?.options.enabled).toBe(false)
  })

  it('should handle dynamic array changes (add sequence)', () => {
    const gg = vi.fn()
    const dd = vi.fn()
    const yy = vi.fn()

    const { rerender } = renderHook(
      ({ defs }: { defs: Array<UseHotkeySequenceDefinition> }) =>
        useHotkeySequences(defs),
      {
        initialProps: {
          defs: [
            { sequence: ['G', 'G'], callback: gg },
            { sequence: ['D', 'D'], callback: dd },
          ],
        },
      },
    )

    dispatchKey('y')
    dispatchKey('y')
    expect(yy).not.toHaveBeenCalled()

    rerender({
      defs: [
        { sequence: ['G', 'G'], callback: gg },
        { sequence: ['D', 'D'], callback: dd },
        { sequence: ['Y', 'Y'], callback: yy },
      ],
    })

    dispatchKey('y')
    dispatchKey('y')
    expect(yy).toHaveBeenCalledTimes(1)
  })

  it('should move a sequence registration when only the target changes', () => {
    const callback = vi.fn()
    const targetA = document.createElement('div')
    const targetB = document.createElement('div')

    const { rerender } = renderHook(
      ({ target }: { target: HTMLElement }) =>
        useHotkeySequences([
          { sequence: ['G', 'G'], callback, options: { target } },
        ]),
      { initialProps: { target: targetA } },
    )

    targetA.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'g', bubbles: true }),
    )
    targetA.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'g', bubbles: true }),
    )
    expect(callback).toHaveBeenCalledTimes(1)

    rerender({ target: targetB })
    expect(SequenceManager.getInstance().getRegistrationCount()).toBe(1)

    targetA.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'g', bubbles: true }),
    )
    targetA.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'g', bubbles: true }),
    )
    expect(callback).toHaveBeenCalledTimes(1)

    targetB.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'g', bubbles: true }),
    )
    targetB.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'g', bubbles: true }),
    )
    expect(callback).toHaveBeenCalledTimes(2)
  })

  describe('stale closure prevention', () => {
    it('should have access to latest state values in callbacks', () => {
      const capturedValues: Array<number> = []

      const { result, rerender } = renderHook(() => {
        const [count, setCount] = useState(0)
        useHotkeySequences([
          {
            sequence: ['G', 'G'],
            callback: () => {
              capturedValues.push(count)
            },
          },
        ])
        return { setCount }
      })

      dispatchKey('g')
      dispatchKey('g')
      expect(capturedValues).toEqual([0])

      act(() => {
        result.current.setCount(5)
      })
      rerender()

      dispatchKey('g')
      dispatchKey('g')
      expect(capturedValues).toEqual([0, 5])

      act(() => {
        result.current.setCount(10)
      })
      rerender()

      dispatchKey('g')
      dispatchKey('g')
      expect(capturedValues).toEqual([0, 5, 10])
    })

    it('should sync enabled option on every render', () => {
      const callback = vi.fn()

      const { rerender } = renderHook(
        ({ enabled }: { enabled: boolean }) =>
          useHotkeySequences([
            { sequence: ['G', 'G'], callback, options: { enabled } },
          ]),
        { initialProps: { enabled: true } },
      )

      dispatchKey('g')
      dispatchKey('g')
      expect(callback).toHaveBeenCalledTimes(1)

      rerender({ enabled: false })

      dispatchKey('g')
      dispatchKey('g')
      expect(callback).toHaveBeenCalledTimes(1)

      rerender({ enabled: true })

      dispatchKey('g')
      dispatchKey('g')
      expect(callback).toHaveBeenCalledTimes(2)
    })

    it('should preserve registration id when toggling enabled', () => {
      const callback = vi.fn()
      const manager = SequenceManager.getInstance()

      const { rerender } = renderHook(
        ({ enabled }: { enabled: boolean }) =>
          useHotkeySequences([
            { sequence: ['G', 'G'], callback, options: { enabled } },
          ]),
        { initialProps: { enabled: true } },
      )

      const idBefore = [...manager.registrations.state.keys()][0]
      expect(manager.getRegistrationCount()).toBe(1)

      rerender({ enabled: false })
      expect(manager.getRegistrationCount()).toBe(1)
      expect([...manager.registrations.state.keys()][0]).toBe(idBefore)

      rerender({ enabled: true })
      expect([...manager.registrations.state.keys()][0]).toBe(idBefore)
    })
  })
})
