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

> **Phase 1 — all six open questions resolved (2026-07-06): hydration
> (byte-adoption tests, on top of the two octane gap fixes below), SSR provider
> context (`@octanejs/mdx/server`), Shiki recipe + integration tests, `.mdx`
> fast refresh, `.md` default-on + asset-query passthrough, and chained
> two-stage sourcemaps (composes fully — octane gap 4 fixed, generated
> positions trace back to `.mdx` lines). All octane gaps below are fixed
> (`ssrComponent` host-string tags; server value-lowering of returned
> fragments; return-JSX sourcemap segments), and the adapter is down to ONE
> fixup. mdx suite: 51 tests.**
>
> Phase 0 — the full pipeline + provider layer landed (2026-07). Green: 25
> tests (compile shape, markdown/GFM/`.md` rendering, embedded `.tsrx`
> components, provider semantics, frontmatter, SSR renderToString), full
> monorepo suite 2200 green, typecheck + format clean.

## Architecture — compile, don't interpret

@mdx-js/mdx with **`jsx: true`** emits the compiled document as classic JSX
*source* (no `_jsx` runtime calls), and with **`providerImportSource`** it
imports `useMDXComponents` from a configurable module. That emitted program is
exactly the React-style `.tsx` dialect octane's compiler already handles, so:

```
.mdx / .md
  → @mdx-js/mdx compile({ jsx: true, SourceMapGenerator, providerImportSource, … })  (JSX/ESM source)
  → recmaOctaneAdapter                                                               (1 small ESTree fixup, below)
  → octane/compiler compile(source, id, { mode: 'client' | 'server' })               (real octane codegen)
```

(`providerImportSource` defaults per mode: `@octanejs/mdx` client,
`@octanejs/mdx/server` server — each runtime's own context store.)

What each MDX construct becomes under octane's `.tsx` handling:

- `_createMdxContent(props)` (the document body, `return <>…</>`) — a
  return-JSX function: octane compiles it to the `(props, __s, __extra)` ABI;
  the fragment return value-lowers to an array of `createElement` descriptors
  (client) / `ssrChild([...])` over the same descriptor array (server) — one
  slot range + one block per item, the shape hydration adopts.
- `<_components.h1>` member tags (markdown elements via the mapping, value
  `"h1"` unless overridden) — component-tagged elements whose runtime value may
  be a host tag STRING; the client de-opt renderer and the server's
  `ssrComponent`/`ssrChild` both render string comps in the same block shape.
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
  `useMDXComponents`, `MDXComponents` types (client runtime context).
- `packages/mdx/src/server.ts` — the same provider layer mirrored onto
  `octane/server` context for SSR passes (keep merge semantics in lockstep
  with index.ts).

## recmaOctaneAdapter — the two-compiler adaptations

Down to ONE small ESTree fixup over MDX's emitted program (an ABI difference,
not a gap): **rewrite the bare `_createMdxContent(props)` call to
`<_createMdxContent {...props}/>`.** The direct call bypasses the
`(props, __s, __extra)` ABI (the server body would run on `__s === undefined`
scope recovery); as JSX both layout branches mount through the component
machinery on client and server.

Former adaptations, dropped as their octane gaps were fixed:

- ~~Rename `_createMdxContent` (a `_`-prefixed identifier tag compiled as a
  host string tag)~~ — fixed in octane: `isComponentTag` classifies `_`/`$`-
  prefixed identifier tags as component references, per JSX semantics.
- ~~Server mode: wrap `_components.*` elements in expression containers~~ —
  fixed in octane (both halves, 2026-07-06): `ssrComponent` renders a
  host-tag-STRING comp as the `<!--[--><tag>…</tag><!--]-->` block the client's
  componentSlot/de-opt renderer adopts, and the server compiler value-lowers a
  RETURNED FRAGMENT through `ssrChild([...])` — the exact per-item block shape
  (text items included) the client's return-slot childSlot adopts on
  hydration. Both sides now take the same shape from the same source.

## octane gaps hit (fixed in octane, simplified here)

1. **FIXED — `<_foo/>` / `<$foo/>` identifier tags compiled as host string
   tags.** `isComponentTag` now follows JSX semantics (only `/^[a-z]/` is an
   intrinsic; tests: `octane/tests/component-tag-names.test.ts`).
2. **FIXED — a member-expression/dynamic tag resolving to a host tag STRING
   crashed SSR** (`ssrComponent` called the string). `ssrComponent` now
   serializes string comps inside the standard component block range (client
   `componentSlot` routes strings through the de-opt host renderer), so the
   shape matches across client mount, SSR, and hydration adoption (tests:
   `octane/tests/ssr-host-string-tags.test.ts`,
   `octane/tests/hydration/host-string-tag-hydrate.test.ts`).
