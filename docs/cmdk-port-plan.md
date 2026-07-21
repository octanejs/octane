# cmdk → Octane port (`@octanejs/cmdk`)

A direct Octane port of the published **`cmdk@1.1.1`** source (upstream repo
[`dip/cmdk`](https://github.com/dip/cmdk); the older `pacocoursey/cmdk` path
301-redirects to it). The pinned upstream reference is tag `v1.1.1` — pin the
exact commit in `status.json`/provenance headers when the port lands. The port
preserves cmdk's public API (`Command` namespace, `useCommandState`,
`defaultFilter`) and its DOM-authoritative filtering/selection model; only the
React-renderer wiring is adapted.

cmdk is a strong fit for Octane: it is small (two source files, ~1250 lines),
has no class components, and its entire third-party surface is `@radix-ui/react-*`
packages that **are already ported and differential-verified in
[`@octanejs/radix`](../packages/radix)**. The novel work is confined to cmdk's
own DOM-imperative core.

## Scope

Included — the full published surface of `cmdk@1.1.1`:

- The `Command` namespace: `Command`/`Command.Root`, `Command.Input`,
  `Command.List`, `Command.Item`, `Command.Group`, `Command.Separator`,
  `Command.Empty`, `Command.Loading`, `Command.Dialog`, plus the flat aliases
  (`CommandRoot`, `CommandInput`, …).
- `useCommandState(selector)` — external-store slice subscription.
- `defaultFilter` and the vendored `command-score` scorer.
- The behavior contract: `shouldFilter`, custom `filter`, controlled/uncontrolled
  `value` (selection) and `Input` `value`/`onValueChange` (search), `loop`,
  `vimBindings`, `disablePointerSelection`, `keywords`, `forceMount`, keyboard
  navigation (arrows, Home/End, `Ctrl+n/p/j/k`, Enter), and the `cmdk-*`
  attribute contract consumers style against.

Out of scope for the first release (recorded in `status.json`, not API changes):

- Nothing structural is planned to be dropped. `asChild` (Slot) is **in scope**
  because `@octanejs/radix` already ships `Slot`; if a corner of Slot semantics
  proves incompatible with Octane's opaque compiled children, that specific
  corner is documented as a divergence rather than silently omitted.

## Architecture

cmdk's design (see upstream `ARCHITECTURE.md`) is **DOM-authoritative**: every
item and group is always present in the component tree; each one adds/removes
*itself from the DOM* based on the search, selection is tracked by item **value
string** (never index), and the selected item is read back from the DOM
(`querySelector('[cmdk-item=""][aria-selected="true"]')`). Filtering scores each
item; `sort()` physically reorders DOM nodes with `appendChild`. This model is
the heart of the port and is deliberately preserved.

Source layout (mirrors upstream so vendored files keep their relative imports):

- `src/command-score.ts` — **vendored verbatim.** Pure, framework-free scoring
  functions; no React, no DOM. Copied unchanged with a provenance header.
- `src/index.ts(rx)` — the component library, ported from upstream `index.tsx`.
  Component host elements (`.tsrx`) plus the framework-free store/context/helper
  logic (`.ts`). Follow the radix precedent (hand-written sources with
  `octane.hookSlots.manual`) where the compiler needs explicit hook-slot
  assignment; use `.tsrx` for the JSX-bearing component bodies.

Dependency on `@octanejs/radix` — cmdk's four Radix runtime deps map directly to
already-ported modules, so we depend on `@octanejs/radix` rather than
re-porting:

