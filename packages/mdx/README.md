# @octanejs/mdx

[MDX](https://mdxjs.com) for the [octane](https://github.com/octanejs/octane)
renderer — documentation stays in `.mdx`/`.md` and renders as **compiled octane
components**.

The split mirrors `docs/react-library-compat-plan.md` §2: **@mdx-js/mdx's
compiler is framework-agnostic and reused verbatim** — with `jsx: true` it
emits the compiled document as classic JSX *source*, which is exactly the
React-style `.tsx` dialect octane's own compiler handles. The pipeline is

```
.mdx / .md  →  @mdx-js/mdx (JSX/ESM source)  →  octane/compiler  →  compiled octane module
```

— compile, don't interpret: no MDX runtime, no `_jsx` shims, the document
becomes an ordinary octane component module (client codegen or SSR HTML-string
codegen). Only @mdx-js/react's ~50-line provider layer is ported here.

## Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { octane } from 'octane/compiler/vite'; // or @octanejs/vite-plugin
import { octaneMdx } from '@octanejs/mdx/vite';

export default defineConfig({
	plugins: [octaneMdx(), octane()],
});
```

`octaneMdx()` claims `.mdx`/`.md` and produces final JS, so it composes with the
octane plugin (which claims `.tsrx`/`.tsx`/`.ts`/`.js`) without ordering
hazards. SSR target selection matches the octane plugin: per-module
auto-detection, `ssr: true|false` to force.

Options: `md: false` (leave `.md` alone), `providerImportSource: null` (disable
the provider wiring), `remarkPlugins` / `rehypePlugins` / `recmaPlugins`,
`format`, `mdxOptions` (escape hatch). The default remark set is
`defaultRemarkPlugins` = GFM + frontmatter + `export const frontmatter`.

## Usage

```mdx
---
title: Getting started
---

import Counter from './Counter.tsrx';

# {frontmatter.title}

Octane components just work: <Counter start={2} />
```

```tsrx
import Doc, { frontmatter } from './getting-started.mdx';
import { MDXProvider } from '@octanejs/mdx';

export function Page() @{
	<MDXProvider components={{ h1: FancyHeading, code: Snippet }}>
		<Doc />
	</MDXProvider>
}
```

A mapping can also be passed per-document: `<Doc components={{ h1: FancyHeading }} />`.
Mapping values are octane components or replacement host tag names (`{ em: 'i' }`);
the special `wrapper` key is the document layout.

## API (vs @mdx-js/react)

- `MDXProvider({ components, disableParentContext, children })` — ported;
  nested providers merge, function-form `components` receives the inherited
  mapping.
- `useMDXComponents(components?)` — ported, with one deliberate divergence:
  the `useMemo` referential-stability wrapper is dropped so the call is valid
  in BOTH runtimes (octane's client `useMemo` needs a live client render scope;
  SSR passes call this during `renderToString`). Same observable mapping.
- `@octanejs/mdx/compile` — `compileMdx` / `compileMdxSync` /
  `defaultRemarkPlugins`, the plugin's pipeline as a library (used by the SSR
  tests, usable for static-site tooling).

## SSR

A document compiled with `mode: 'server'` renders through
`octane/server`'s `renderToString`, and the `components` **prop** applies
server-side. The context-based `MDXProvider` route is client-only for now —
octane bindings have no cross-runtime context threading yet (the `octane`
entry is the client runtime; on the server the context read yields its default
`{}`).

## Notes

- Markdown-generated elements ride octane's value-position (`createElement`
  descriptor) path — documents are static content, and embedded `.tsrx`
  components keep their full compiled fast path.
- `.mdx` edits currently propagate as a full module invalidation (no
  HMR-accept boundary yet).
