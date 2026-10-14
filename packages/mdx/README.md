# @octanejs/mdx

[MDX](https://mdxjs.com) for the [octane](https://github.com/octanejs/octane)
UI framework — documentation stays in `.mdx`/`.md` and renders as **compiled octane
components**.

## Installation

```sh
npm install @octanejs/mdx
pnpm add @octanejs/mdx
```

The split mirrors `docs/react-library-compat-plan.md` §2: **@mdx-js/mdx's
compiler is framework-agnostic and reused verbatim** — with `jsx: true` it
emits JSX *source*. A small printer adapter turns the two generated document
functions into Octane templates before the Octane compiler runs. The pipeline is

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
import { octane } from '@octanejs/vite-plugin';
import { octaneMdx } from '@octanejs/mdx/vite';

export default defineConfig({
	plugins: [octaneMdx(), octane()],
});
```

Pass `profile: true` to both plugins for a browser profiling build:

```ts
plugins: [octaneMdx({ profile: true }), octane({ profile: true })];
```

Profiling metadata is never emitted by the MDX server transform.

`octaneMdx()` claims `.mdx`/`.md` and produces final JS, so it composes with the
octane plugin (which claims `.tsrx`/`.tsx`/`.ts`/`.js`) without ordering
hazards. SSR target selection matches the octane plugin: per-module
auto-detection, `ssr: true|false` to force.

Options: `md: false` (leave `.md` alone), `providerImportSource: null` (disable
the provider wiring), `strong` (apply Octane Strong checks to the document),
`overridableTags`, `remarkPlugins` / `rehypePlugins` / `recmaPlugins`,
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

The client and server providers are authored as Strong `.tsrx` templates. Both
generated document functions also compile as templates. Authored JavaScript
expressions and exported components retain their normal Octane semantics.

### Static hosts and Strong mode

By default, every markdown-generated tag can be overridden through a provider
or the document's `components` prop. For a site with a fixed set of overrides,
list those tags at build time:

```ts
octaneMdx({
	strong: true,
	overridableTags: ['table', 'pre'],
});
```

All other generated tags become static host templates, including Shiki's many
highlighting spans. Overrides for omitted tags are ignored in both provider
and document mappings. An empty list makes every generated host static;
omitting the option retains full MDX override support. This does not restrict
named components, authored JSX, or the special `wrapper` layout mapping.
Provider mappings still merge before document props, and an explicit exported
layout still takes precedence over `wrapper`.

Keeping every tag overridable requires a component slot for each generated
host. For heavily highlighted documents this can increase generated code size;
use a fixed override list when the application only replaces a few tags.

Pass the application's shared Strong setting to `octaneMdx` as well as its
Octane plugin. Strong checks apply to the whole MDX module, including authored
expressions; enabling them can reject code accepted in compatibility mode.
The default remains compatibility mode. Use the same options for client and
server compilation so their hydration structure agrees.

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
  tests, usable for static-site tooling). Results include nonfatal compiler
  `diagnostics`; JSX warning ranges are mapped back to the authored `.mdx`
  document. The Vite plugin publishes the same warnings during transforms.

## SSR + hydration

A document compiled with `mode: 'server'` renders through `octane/server`'s
`renderToString`, and `hydrateRoot` adopts the resulting elements and text
into the client-compiled module. Embedded `.tsrx` components retain their
server DOM and stay interactive; internal comment anchors may change.

Both mapping routes work on the server:

- the `components` **prop** — `renderToString(Doc, { components })`;
- **`MDXProvider` from `@octanejs/mdx/server`** — the same provider layer
  mirrored onto `octane/server` context (the client and server runtimes have
  disjoint context stores, so each side ships its own provider; server-mode
  documents read `useMDXComponents` from `@octanejs/mdx/server`
  automatically). A document rendered under the server provider hydrates
  by adopting its DOM into the client `MDXProvider` with the same mapping.

## Syntax highlighting (Shiki)

Highlighting is a rehype concern, so it hooks in through `rehypePlugins` — no
integration code and nothing bundled (add `@shikijs/rehype` yourself):

```ts
import { octaneMdx } from '@octanejs/mdx/vite';
import rehypeShiki from '@shikijs/rehype';

octaneMdx({
	rehypePlugins: [[rehypeShiki, { theme: 'github-light' }]],
});
```

Shiki's hast output serializes through the same pipeline as any other content:
highlighted tokens render on the client, serialize identically on the server,
and hydrate cleanly (see `tests/shiki.test.ts`). Note `@shikijs/rehype` is
async — it works in the vite plugin and `compileMdx`, not `compileMdxSync`.

## Notes

- Markdown-generated document functions use templates. Dynamic host overrides
  still need runtime component slots; `overridableTags` lets fixed sites avoid
  those slots for hosts they never override. This does not promise that arbitrary
  authored expressions or imported components are descriptor-free.
- Mapped components receive ordinary Octane template children: render them
  with `{children}` rather than inspecting or cloning nested element
  descriptors. A single literal text child remains a string.
- `.mdx` edits fast-refresh in dev through Octane's template HMR support,
  so live mounts re-render
  the new body in place (no page reload; the vite plugin enables this in serve
  mode automatically). Importers keep the named exports they read, such as
  `frontmatter`, so the update also reaches them when one is no longer
  identical. An object export, `frontmatter` included, is a new object after
  every edit.

## Status

Current scope, known divergences, and verification status are tracked in the
generated [bindings status table](../../docs/bindings-status.md), sourced from
this package's [`status.json`](./status.json).