3. **FIXED — a return-JSX component returning a FRAGMENT desynced hydration.**
   The client value-lowers `return <>…</>` to a descriptor array (return-slot
   childSlot: one slot range + one `<!--[-->…<!--]-->` block per item); the
   server's template walk concatenated children with markerless text
   separators and no slot range — silently duplicating content on hydrate. The
   server compiler now routes value-position returned fragments through
   `ssrChild([...])` (compile.js `ssrCompileBody`), byte-aligning both sides.
4. **FIXED — `compileReturnJsxFunction` emitted no sourcemap segments**
   (map-less `printNode`), so the two-stage .mdx map chain composed to empty
   for document bodies. It now prints via `printNodeWithMap` and threads
   esrap's real segments back through the module map (compile.js), so the
   chain composes and generated positions trace to `.mdx` lines
   (`tests/sourcemap.test.ts`).

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
  `renderToString` (the eval trick, injecting the REAL `@octanejs/mdx/server`
  provider): markdown output, `components` prop server-side, server
  `MDXProvider` across a render pass, provider-route ≡ prop-route payload
  bytes, frontmatter server-side.
- `hydration.test.ts` — server-render → `hydrateRoot` adoption: byte-identical
  DOM (markers included), adopted (not rebuilt) nodes, no console.error, an
  embedded `.tsrx` Counter interactive post-hydration, prop-mapping and
  server-provider→client-provider parity, post-hydration re-render.
- `shiki.test.ts` — the optional `@shikijs/rehype` recipe (devDependency
  only): highlighted tokens client-side, SSR/client payload parity, hydration
  adoption of the highlighted tree.
- `hmr.test.ts` — fast-refresh: emit shape (hmr wrap + self-accept, client
  serve only) and a live hot-swap through the runtime `hmr()` wrapper.
- `vite.test.ts` — plugin id claiming: `.md` default-on, `md: false`, asset
  queries (`?raw`/`?url`/`?inline`) pass through, bookkeeping queries don't.
- `sourcemap.test.ts` — two-stage map: valid v3 output naming the document;
  the full chain traces generated positions back to `.mdx` lines.

## Open design questions — RESOLVED (2026-07-06)

All six answered; details below for the record.

- **Hydration — DONE.** Gaps 2+3 fixed in octane made client/server take the
  same shape from the same source; `hydration.test.ts` asserts byte-adoption
  (`container.innerHTML === html` post-hydrate), node identity, zero
  console.error, and an interactive embedded Counter. One cosmetic note: a
  keyless-array `console.warn` fires only when a document RE-RENDERS with a
  changed mapping (documents are keyless descriptor arrays; index fallback is
  correct for static content).
- **Provider context across SSR — DONE via `@octanejs/mdx/server`.** No
  cross-runtime bridge needed: the server runtime has full context support
  (`scope.$$ctxValues`, top-down within a pass), so the ~40-line provider
  layer is mirrored onto `octane/server` context and server-mode documents
  default `providerImportSource` to `@octanejs/mdx/server`. The server
  provider threads the mapping across `renderToString`, serializes the same
  payload as the `components` prop route, and hydrates byte-for-byte into the
  client `MDXProvider`. The two layers must stay in lockstep (noted in both
  files). The `components` prop remains the runtime-agnostic route.
- **Syntax highlighting — DONE as a recipe.** `@shikijs/rehype` through
  `rehypePlugins` (README recipe + `shiki.test.ts`); devDependency only,
  nothing bundled. Async plugin ⇒ `compileMdx`/the vite plugin, not
  `compileMdxSync`.
- **HMR — DONE.** octane's runtime `hmr()` wrapper handles return-based
  components fine; the octane COMPILER only auto-wraps exported `@{}`-form
  components, and MDX's `MDXContent` (ternary-returning passthrough) isn't
  recognized as one. The pipeline knows its own emitted shape, so it appends
  the identical registration itself (wrap default export + self-accept) for
  client+hmr compiles — `.mdx` edits now re-render live mounts in place.
- **`.md` default-on — KEPT.** Docs trees want plain markdown compiled;
  `md: false` opts out wholesale. The "left alone" claim for query'd imports
  was WRONG (the transform stripped the query before matching) — fixed:
  asset queries (`?raw`, `?url`, `?inline`, workers) now pass through
  untouched (vite's asset plugin owns them), while vite-internal bookkeeping
  queries (`?v=`, `?used`, `?import`) still transform. Tested.
- **Sourcemaps — DONE.** @mdx-js/mdx emits stage-one (via `source-map`'s
  `SourceMapGenerator`); octane emits stage-two; `@jridgewell/remapping`
  composes. With octane gap 4 fixed (return-JSX functions map via
  `printNodeWithMap`), the chain composes for real documents and generated
  positions trace back to `.mdx` lines; the non-empty guard stays as a
  defensive fallback to octane's intermediate-JSX map.
