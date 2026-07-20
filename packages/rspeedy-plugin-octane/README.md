# `@octanejs/rspeedy-plugin` (private Milestone 5 source/build path)

This private package turns an Octane Lynx application entry into the two
programs required by a Lynx template:

- the authored application runs in the background runtime with Octane's Lynx
  universal renderer; and
- a generated main-thread receiver installs `installLynxMainThread()` before
  the first transported background commit arrives.

The plugin configures the framework-neutral Lynx template, CSS extraction,
runtime-wrapper, and native encoding packages and emits one `.lynx.bundle` per
authored entry. CSS, CSS Modules, referenced assets, source maps, and Rspeedy's
debug metadata remain in Rspeedy's normal build graph. Development builds wire
the pinned Lynx dev transport when Rspeedy enables HMR or live reload.

This is a **private source/build milestone**, not a published technical preview.
The repository proves bundle construction and decoding; it does not yet prove
the bundle in Lynx Web, Android Explorer, or iOS Explorer, nor does it prove
state-preserving HMR or native reload/teardown behavior.

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
// src/index.ts — background runtime
import { root } from '@octanejs/lynx';
import { App } from './App.lynx.tsrx';

void root.render(App);
```

Each authored entry is split into an Octane background graph and an internal,
generated main-thread receiver graph. The main graph does not render `App` and
does not implement main-thread first paint or background adoption; those remain
Milestone 6 work.

Explicit `thread: 'background'` and `thread: 'main-thread'` are retained as
isolated compiler-graph diagnostic modes. They stamp and compile the supplied
entry for one thread, but they are not the normal application bundle path:

```js
pluginOctane({ thread: 'main-thread' });
```

## Exact compatibility set

Milestone 5 supports one exact set while the packages remain private:

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
