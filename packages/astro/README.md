# @octanejs/astro

Use [Octane](https://octanejs.dev) components as [Astro](https://astro.build) islands.

This integration wires Astro's renderer API to Octane's compiler and runtime:

- `octane/compiler/vite` compiles `.tsrx` (and pragma-owned `.tsx`) islands
- `octane/server` `renderToString` produces hydratable HTML (+ scoped CSS)
- `octane` `hydrateRoot` / `createRoot` hydrate on Astro `client:*` directives

It does **not** replace `@octanejs/vite-plugin`. Astro still owns routing, pages, and the HTML shell.

## Install

```bash
pnpm add octane @octanejs/astro
```

## Setup

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import octane from '@octanejs/astro';

export default defineConfig({
	integrations: [octane()],
});
```

Author islands in `.tsrx` (preferred) or in `.tsx` with a leading pragma:

```tsrx
// src/components/Counter.tsrx
import { useState } from 'octane';

export function Counter(props: { start?: number }) @{
	const [count, setCount] = useState(props.start ?? 0);
	<button type="button" onClick={() => setCount(count + 1)}>
		{'Count: ' + count}
	</button>
}
```

```astro
---
import { Counter } from '../components/Counter.tsrx';
import { ClientOnlyBadge } from '../components/ClientOnlyBadge.tsrx';
---
<Counter client:load start={0} />
<!-- Skip SSR; renderer hint must be `octane` (the AstroRenderer.name). -->
<ClientOnlyBadge client:only="octane" />
```

### `.tsx` ownership (`requireDirective`)

By default `requireDirective: true` so unmarked `.tsx` can belong to another JSX framework (or stay untouched). A project `.tsrx` is always Octane's by extension. A project `.tsx` / `.ts` / `.js` is Octane's only with:

```ts
/** @jsxImportSource octane */
```

Pass `requireDirective: false` only when every project `.tsx` should compile as Octane.

### Multiple JSX frameworks

Set `include` / `exclude` so each renderer owns distinct modules (same guidance as `@astrojs/react`):

```js
octane({
	include: ['**/components/octane/**'],
});
```

## Options

| Option | Default | Purpose |
| --- | --- | --- |
| `include` / `exclude` | — | Renderer `check()` filter; `.astro` always excluded from the compiler |
| `requireDirective` | `true` | Mixed-toolchain ownership gate |
| `profile` | `false` | Octane profiling metadata |
| `hmr` | serve on | Octane HMR codegen |
| `experimentalDisableStreaming` | `false` | Reserved; v1 always buffers with `renderToString` |

## Intentional Octane differences inside islands

- Native DOM events (`onClick`, `onInput`, …) — no synthetic `onChange` for text inputs; use `onInput` for per-keystroke updates
- Dependency arrays are compiler-inferred when omitted
- Nested [`Hydrate`](https://octanejs.dev/docs/core-apis#deferred-hydration) works inside islands once the compiler is on; Astro `client:*` still controls when the island hydrates

## Container renderer

```ts
import { getContainerRenderer } from '@octanejs/astro/container-renderer';
```
