import type { Plugin } from 'vite'
import type { UnheadReactOptions } from './bundler'
import { Unhead as UnheadBundler } from './bundler'

export type UnheadReactViteOptions = UnheadReactOptions

/**
 * Vite plugin for `@unhead/react`. Kept for backwards compatibility; prefer
 * the unified `@unhead/react/bundler` entry which dispatches to all bundlers.
 */
export function Unhead(options: UnheadReactOptions = {}): Plugin[] {
  return UnheadBundler(options).vite()
}
