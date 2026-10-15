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

Generated document functions now use template bodies on client and server.
`overridableTags` specializes generated hosts for sites with a fixed override
set, while its default preserves full provider/prop overrides. The website
lists `table` and `pre` and forwards its shared Strong setting. The adapter
uses MDX's existing printer handlers and source-map generator; no additional
parser or runtime is introduced. Authored expressions retain ordinary Octane
semantics, and whole-module Strong checking remains opt-in for other callers.

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

@mdx-js/mdx with **`jsx: true`** emits JSX source and wires
`useMDXComponents` from the configured provider module. The adapter converts
both generated functions using MDX's existing printer extension:

```
.mdx / .md
  → @mdx-js/mdx (remark/rehype/recma, provider mapping)
  → template printer (generated document body and layout dispatcher)
  → octane/compiler (client templates or server HTML strings)
```

- `_createMdxContent` owns the document template. Generated host mappings
  remain dynamic unless excluded by `overridableTags`.
- `MDXContent` owns the optional-layout template and mounts the document body
  through the normal component ABI in either branch.
- Explicit layouts, custom components, authored JSX, and provider/prop
  precedence keep MDX's behavior.
- The provider defaults remain `@octanejs/mdx` on the client and
  `@octanejs/mdx/server` on the server.
- `strong` forwards the application's policy to the Octane compiler. It is
  optional and applies to the whole document module.
- Existing source-map composition and template HMR preserve the document's
  authored source identity, live updates, and named-export invalidation.

### Packages

- `packages/mdx/src/compile.js` — the pipeline (`compileMdx`/`compileMdxSync`/
  `defaultRemarkPlugins`) + `recmaOctaneAdapter`. Authored in `.js` (JSDoc'd,
  like `octane/compiler` and @octanejs/stylex's vite entry) so the vite entry's
  import chain loads under Node's native ESM loader.
- `packages/mdx/src/vite.js` — `octaneMdx()`: claims `.mdx`/`.md`
  (`enforce: 'pre'`), produces FINAL JS, per-module SSR auto-detection copied
  from `octane/compiler/vite` — composes with the octane plugin with no
  ordering hazard (disjoint extensions).
- `packages/mdx/src/index.tsrx` — the @mdx-js/react port: `MDXProvider`,
  `useMDXComponents`, `MDXComponents` types (client runtime context).
- `packages/mdx/src/server.tsrx` — the same provider layer mirrored onto
  `octane/server` context for SSR passes (keep merge semantics in lockstep
  with index.tsrx).

## recmaOctaneAdapter — the two-compiler adaptations

The adapter preserves the upstream component-map construction, converts the two
generated render bodies into templates, and routes the no-layout branch through
`<_createMdxContent {...props}/>` instead of a direct function call. Optional
host specialization affects only generated host mappings. The printer delegates
ordinary setup and JSX back to the existing handlers, retaining source positions
for the existing two-stage map.

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
