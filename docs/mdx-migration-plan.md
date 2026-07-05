# MDX → octane migration plan (`@octanejs/mdx`)

MDX for the octane renderer, so documentation stays in `.mdx`/`.md` and renders
as **compiled octane components**. Built on **@mdx-js/mdx v3.1** following
`docs/react-library-compat-plan.md` §2: the framework-agnostic core
(@mdx-js/mdx, remark-gfm, remark-frontmatter, remark-mdx-frontmatter) is reused
verbatim; only @mdx-js/react's thin provider layer (~50 lines) is ported onto
octane context. Standing discipline: when a faithful port can't reproduce the
behavior, report the octane gap (workarounds below are documented + revertible),
never silently paper over it.

## Progress (reverse-chronological)

> **Phase 0 — the full pipeline + provider layer landed (2026-07). Green: 25
> tests (compile shape, markdown/GFM/`.md` rendering, embedded `.tsrx`
> components, provider semantics, frontmatter, SSR renderToString), full
> monorepo suite 2200 green, typecheck + format clean.**

## Architecture — compile, don't interpret

@mdx-js/mdx with **`jsx: true`** emits the compiled document as classic JSX
*source* (no `_jsx` runtime calls), and with **`providerImportSource`** it
imports `useMDXComponents` from a configurable module. That emitted program is
exactly the React-style `.tsx` dialect octane's compiler already handles, so:

```
.mdx / .md
  → @mdx-js/mdx compile({ jsx: true, providerImportSource: '@octanejs/mdx', … })   (JSX/ESM source)
  → recmaOctaneAdapter                                                             (3 small ESTree fixups, below)
  → octane/compiler compile(source, id, { mode: 'client' | 'server' })             (real octane codegen)
```

What each MDX construct becomes under octane's `.tsx` handling:

- `_createMdxContent(props)` (the document body, `return <>…</>`) — a
  return-JSX function: octane compiles it to the `(props, __s, __extra)` ABI;
  the fragment return value-lowers to an array of `createElement` descriptors
  (client) / `ssrComponent`+`ssrChild` string building (server). A single-root
  document lowers to one descriptor.
- `<_components.h1>` member tags (markdown elements via the mapping, value
  `"h1"` unless overridden) — component-tagged elements whose runtime value may
  be a host tag STRING; handled by the client de-opt renderer (and see gap 2
  for the server).
- `MDXContent` (the default export, `return MDXLayout ? <MDXLayout…> : …`) — a
  passthrough function; its value-position JSX lowers to descriptors, and
  `renderBlock`/`renderComponentFramed` mount/normalize the returned
  descriptor on client/server.
- Embedded octane components (`import Counter from './counter.tsrx'` +
  `<Counter/>`) — ordinary imports; the octane vite plugin compiles them with
  their full template fast path.

### Packages

- `packages/mdx/src/compile.ts` — the pipeline (`compileMdx`/`compileMdxSync`/
  `defaultRemarkPlugins`) + `recmaOctaneAdapter`.
- `packages/mdx/src/vite.ts` — `octaneMdx()`: claims `.mdx`/`.md`
  (`enforce: 'pre'`), produces FINAL JS, per-module SSR auto-detection copied
  from `octane/compiler/vite` — composes with the octane plugin with no
  ordering hazard (disjoint extensions).
- `packages/mdx/src/index.ts` — the @mdx-js/react port: `MDXProvider`,
  `useMDXComponents`, `MDXComponents` types.

## recmaOctaneAdapter — the two-compiler adaptations

All three are small ESTree fixups over MDX's emitted program, each tied to an
octane gap or ABI difference and revertible:

1. **Rename `_createMdxContent` → `MDX$CreateMdxContent`.** octane's JSX
   lowering treats identifier tags as components only when `/^[A-Z]/` —
   `<_createMdxContent/>` lowers to a host STRING tag (gap 1 below).
2. **Rewrite the bare `_createMdxContent(props)` call to
   `<MDX$CreateMdxContent {...props}/>`.** The direct call bypasses the
   `(props, __s, __extra)` ABI (the server body would run on `__s === undefined`
   scope recovery); as JSX both layout branches mount through the component
   machinery on client and server.
3. **Server mode only: wrap `_components.*` elements in JSX-child position in
   expression containers** (`{<_components.h1>…</_components.h1>}`), routing
   them through the server's VALUE hole (`ssrChild(createElement(…))`), which
   accepts string tags — `ssrComponent` does not (gap 2 below).

## octane gaps hit (fix in octane, then simplify here)

