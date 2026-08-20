// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { HotkeyManager } from '@tanstack/hotkeys'
import { useHotkey } from '../src/useHotkey'
import { useState, useRef } from 'react'

describe('useHotkey', () => {
  // Reset the HotkeyManager singleton between tests
  beforeEach(() => {
    HotkeyManager.resetInstance()
  })

  afterEach(() => {
    HotkeyManager.resetInstance()
  })

  it('should register a hotkey handler', () => {
    const callback = vi.fn()
    const addEventListenerSpy = vi.spyOn(document, 'addEventListener')

    renderHook(() => useHotkey('Mod+S', callback, { platform: 'mac' }))

    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'keydown',
      expect.any(Function),
    )

    addEventListenerSpy.mockRestore()
  })

  it('should remove handler on unmount', () => {
    const callback = vi.fn()
    const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener')

    const { unmount } = renderHook(() =>
      useHotkey('Mod+S', callback, { platform: 'mac' }),
    )

    unmount()

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'keydown',
      expect.any(Function),
    )

    removeEventListenerSpy.mockRestore()
  })

  it('should call callback when hotkey matches', () => {
    const callback = vi.fn()

    renderHook(() => useHotkey('Mod+S', callback, { platform: 'mac' }))

    // Simulate keydown event
    const event = new KeyboardEvent('keydown', {
      key: 's',
      metaKey: true,
      bubbles: true,
    })
    document.dispatchEvent(event)

    expect(callback).toHaveBeenCalled()
  })

  it('should not call callback when hotkey does not match', () => {
    const callback = vi.fn()

    renderHook(() => useHotkey('Mod+S', callback, { platform: 'mac' }))

    // Simulate different keydown event
    const event = new KeyboardEvent('keydown', {
      key: 'a',
      metaKey: true,
      bubbles: true,
    })
    document.dispatchEvent(event)

    expect(callback).not.toHaveBeenCalled()
  })

  it('should use keyup event when specified', () => {
    const callback = vi.fn()
    const addEventListenerSpy = vi.spyOn(document, 'addEventListener')

    renderHook(() => useHotkey('Escape', callback, { eventType: 'keyup' }))

    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'keyup',
      expect.any(Function),
    )

    addEventListenerSpy.mockRestore()
  })

  describe('stale closure prevention', () => {
    it('should have access to latest state values in callback', () => {
      // This tests that the callback is synced on every render to avoid stale closures
      const capturedValues: Array<number> = []

      const { result, rerender } = renderHook(() => {
        const [count, setCount] = useState(0)

        useHotkey(
          'Mod+S',
          () => {
            capturedValues.push(count)
          },
          { platform: 'mac' },
        )

        return { count, setCount }
      })

      // Trigger hotkey - should capture count = 0
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 's',
          metaKey: true,
          bubbles: true,
        }),
      )
      expect(capturedValues).toEqual([0])

      // Update state
      act(() => {
        result.current.setCount(5)
      })

      // Rerender to sync the callback
      rerender()

      // Trigger hotkey again - should capture count = 5 (not stale 0)
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 's',
          metaKey: true,
          bubbles: true,
        }),
      )
      expect(capturedValues).toEqual([0, 5])

      // Update state again
      act(() => {
        result.current.setCount(10)
      })

      rerender()

      // Trigger again - should capture count = 10
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 's',
          metaKey: true,
          bubbles: true,
        }),
      )
      expect(capturedValues).toEqual([0, 5, 10])
    })

    it('should sync enabled option on every render', () => {
      const callback = vi.fn()

      const { rerender } = renderHook(
        ({ enabled }: { enabled: boolean }) =>
          useHotkey('Mod+S', callback, { platform: 'mac', enabled }),
        { initialProps: { enabled: true } },
      )

      // Should fire when enabled
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 's',
          metaKey: true,
          bubbles: true,
        }),
      )
      expect(callback).toHaveBeenCalledTimes(1)

      // Disable the hotkey
      rerender({ enabled: false })

      // Should not fire when disabled
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 's',
          metaKey: true,
          bubbles: true,
        }),
      )
      expect(callback).toHaveBeenCalledTimes(1) // unchanged

      // Re-enable
      rerender({ enabled: true })

      // Should fire again
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 's',
          metaKey: true,
          bubbles: true,
        }),
      )
      expect(callback).toHaveBeenCalledTimes(2)
    })

    it('should preserve registration id when toggling enabled', () => {
      const callback = vi.fn()
      const manager = HotkeyManager.getInstance()

      const { rerender } = renderHook(
        ({ enabled }: { enabled: boolean }) =>
          useHotkey('Mod+S', callback, { platform: 'mac', enabled }),
        { initialProps: { enabled: true } },
      )

      const idBefore = [...manager.registrations.state.keys()][0]
      expect(manager.getRegistrationCount()).toBe(1)
      expect(idBefore).toBeDefined()

      rerender({ enabled: false })
      expect(manager.getRegistrationCount()).toBe(1)
      expect([...manager.registrations.state.keys()][0]).toBe(idBefore)
      expect(manager.registrations.state.get(idBefore!)?.options.enabled).toBe(
        false,
      )

      rerender({ enabled: true })
      expect([...manager.registrations.state.keys()][0]).toBe(idBefore)
      expect(
        manager.registrations.state.get(idBefore!)?.options.enabled,
      ).not.toBe(false)
    })
  })

  describe('target handling', () => {
    it('should wait for ref to be attached', () => {
      const callback = vi.fn()

      renderHook(() => {
        const ref = useRef<HTMLDivElement | null>(null)
        useHotkey('Mod+S', callback, { target: ref, platform: 'mac' })
        return ref
      })

      // Trigger on document - should not fire (target is ref, not document)
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 's',
          metaKey: true,
          bubbles: true,
        }),
      )

      // Callback should not have been called (ref.current is null)
      expect(callback).not.toHaveBeenCalled()
    })
  })
})