| upstream cmdk import | Octane replacement |
| --- | --- |
| `@radix-ui/react-primitive` (`Primitive.div`/`.input`, `asChild`) | `@octanejs/radix` `Primitive` |
| `@radix-ui/react-dialog` (for `Command.Dialog`) | `@octanejs/radix` `Dialog` |
| `@radix-ui/react-id` (`useId`) | `@octanejs/radix` `useId` (or `octane`'s `useId`) |
| `@radix-ui/react-compose-refs` (`composeRefs`) | Octane multi-ref `ref={[a, b]}` |
| `command-score` (vendored in upstream) | vendored here too, unchanged |

> Verify at implementation time that `@octanejs/radix` re-exports `Primitive`,
> `Dialog`, `Slot`, and `useId` from its public entry (the source files exist:
> `Primitive.ts`, `Dialog.ts`, `Slot.ts`, `useId.ts`). If any is internal-only,
> either widen radix's exports or import the specific module path.

Intentional renderer adaptations (the mechanical ones):

- React hooks map to Octane equivalents; the custom external store
  (`useSyncExternalStore` over a mutated-in-place snapshot) ports directly —
  **confirm Octane's `useSyncExternalStore` re-runs the selector on every
  `emit`** rather than relying on snapshot identity, since cmdk mutates one
  stable state object in place.
- `forwardRef` is dropped; every component takes `ref` as a normal prop.
- `composeRefs(a, b)` becomes Octane's native multi-ref `ref={[a, b]}`.
- Radix `useId` → Octane `useId` for `listId`/`labelId`/`inputId` and every
  item/group id (hydration-stable, so `aria-activedescendant`/`id`/`htmlFor`
  match across server and client).
- The `useLayoutEffect` isomorphic shim (`typeof window === 'undefined'`) is
  replaced by Octane's `useLayoutEffect` directly.
- The bespoke `useScheduleLayoutEffect` batcher maps onto Octane's effect
  scheduler; keep the numeric-slot collapsing so many item mounts still produce
  one filter/sort/emit per layout cycle.

## Intentional divergences

Each maps to a documented Octane-wide design (see
`docs/react-parity-migration-plan.md`); phrase them in `status.json` using the
established binding vocabulary.

- **`onInput`, not synthetic `onChange`.** `Command.Input` drives search from
  React's per-keystroke synthetic `onChange`; Octane text inputs use native
  `onInput`. The **public `onValueChange(search)` API is unchanged** — only the
  internal `<input>` wiring changes. This is the `OCTANE_NATIVE_TEXT_ONCHANGE`
  case; do not add a synthetic layer. Controlled `value` follows Octane's
  React-equivalent controlled-input semantics.
- **`forwardRef` becomes octane's ref-as-prop** (every component).
- **Native DOM events, not synthetic.** `onSelect`, pointer, and keyboard
  callbacks observe native delegated events. The custom `cmdk-item-select` DOM
  event that carries Enter to the selected item's handler is native already and
  is preserved.
- **No class components / no StrictMode double-invoke.** cmdk has none; the port
  omits any StrictMode-specific guards and the legacy `useId` UUID fallback,
  since Octane always provides `useId`.
- **Opaque compiled children (the central risk).** cmdk introspects children in
  a few places — `useValue` derives an item's value from its first string child
  or `textContent`, and Slot/`asChild` (`SlottableWithNestedChildren`) reaches
  into `children.type`/`.props`/`.render`. Octane's compiled children are opaque
  render bodies. Mitigations, in order of preference: (1) the DOM `textContent`
  fallback in `useValue` already works renderer-independently — lean on it; (2)
  reuse `@octanejs/radix`'s ported `Slot` for `asChild`; (3) where an inspection
  genuinely can't be reproduced, require the value in prop position (`value=`)
  and document it, matching the radix/i18next precedent (`Slot`/`asChild`
  composes element descriptors, not children-position JSX).
- **Keyed reconciler vs imperative DOM moves.** cmdk's `sort()` reorders real
  DOM nodes with `appendChild` *outside* the framework, then children re-render.
  Octane's LIS-based keyed reconciler moves nodes differently than React. This
  must be validated (see Open risks); if the reconciler fights the imperative
  moves, prefer expressing ordering through a keyed `@for` over sorted ids rather
  than raw `appendChild`, and record the approach as a divergence.

## Phases

Small port, but the reconciler/DOM-authoritative interaction warrants staged
validation. Each phase carries a hard exit criterion and gets a
`**Status: shipped <date>.**` stamp updated in place.

- **Phase 0 — scaffold + scorer.** Package skeleton (`package.json`,
  `tsconfig.json`, `status.json`, `README.md`, `CHANGELOG.md`), `command-score.ts`
  vendored (algorithm unchanged; typed params + repo formatting), `defaultFilter`
  exported. *Exit:* unit tests for `command-score` pass against upstream
  expectations. **Status: shipped 2026-07-20.** (Not yet wired into the root
  `vitest.config.js`/catalog/docs — that registration pass is pending.)
- **Phase 1 — core static render.** `Command`, `Command.Input`, `Command.List`,
  `Command.Item`, `Command.Empty` with the store, registration, and `useValue`
  wired; `onInput`-driven search; filtering (no sort yet — non-matches unmount).
  *Exit:* behavioral coverage of render → type-to-filter → empty-state, and an
  SSR test rendering all items in source order. **Status: shipped 2026-07-21**
  (render, value inference from textContent, first-item selection, filter,
  empty; SSR landed in Phase 5). Cleared open risks #2
  (`useSyncExternalStore` re-runs selectors on `emit`) and the opaque-children
  question (value derives from `textContent`).
  Differential parity against real cmdk + React landed later (see Evidence).
- **Phase 2 — selection + keyboard + sort.** `aria-selected`/`data-selected`,
  first-item selection, arrow/Home/End/vim navigation, Enter → `onSelect`,
  `scrollIntoView`, and score-ordered results. *Exit:* behavioral coverage of
  keyboard-driven selection and filtered ordering, plus a test for the
  imperative-sort/reconciler interaction (see Open risks). **Status: shipped 2026-07-21.**
  Cleared **open risk #1**: Octane tolerates cmdk's imperative
  `appendChild` reordering — a narrowing-after-reorder test confirms no ghost
  nodes and no reconciler corruption; the final DOM order is correct. The port
  is faithful (no divergence needed) after fixing a real robustness bug in the
  `useScheduleLayoutEffect` batcher — it must snapshot-and-clear the queue
  *before* running callbacks (so a callback that schedules more work isn't
  wiped) and isolate each callback (so one throwing, e.g. `scrollIntoView` in
  jsdom, can't drop the rest).
- **Phase 3 — groups, separator, loading, controlled modes.** `Command.Group`
  (+heading), `Command.Separator` (`alwaysRender`), `Command.Loading`,
  controlled `value`/`onValueChange`, `loop`, `forceMount`, `shouldFilter`,
  custom `filter`. *Exit:* behavioral coverage of grouped + controlled fixtures.
  **Status: shipped 2026-07-21** (grouped filtering + group hiding, group value
  registration and group score ordering, separator show/hide, loading
  progressbar, loop wrap, controlled value via re-render). Nested
  `GroupContext`, grouped item registration, and group-level visibility
  filtering all work on Octane.
- **Phase 4 — `Command.Dialog` + `asChild`.** Wrap `@octanejs/radix` `Dialog`;
  wire `Slot` for `asChild`. *Exit:* behavioral tests for open/close, focus, and
  portal (the differential rig shares one document, so focus/portal get
  behavioral rather than differential coverage — the radix/aria precedent).
  **Status: shipped 2026-07-21** for `Command.Dialog` — composes
  `@octanejs/radix` `Dialog.Root/Portal/Overlay/Content` via `createElement`
  descriptors (radix's `Portal` iterates children with `Children.map`, so the
  overlay/content are passed as descriptors, not opaque `.tsrx` children);
  behavioral tests cover open→portal render, closed, and teardown-on-unmount.
  **`asChild` is intentionally not supported** (documented divergence): cmdk's
  `SlottableWithNestedChildren` clones a child element via
  `React.cloneElement`/`isValidElement` and re-parents the component's own
  content into it, which has no faithful equivalent over octane's opaque
  compiled children — components always render their own host element.
- **Phase 5 — hydration hardening.** `hydrateRoot` adoption test: SSR all-items
  markup hydrates, first client commit registers/filters/selects/reorders with
  **no hydration-mismatch warning** and node identity preserved. *Exit:*
  hydration test green; `status.json` `ssr` field states the real coverage.
  **Status: shipped 2026-07-21.** SSR renders all items in source order with
  stable `useId`s (Empty visible because the filter count starts at 0);
  `hydrateRoot` adopts the server nodes with no mismatch, then activates (values
  infer, first item selects, Empty hides, typing filters). Surfaced and fixed a
  real hydration/`sort()` interaction: cmdk's `sort()` moved **all** valid items
  including the score-0 ones about to unmount, and moving-then-unmounting a node
  orphans it in an octane hydrated tree (it is carried out of its
  hydration-marker range, so removal leaves an empty host). Fix: `sort()` now
  reorders **only** the surviving (score > 0) items and leaves the non-matches to
  unmount in place — identical visible result, hydration-safe. (Cleared the
  hydration side of open risk #1 and #3.)

## Evidence

One test layer per bullet, following the sonner/nuqs layout; every test must run
(no `skip`/`todo`/`fails` — `pnpm test:markers:check` enforces it, and
`docs/binding-parity-gaps.md` must stay at 0 pins).

- **Unit** — `command-score` scoring and `defaultFilter` against upstream
  fixtures (framework-free).
- **Component (jsdom)** — filtering, selection, keyboard navigation, groups,
  controlled modes, `onSelect` firing, `useCommandState` subscriptions; via
  `@octanejs/testing-library`.
- **Differential** — the same `.tsrx` fixtures through Octane and the real
  `cmdk`+React using the shared rig
  (`packages/octane/tests/differential/_rig.ts` `mountDifferential`, with this
  package's own `tests/differential/_setup.ts` and `.react-cache/`), asserting
  byte-equal `innerHTML` after each `step` over render, type-to-filter, keyboard
  selection, and grouped/controlled fixtures. (Focus/portal/`Command.Dialog`
  stays behavioral — one shared document in the rig.) Documented divergences are
  driven through `observe`; everything else is byte-compared.
- **SSR + hydration** — `tests/ssr/` (node env, `renderToString`) for all-items
  source-order markup and stable ids; `tests/hydration.test.ts` for adoption
  with zero `console.error` and preserved node identity.

## Registration checklist

Everything outside `packages/cmdk/` (authoritative template:
`git show --stat 4097b6c4`, the `@octanejs/nuqs` addition). Do the CI-forced
items up front — they are the easiest to miss.

1. `pnpm-workspace.yaml` — add `cmdk` (and confirm `react`/`react-dom`/`esbuild`/
   `@tsrx/react`/`vitest` catalog entries exist) to `catalogs: default:`.
2. `pnpm install` → regenerates `pnpm-lock.yaml`.
3. Root `package.json` — append
   `&& tsgo --noEmit -p packages/cmdk/tsconfig.json` to the `typecheck` script.
4. `vitest.config.js` — add the jsdom project (with `globalSetup` for
   differential) **and** the `cmdk-ssr` node project, each aliasing
   `@octanejs/cmdk` → `packages/cmdk/src/index.ts` (SSR project also aliases
   `octane` → the server entry).
5. `packages/octane-mcp-server/src/bridge.js` — add `cmdk: '@octanejs/cmdk'` to
   `KNOWN_BINDINGS` (`bridge.test.js` fails without it).
6. `website/src/content/bindings.json` — add `@octanejs/cmdk` to exactly one
   category (e.g. UI and interaction).
7. `website/public/llms.txt` — add to the prose bindings list.
8. `docs/packages.md` — `pnpm packages:inventory`.
9. `docs/bindings-status.md` — `pnpm bindings:status`.
10. `docs/binding-parity-gaps.md` — `pnpm binding-parity:gaps` (new row at 0).
11. `packages/octane-evals` corpus — `pnpm --dir packages/octane-evals corpus:generate`
    (required because `pnpm-lock.yaml` changed; manifests digest the lockfile).
12. `.rulesync/rules/project.md` — add to the bindings list, then
    `pnpm rules:generate` (regenerates `AGENTS.md`/`CLAUDE.md`/`GEMINI.md`/
    copilot/cursor — never hand-edit those).
13. `docs/cmdk-port-plan.md` — this file, referenced from `status.json` `docs`.
14. Final gate: `pnpm format:check` (repo-wide), `pnpm typecheck`, `pnpm test`.

No changeset is required for a brand-new binding (the nuqs commit added none) —
add one only if the port requires a fix inside `packages/octane`.

## Open risks / verification

1. **Imperative DOM sort vs the keyed reconciler (highest risk).** Prove out
   early (Phase 2) whether Octane tolerates cmdk's `appendChild` reordering, or
   whether ordering must be expressed as a keyed `@for` over score-sorted ids.
2. **`useSyncExternalStore` selector re-run** on in-place-mutated snapshots —
   confirm before building on the store (Phase 1).
3. **`useId` hydration stability** across server/client for every item/group —
   the primary hydration-correctness dependency (Phase 5).
4. **`@octanejs/radix` public exports** for `Primitive`/`Dialog`/`Slot`/`useId`
   — confirm reachable from the package entry (Phase 1 / Phase 4).
5. **Octane core bugs found by the port** — if the DOM-authoritative model
   surfaces a runtime/reconciler bug, fix it at root cause in `packages/octane`
   with a regression test (and a changeset), per the hook-form precedent — no
   in-binding workarounds.

## Follow-up

1. **Restore source order when a search is cleared.** The differential suite
   surfaced this: `sort()` relocates matching items with `appendChild`, and when
   the search clears React's reconciler puts the nodes it owns back in source
   order while octane leaves them where they were moved. Same items and
   selection, different residual order — recorded in `status.json`.
2. **File a compiler diagnostic** for the trailing slot symbol: octane compiles a
   custom-hook call as `withSlot(sym, hook, ...args, sym)`, so ANY custom hook
   with an optional trailing parameter silently receives a Symbol when a caller
   omits it (the `= []` default never fires). This cost this port a per-render
   throw in `Group` that passing tests could not see.
3. Hardening that does not change the public API: cover
   `vimBindings`/`disablePointerSelection` edge cases and IME composition; add
   `Command.Dialog` container/portal option coverage; revisit the `asChild`
   decision from Phase 4; keep `status.json` `verified`, `surface` and `ssr`
   honest as coverage grows.
