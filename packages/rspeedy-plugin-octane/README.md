# `@octanejs/rspeedy-plugin` (private Milestones 6–10 source/build path)

This private package turns an Octane Lynx application entry into the two
programs required by a Lynx template:

- the generated main-thread graph installs `installLynxMainThread()` and then
  evaluates the authored entry with Octane's render-only first-screen runtime;
  and
- the same authored entry runs in the background runtime with Octane's full
  Lynx renderer, which adopts or deterministically repairs the first tree.

The plugin configures the framework-neutral Lynx template, CSS extraction,
runtime-wrapper, and native encoding packages and emits one `.lynx.bundle` per
authored entry. CSS, CSS Modules, referenced assets, source maps, lazy dynamic
imports, and Rspeedy's debug metadata remain in Rspeedy's normal build graph.
Development builds wire the pinned Lynx dev transport when Rspeedy enables HMR
or live reload.

This is a **private source/build milestone**, not a published technical preview.
The repository proves graph specialization, bundle construction, decoding, and
dual-layer lazy-chunk emission; it does not yet prove first paint, adoption, or
dynamic chunk execution on Lynx Web, Android Explorer, or iOS Explorer, nor
does it prove state-preserving HMR on those targets.

## One-command repository demo

From the repository root, run:

```bash
pnpm lynx:demo
```

