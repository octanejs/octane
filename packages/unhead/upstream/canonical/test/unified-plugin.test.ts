import { describe, expect, it } from 'vitest'
import { Unhead } from '../src/bundler'

const STREAMING_NAME = '@unhead/react:streaming'

describe('unified Unhead({ streaming: true }) per bundler', () => {
  it('vite returns a plugin array including the streaming plugin', () => {
    const plugins = Unhead({ streaming: true }).vite() as any[]
    expect(Array.isArray(plugins)).toBe(true)
    expect(plugins.some(p => p?.name === STREAMING_NAME)).toBe(true)
  })

  it('vite omits the streaming plugin when not enabled', () => {
    const plugins = Unhead().vite() as any[]
    expect(plugins.some(p => p?.name === STREAMING_NAME)).toBe(false)
  })

  it('vite places streaming plugin last (after build transforms)', () => {
    const plugins = Unhead({ streaming: true }).vite() as any[]
    const streamIdx = plugins.findIndex(p => p?.name === STREAMING_NAME)
    expect(streamIdx).toBe(plugins.length - 1)
    expect(streamIdx).toBeGreaterThan(0)
  })

  it('webpack adds exactly one extra plugin when streaming is enabled', () => {
    // Webpack plugin wrappers from unplugin only expose `.apply`, no `name`,
    // so we verify the streaming plugin's presence indirectly via the count
    // delta against the no-streaming baseline.
    const baseline = Unhead().webpack() as any[]
    const withStreaming = Unhead({ streaming: true }).webpack() as any[]
    expect(Array.isArray(withStreaming)).toBe(true)
    expect(withStreaming.every(p => typeof p?.apply === 'function')).toBe(true)
    expect(withStreaming.length).toBe(baseline.length + 1)
  })
})
