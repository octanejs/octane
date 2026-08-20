import type { UnheadFrameworkOptions } from '@unhead/bundler/framework'
import type { UnheadReactStreamingOptions } from './stream/plugin'
import { createFrameworkPlugin } from '@unhead/bundler/framework'
import { unheadReactStreamingPlugin } from './stream/plugin'

export type UnheadReactOptions = UnheadFrameworkOptions<UnheadReactStreamingOptions>

/**
 * Unified bundler plugin factory for `@unhead/react`. Returns an object with
 * per-bundler dispatch methods (`vite`, `webpack`, `rspack`, `rollup`).
 *
 * @example
 * ```ts
 * import { Unhead } from '@unhead/react/bundler'
 * export default defineConfig({ plugins: [react(), ...Unhead({ streaming: true }).vite()] })
 * ```
 */
export const Unhead = /* @__PURE__ */ createFrameworkPlugin<UnheadReactStreamingOptions>({
  framework: '@unhead/react',
  streamingPlugin: unheadReactStreamingPlugin,
})