The command starts the pinned Rspeedy development server, builds
`main.lynx.bundle`, and prints its LAN URL and a QR code. Open that URL with the
official
[Lynx 3.9.0 Explorer](https://github.com/lynx-family/lynx/releases/tag/3.9.0)
on a device that can reach the development computer. The demo exercises native
layout and CSS, dual-thread startup, and a background-owned state update through
`bindtap`. See the
[demo README](./examples/demo/README.md) for prerequisites and non-interactive
checks.

The repository's automated gate starts the development command on an isolated
port, fetches and decodes this exact bundle, and verifies server teardown. It
does not replace the Explorer/device acceptance gate or prove native first
paint, adoption, tap delivery, or live reload.

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

Standalone `.tsrx` application components use a leading
`/** @jsxImportSource @octanejs/lynx/intrinsics */` pragma for editor and
`tsrx-tsc` typing. The Rspeedy plugin independently selects Lynx as the default
compiler renderer for the application build.

An authored `lazy(() => import('./Card.tsrx'))` remains a real Rspack dynamic
import. The pinned production fixture emits a content-hashed async `.bundle`;
its module is specialized independently in the `octane:main-thread` and
`octane:background` layers. The synchronous first-screen renderer may commit an
authored pending arm and prewarm independent imports, while the retained
background root owns later reveal or rejection. This is decoded artifact and
graph evidence, not proof that a native runtime fetches or executes the chunk.

Explicit `thread: 'background'` and `thread: 'main-thread'` are retained as
isolated compiler-graph diagnostic modes. They stamp and compile the supplied
entry for one thread, but they are not the normal application bundle path:

```js
pluginOctane({ thread: 'main-thread' });
```

## Compatibility lanes

Milestone 9 covers two exact, indivisible source/build graphs. Registry
metadata was checked on 2026-07-23:

| Component | Minimum | Current |
| --- | ---: | ---: |
| Lynx SDK / target SDK | `3.9.0` / `3.9` | `3.9.0` / `3.9` |
| `@lynx-js/rspeedy` | `0.16.0` | `0.16.0` |
| `@lynx-js/cache-events-webpack-plugin` | `0.2.0` | `0.2.0` |
| `@lynx-js/chunk-loading-webpack-plugin` | `0.4.1` | `0.4.1` |
| `@lynx-js/debug-metadata-rsbuild-plugin` | `0.2.0` | `0.2.0` |
| `@lynx-js/debug-metadata` | `0.1.0` | `0.1.0` |
| `@lynx-js/web-rsbuild-server-middleware` | `0.22.2` | `0.22.2` |
| `@lynx-js/websocket` | `0.0.4` | `0.0.4` |
| `@rsbuild/core` | `2.1.4` | `2.1.4` |
| `@rsbuild/plugin-css-minimizer` | `2.0.0` | `2.0.0` |
| `@rsdoctor/rspack-plugin` | `1.5.18` | `1.5.18` |
| `@rspack/core` | `2.1.3` | `2.1.5` |
| `@lynx-js/template-webpack-plugin` | `0.13.0` | `0.13.0` |
| `@lynx-js/css-extract-webpack-plugin` | `0.9.0` | `0.9.0` |
| `@lynx-js/runtime-wrapper-webpack-plugin` | `0.2.2` | `0.2.2` |
| `@lynx-js/webpack-dev-transport` | `0.3.0` | `0.3.0` |
| `@lynx-js/webpack-runtime-globals` | `0.0.7` | `0.0.7` |
| `@lynx-js/tasm` | `0.0.39` | `0.0.39` |
| `@lynx-js/testing-environment` | `0.3.0` | `0.3.0` |
| `@lynx-js/types` | `4.0.0` | `4.0.0` |
| `@lynx-js/web-core` | `0.22.2` | `0.22.2` |
| TypeScript | `5.9.3` | `5.9.3` |
| Webpack (tooling peer only) | `5.108.4` | `5.108.4` |

Rspeedy `0.16.0` requires Rsbuild `2.1.4` exactly. That Rsbuild release accepts
Rspack `~2.1.2`, so the current lane advances only Rspack to the newest allowed
patch. It does not mix in Rsbuild `2.1.7`. Likewise, template plugin `0.13.0`
requires tasm `0.0.39` exactly, so the standalone tasm `0.0.48` release is not
part of this graph. `@octanejs/lynx` also remains pinned to its audited
`@lynx-js/types@4.0.0` compatibility slice; newer standalone types releases are
reported by the registry check but are not accepted into either lane without a
new compatibility audit. The lane also pins every direct Rspeedy dependency
selected through a caret or tilde range, the debug-metadata payload, runtime
globals, and the required Webpack 5 tooling peer. The current registry check
recomputes the newest version inside each selected upstream range before
accepting the recorded graph.

`pnpm test:compat` packs Octane, the Lynx renderer, and both compiler plugins,
then installs each lane into an external temporary consumer without creating a
lockfile. It checks exact versions and dependency edges, one physical core
graph, strict build-tool peer satisfaction, the absence of DOM and
React/Preact/ReactLynx code in decoded programs, deterministic repeated
production builds, and a decoded engine target of `3.9`. CI also checks registry
drift for the current lane. These remain source/build checks, not Android or iOS
runtime evidence.

The exact sets are available to tooling as `LYNX_TOOLCHAIN_LANES`.
`assertLynxToolchain(root)` validates the build-relevant packages in either
set; the packed smoke additionally validates the testing, TypeScript, and
Webpack tooling packages. Pass `"minimum"` or `"current"` as the optional
second argument when a build must prove a specific lane:

```js
import {
	assertLynxToolchain,
	LYNX_TOOLCHAIN_LANES,
} from '@octanejs/rspeedy-plugin';

const expected = LYNX_TOOLCHAIN_LANES.current;
const installed = assertLynxToolchain(process.cwd(), 'current');
```

The plugin rejects incompatible, cross-lane, or duplicated Rspeedy, Rsbuild,
or Rspack cores before registering compiler hooks. Production graph tests also
reject React, Preact, and ReactLynx runtime dependencies.

Application mode owns each entry's generated filename and background layer,
and rejects authored `filename`, a conflicting `layer`, and `dependOn` (every
native bundle must contain its complete background graph). Other compatible
Rspack entry loading metadata is preserved. Explicit single-thread diagnostic
mode continues to preserve the supplied entry descriptors.

The renderer's native event spelling, lifecycle qualifications, list contract,
Native Module boundary, and remaining engine gates are documented in
[`packages/lynx/README.md`](../lynx/README.md).
