import { describe, expect, it } from 'vitest'
import { unheadReactStreamingPlugin } from '../src/stream/plugin'
import { unheadReactPlugin } from '../src/stream/vite'

const HEAD_STREAM_RE = /<HeadStream \/>/g

describe('unheadReactStreamingPlugin', () => {
  const plugin = unheadReactStreamingPlugin.vite() as any
  const transform = plugin.transform.handler

  describe('basic configuration', () => {
    it('has correct name', () => {
      expect(plugin.name).toBe('@unhead/react:streaming')
    })

    it('enforces pre order', () => {
      expect(plugin.enforce).toBe('pre')
    })
  })

  describe('transform', () => {
    it('skips files without Suspense', () => {
      const code = `
        export function App() {
          return <div>Hello</div>
        }
      `
      const result = transform(code, 'app.tsx')
      expect(result).toBeUndefined()
    })

    it('adds HeadStream to components with useHead', () => {
      const code = `
        import { useHead } from '@unhead/react'
        export function App() {
          useHead({ title: 'Test' })
          return (
            <div>Content</div>
          )
        }
      `
      const result = transform(code, 'app.tsx')
      expect(result).not.toBeNull()
      expect(result!.code).toContain('<HeadStream />')
    })

    it('adds HeadStream to components with useHeadSafe', () => {
      const code = `
        import { useHeadSafe } from '@unhead/react'
        export function App() {
          useHeadSafe({ title: 'Test' })
          return <div>Content</div>
        }
      `
      const result = transform(code, 'app.tsx')
      expect(result).not.toBeNull()
      expect(result!.code).toContain('<HeadStream />')
    })

    it('adds HeadStream import from client for non-SSR builds', () => {
      const code = `
        import { useHead } from '@unhead/react'
        export function App() {
          useHead({ title: 'Test' })
          return <div>Content</div>
        }
      `
      const result = transform(code, 'app.tsx', { ssr: false })
      expect(result).not.toBeNull()
      expect(result!.code).toContain('import { HeadStream } from \'@unhead/react/stream/client\'')
    })

    it('adds HeadStream import from server for SSR builds', () => {
      const code = `
        import { useHead } from '@unhead/react'
        export function App() {
          useHead({ title: 'Test' })
          return <div>Content</div>
        }
      `
      const result = transform(code, 'app.tsx', { ssr: true })
      expect(result).not.toBeNull()
      expect(result!.code).toContain('import { HeadStream } from \'@unhead/react/stream/server\'')
    })

    it('adds HeadStream to existing server import for SSR builds', () => {
      const code = `
        import { useHead } from '@unhead/react'
        import { createStreamableHead } from '@unhead/react/stream/server'
        export function App() {
          useHead({ title: 'Test' })
          return <div>Content</div>
        }
      `
      const result = transform(code, 'app.tsx', { ssr: true })
      expect(result).not.toBeNull()
      expect(result!.code).toContain('createStreamableHead, HeadStream')
    })

    it('handles multiple components with useHead', () => {
      const code = `
        import { useHead } from '@unhead/react'
        function Component1() {
          useHead({ title: 'Page 1' })
          return <div>Page 1</div>
        }
        function Component2() {
          useHead({ title: 'Page 2' })
          return <div>Page 2</div>
        }
      `
      const result = transform(code, 'app.tsx')
      expect(result).not.toBeNull()
      expect(result!.code.match(HEAD_STREAM_RE)?.length).toBe(2)
    })

    it('handles arrow function components with useHead', () => {
      const code = `
        import { useHead } from '@unhead/react'
        const App = () => {
          useHead({ title: 'Arrow Component' })
          return <div>Content</div>
        }
      `
      const result = transform(code, 'app.tsx')
      expect(result).not.toBeNull()
      expect(result!.code).toContain('<HeadStream />')
    })

    it('skips non-Suspense JSX elements', () => {
      const code = `
        export function App() {
          return (
            <div>
              <span>Hello</span>
            </div>
          )
        }
      `
      const result = transform(code, 'app.tsx')
      expect(result).toBeUndefined()
    })

    it('generates source map', () => {
      const code = `
        import { useHead } from '@unhead/react'
        export function App() {
          useHead({ title: 'Test' })
          return <div>Content</div>
        }
      `
      const result = transform(code, 'app.tsx')
      expect(result).not.toBeNull()
      expect(result!.map).toBeDefined()
    })
  })

  describe('webpack adapter', () => {
    const wp = unheadReactStreamingPlugin.webpack() as any

    it('exposes a webpack plugin instance with apply()', () => {
      expect(typeof wp.apply).toBe('function')
    })
  })

  describe('rspack adapter', () => {
    const rs = unheadReactStreamingPlugin.rspack() as any

    it('exposes an rspack plugin instance with apply()', () => {
      expect(typeof rs.apply).toBe('function')
    })
  })

  describe('rollup adapter', () => {
    const rl = unheadReactStreamingPlugin.rollup() as any

    it('has correct name', () => {
      expect(rl.name).toBe('@unhead/react:streaming')
    })

    it('registers a jsx/tsx-filtered transform', () => {
      // rollup adapter exposes transform as a function directly
      expect(typeof rl.transform === 'function' || typeof rl.transform?.handler === 'function').toBe(true)
    })
  })
})

describe('deprecated unheadReactPlugin', () => {
  it('returns a vite plugin (back-compat alias for unheadReactStreamingPlugin.vite)', () => {
    const plugin = unheadReactPlugin() as any
    expect(plugin.name).toBe('@unhead/react:streaming')
    expect(plugin.enforce).toBe('pre')
  })
})
