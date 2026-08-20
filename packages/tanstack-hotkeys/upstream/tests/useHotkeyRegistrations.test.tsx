// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { HotkeyManager, SequenceManager } from '@tanstack/hotkeys'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useHotkeyRegistrations } from '../src/useHotkeyRegistrations'

describe('useHotkeyRegistrations', () => {
  beforeEach(() => {
    HotkeyManager.resetInstance()
    SequenceManager.resetInstance()
  })

  afterEach(() => {
    HotkeyManager.resetInstance()
    SequenceManager.resetInstance()
  })

  it('should return empty arrays when no registrations exist', () => {
    const { result } = renderHook(() => useHotkeyRegistrations())

    expect(result.current.hotkeys).toEqual([])
    expect(result.current.sequences).toEqual([])
  })

  it('should return hotkey registrations after registering hotkeys', () => {
    const manager = HotkeyManager.getInstance()
    const callback = vi.fn()

    manager.register('Mod+S', callback, {
      platform: 'mac',
      meta: { name: 'Save', description: 'Save the document' },
    })

    const { result } = renderHook(() => useHotkeyRegistrations())

    expect(result.current.hotkeys).toHaveLength(1)
    expect(result.current.hotkeys[0]!.hotkey).toBe('Mod+S')
    expect(result.current.hotkeys[0]!.options.meta).toEqual({
      name: 'Save',
      description: 'Save the document',
    })
  })

  it('should return sequence registrations after registering sequences', () => {
    const manager = SequenceManager.getInstance()
    const callback = vi.fn()

    manager.register(['G', 'G'], callback, {
      meta: { name: 'Go to top' },
    })

    const { result } = renderHook(() => useHotkeyRegistrations())

    expect(result.current.sequences).toHaveLength(1)
    expect(result.current.sequences[0]!.sequence).toEqual(['G', 'G'])
    expect(result.current.sequences[0]!.options.meta).toEqual({
      name: 'Go to top',
    })
  })

  it('should return both hotkeys and sequences', () => {
    const hotkeyManager = HotkeyManager.getInstance()
    const sequenceManager = SequenceManager.getInstance()
    const callback = vi.fn()

    hotkeyManager.register('Mod+S', callback, { platform: 'mac' })
    hotkeyManager.register('Mod+Z', callback, { platform: 'mac' })
    sequenceManager.register(['G', 'G'], callback)

    const { result } = renderHook(() => useHotkeyRegistrations())

    expect(result.current.hotkeys).toHaveLength(2)
    expect(result.current.sequences).toHaveLength(1)
  })

  it('should not expose callback on hotkey registrations', () => {
    const manager = HotkeyManager.getInstance()
    const callback = vi.fn()

    manager.register('Mod+S', callback, { platform: 'mac' })

    const { result } = renderHook(() => useHotkeyRegistrations())

    const hotkeyView = result.current.hotkeys[0]!
    expect(hotkeyView).not.toHaveProperty('callback')
    expect(hotkeyView).toHaveProperty('id')
    expect(hotkeyView).toHaveProperty('hotkey')
    expect(hotkeyView).toHaveProperty('options')
    expect(hotkeyView).toHaveProperty('parsedHotkey')
    expect(hotkeyView).toHaveProperty('target')
    expect(hotkeyView).toHaveProperty('triggerCount')
    expect(hotkeyView).toHaveProperty('hasFired')
  })

  it('should update reactively when hotkey registrations are added', () => {
    const manager = HotkeyManager.getInstance()
    const callback = vi.fn()

    const { result } = renderHook(() => useHotkeyRegistrations())

    expect(result.current.hotkeys).toHaveLength(0)

    act(() => {
      manager.register('Mod+S', callback, { platform: 'mac' })
    })

    expect(result.current.hotkeys).toHaveLength(1)
  })

  it('should update reactively when hotkey registrations are removed', () => {
    const manager = HotkeyManager.getInstance()
    const callback = vi.fn()

    const handle = manager.register('Mod+S', callback, { platform: 'mac' })

    const { result } = renderHook(() => useHotkeyRegistrations())

    expect(result.current.hotkeys).toHaveLength(1)

    act(() => {
      handle.unregister()
    })

    expect(result.current.hotkeys).toHaveLength(0)
  })

  it('should update reactively when sequence registrations are added', () => {
    const manager = SequenceManager.getInstance()
    const callback = vi.fn()

    const { result } = renderHook(() => useHotkeyRegistrations())

    expect(result.current.sequences).toHaveLength(0)

    act(() => {
      manager.register(['G', 'G'], callback)
    })

    expect(result.current.sequences).toHaveLength(1)
  })

  it('should work without HotkeysProvider (standalone)', () => {
    const hotkeyManager = HotkeyManager.getInstance()
    const sequenceManager = SequenceManager.getInstance()
    const callback = vi.fn()

    hotkeyManager.register('Escape', callback)
    sequenceManager.register(['D', 'D'], callback)

    // No provider wrapper - should work standalone
    const { result } = renderHook(() => useHotkeyRegistrations())

    expect(result.current.hotkeys).toHaveLength(1)
    expect(result.current.sequences).toHaveLength(1)
  })

  it('should include meta accessible via options.meta', () => {
    const hotkeyManager = HotkeyManager.getInstance()
    const sequenceManager = SequenceManager.getInstance()
    const callback = vi.fn()

    hotkeyManager.register('Mod+S', callback, {
      platform: 'mac',
      meta: { name: 'Save', description: 'Save document' },
    })
    sequenceManager.register(['G', 'G'], callback, {
      meta: { name: 'Go to top', description: 'Scroll to the top' },
    })

    const { result } = renderHook(() => useHotkeyRegistrations())

    expect(result.current.hotkeys[0]!.options.meta?.name).toBe('Save')
    expect(result.current.hotkeys[0]!.options.meta?.description).toBe(
      'Save document',
    )
    expect(result.current.sequences[0]!.options.meta?.name).toBe('Go to top')
    expect(result.current.sequences[0]!.options.meta?.description).toBe(
      'Scroll to the top',
    )
  })
})
