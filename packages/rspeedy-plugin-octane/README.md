# `@octanejs/rspeedy-plugin` (private Milestone 6 source/build path)

This private package turns an Octane Lynx application entry into the two
programs required by a Lynx template:

- the generated main-thread graph installs `installLynxMainThread()` and then
  evaluates the authored entry with Octane's render-only first-screen runtime;
  and
- the same authored entry runs in the background runtime with Octane's full
  Lynx renderer, which adopts or deterministically repairs the first tree.

The plugin configures the framework-neutral Lynx template, CSS extraction,
runtime-wrapper, and native encoding packages and emits one `.lynx.bundle` per
authored entry. CSS, CSS Modules, referenced assets, source maps, and Rspeedy's
debug metadata remain in Rspeedy's normal build graph. Development builds wire
the pinned Lynx dev transport when Rspeedy enables HMR or live reload.

This is a **private source/build milestone**, not a published technical preview.
The repository proves graph specialization, bundle construction, and decoding;
it does not yet prove first paint or adoption on Lynx Web, Android Explorer, or
iOS Explorer, nor does it prove state-preserving HMR on those targets.

## Application mode

Omit `thread` for the production application path:

```js
import { defineConfig } from '@lynx-js/rspeedy';
import { pluginOctane } from '@octanejs/rspeedy-plugin';

export default defineConfig({
	source: { entry: './src/index.ts' },
	plugins: [pluginOctane()],
});
```

```ts
// src/index.ts — evaluated by both specialized thread graphs
import { root } from '@octanejs/lynx';
import { App } from './App.lynx.tsrx';

void root.render(App);
```

Each authored entry is split into an Octane background graph and an internal
main-thread graph. The main graph always installs the receiver in manual
first-screen synchronization mode, resolves the exact `@octanejs/lynx` package
root to the first-screen facade, and then evaluates the authored imports in
their original order. A generated tail module marks the first screen ready only
after synchronous authored initialization returns. Subpath imports are not
rewritten. The compiler selects the render-only main renderer and main-thread
runtime metadata by Rspack layer; unconfigured layers retain the background
configuration.

Compatible Rspack entry metadata is copied to both generated graphs so they see
the same entry initialization inputs. Development-only CSS HMR setup runs after
the receiver install and before the authored imports.

Explicit `thread: 'background'` and `thread: 'main-thread'` are retained as
isolated compiler-graph diagnostic modes. They stamp and compile the supplied
entry for one thread, but they are not the normal application bundle path:

```js
pluginOctane({ thread: 'main-thread' });
```

## Exact compatibility set

Milestone 6 supports one exact set while the packages remain private:

| Component | Version |
| --- | ---: |
| Lynx SDK / target SDK | `3.9.0` / `3.9` |
| `@lynx-js/rspeedy` | `0.16.0` |
| `@rsbuild/core` | `2.1.4` |
| `@rspack/core` | `2.1.3` |
| `@lynx-js/template-webpack-plugin` | `0.13.0` |
| `@lynx-js/css-extract-webpack-plugin` | `0.9.0` |
| `@lynx-js/runtime-wrapper-webpack-plugin` | `0.2.2` |
| `@lynx-js/webpack-dev-transport` | `0.3.0` |
| `@lynx-js/webpack-runtime-globals` | `0.0.7` |
| `@lynx-js/tasm` | `0.0.39` |
| `@lynx-js/testing-environment` | `0.3.0` |
| `@lynx-js/types` | `4.0.0` |
| `@lynx-js/web-core` | `0.22.2` (encoder dependency; Web execution blocked) |

The plugin rejects incompatible or duplicated Rspeedy, Rsbuild, or Rspack
cores before registering compiler hooks. Production graph tests also reject
React, Preact, and ReactLynx runtime dependencies.

Application mode owns each entry's generated filename and background layer,
and rejects authored `filename`, a conflicting `layer`, and `dependOn` (every
native bundle must contain its complete background graph). Other compatible
Rspack entry loading metadata is preserved. Explicit single-thread diagnostic
mode continues to preserve the supplied entry descriptors.

The renderer's native event spelling, lifecycle qualifications, list contract,
Native Module boundary, and remaining engine gates are documented in
[`packages/lynx/README.md`](../lynx/README.md).