1. **`<_foo/>` / `<$foo/>` identifier tags compile as host string tags.** JSX
   semantics (Babel, TypeScript): only `/^[a-z]/`-starting identifiers are
   intrinsics; `_`/`$`-starting identifiers are component references.
   `isComponentTag` (packages/octane/src/compiler/compile.js) checks
   `/^[A-Z]/`. Repro: compile `function App() { return <_Inner/>; }` — emits
   `createElement('_Inner', {})`, renders `<_inner>` (client) / throws
   `Invalid tag` (server). Fix → drop adaptation 1 (and 2's rename half).
2. **A member-expression / dynamic component tag resolving to a host tag
   STRING renders on the client but crashes SSR.** The client lowers
   `<obj.tag/>` to a `createElement` descriptor and the de-opt renderer
   accepts `typeof type === 'string'`; the server's template lowering emits
   `ssrComponent(__s, obj.tag, …)`, which CALLS the tag —
   `TypeError: comp is not a function`. Repro: server-compile
   `function App(props) { return <><props.parts.title>hi</props.parts.title></>; }`
   and `renderToString(App, { parts: { title: 'h1' } })`. Fix (accept strings
   in `ssrComponent`, or value-lower stringable tags server-side like the
   client) → drop adaptation 3.

## API coverage vs @mdx-js/react

| @mdx-js/react                      | @octanejs/mdx                                       |
| ---------------------------------- | --------------------------------------------------- |
| `MDXProvider`                      | ported (merge, function-form, `disableParentContext`) |
| `useMDXComponents`                 | ported, minus the `useMemo` (deliberate, below)     |
| `MDXComponents` type (@types/mdx)  | octane-flavored local type                          |
| `withMDXComponents` (legacy, gone) | not ported (removed upstream in v2)                 |

**Deliberate divergence:** @mdx-js/react memoizes the merged mapping
(`useMemo([contextComponents, components])`) — referential stability only.
octane's `useMemo` is the client runtime's (the `octane` entry has no server
condition) and requires a live render scope, so a server-compiled document
calling `useMDXComponents()` during `renderToString` would crash. `useContext`
is null-scope safe, so the unmemoized merge is valid in both runtimes with the
same observable mapping.

## Tests (`packages/mdx/tests`, vitest project `mdx`)

Mounted with `@octanejs/testing-library` (dogfooded, workspace dep):

- `compile.test.ts` — pipeline shape: no JSX/MDX runtime in output, the rename
  + call-rewrite applied, server-mode emit, provider wiring default/disable,
  `.md` format detection, async ≡ sync.
- `render.test.ts` — headings/emphasis/lists/quotes/code blocks; GFM tables
  (incl. `style={{textAlign}}` alignment), strikethrough, task lists,
  autolinks; `.md` keeps `{expr}`/`<Tag/>` literal.
- `components.test.ts` — embedded `.tsrx` Counter stays interactive; mapping
  via `components` prop (component + host-string), via `MDXProvider`, nested
  merge, `disableParentContext`, function-form, `wrapper` layout;
  `useMDXComponents` via `renderHook`. Provider semantics cite
  @mdx-js/react lib/index.js.
- `frontmatter.test.ts` — `export const frontmatter` + values in expressions;
  YAML block not rendered.
- `ssr.test.ts` — server-compiled documents through `octane/server`
  `renderToString` (the hydration.test.ts eval trick + a provider stub):
  markdown output, `components` prop server-side, frontmatter server-side.

## Open design questions

- **Hydration.** SSR output renders, but client/server block alignment for
  MDX's descriptor-array bodies is untested — `hydrateRoot` over a
  server-rendered document is future work (needs gap 2 fixed first so both
  sides take the same shape).
- **Provider context across SSR.** `MDXProvider` context is client-only: the
  `octane` entry is the client runtime, whose context is disjoint from
  `octane/server`'s. Every octane binding shares this limitation; if a
  server-condition export (or shared context store) lands, `useMDXComponents`
  picks it up for free. Until then, pass `components` as a prop for SSR.
- **Syntax highlighting.** The hook point is `rehypePlugins` (e.g.
  `@shikijs/rehype` — its hast output serializes through the same pipeline);
  not bundled by default to keep the dependency surface flat. Worth a
  documented recipe once a docs site consumes this.
- **HMR.** `.mdx` edits invalidate the module (no HMR-accept boundary);
  fast-refresh for documents would need the octane HMR wrapper to cover
  return-JSX/passthrough components.
- **`.md` opt-out ergonomics.** `octaneMdx({ md: false })` exists; whether
  `.md` should default to opt-in (some apps import `.md` as raw text via
  `?raw`) can be revisited when a consumer hits it — `?raw`/query'd imports
  are already left alone.
