---
'octane': patch
---

fix(compiler): keep `octane/compiler` free of Node builtins

`octane/compiler` re-exported the `octane` Vite plugin, which pulls `node:fs`,
`node:path`, `node:crypto`, and `node:module` into the subpath's module graph
through `vite.js` and `bundler.js`. Bundled consumers never noticed — Vite and
Rollup tree-shake the unused re-export — but consumers that import the subpath
unbundled do: browsers and CDNs like esm.sh and jsdelivr resolve the whole
graph, so `octane/compiler` arrived with ~38KB of bundler code and Node
polyfill shims attached, and had to be worked around with a deep path into
`dist/compiler/compile.js`.

The plugin keeps its two existing homes, `@octanejs/vite-plugin` and
`octane/compiler/vite`, both of which still export it with types.

`import { octane } from 'octane/compiler'` no longer resolves. Switch to:

```js
import { octane } from '@octanejs/vite-plugin';
// or
import { octane } from 'octane/compiler/vite';
```
