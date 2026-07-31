# shadcn/ui → Octane port (`@octanejs/shadcn`)

An Octane port of **shadcn/ui** — the component distribution platform at
[`shadcn-ui/ui`](https://github.com/shadcn-ui/ui) — pinned to the **`shadcn@4.14.1`**
CLI release (2026-07-23) and a specific `main` commit of the component sources
(pin the exact commit in `status.json`/provenance headers when the port lands;
upstream serves registry items unversioned and mutates them continuously, so the
commit pin IS the version).

shadcn is architecturally unlike every existing binding: it is **not an npm
runtime library** but a registry of copy-paste component *sources* plus the
`shadcn` CLI that installs them into apps. As of 2026 it ships three parallel
primitive bases (Base UI — the default, Radix, React Aria), eight visual styles
per base as pure CSS, a Tailwind v4 CSS-first theme system, and a decentralized
registry protocol (namespaced third-party registries are the *intended*
integration path — `@namespace/item` resolution, custom `registries` in
`components.json`, an MCP server that browses any conforming registry).

The port targets the **Radix base** (`apps/v4/registry/bases/radix/ui/*.tsx`)
because its entire primitive surface maps onto the differential-verified
[`@octanejs/radix`](../packages/radix), and upstream has committed to shipping
"every update and new component" for the Radix base alongside Base UI. A
Base-UI-base flavor over `@octanejs/base-ui` is an explicit follow-up, not v1.

## Distribution shape (the central decision)

Hybrid — a normal workspace binding that *generates* a conforming registry:

1. **`packages/shadcn`** is a standard binding package (raw-source publish,
   `main: src/index.ts`, catalog deps, `octane` peer — the radix/sonner
   conventions). It holds the ported component sources and the full test suite,
   so the components live under this repo's CI gates (`status.json`,
   bindings-status, parity-gaps, prod-mode, format).
2. **A registry emitter** (`scripts/` in the package) walks those sources and
   writes `registry.json` + per-item `registry-item.json` conforming to the
   published schemas (`https://ui.shadcn.com/schema/registry-item.json`), with
   `dependencies` pointing at published `@octanejs/*` versions and `files[]`
   carrying the `.tsrx` sources. `website/` serves the output at `/r/{name}.json`
   so users configure `"registries": { "@octane": "https://octanejs.dev/r/{name}.json" }`
   and run `npx shadcn add @octane/button` — the upstream CLI works unmodified
   against a conforming registry (verified behavior of the namespace protocol).
3. Consumers therefore choose upstream-faithfully: copy-paste ownership via the
   CLI (primary, matches shadcn's philosophy), or `import { Button } from
   '@octanejs/shadcn'` as an ordinary binding (secondary; upstream itself now
   publishes a runtime package, `@shadcn/react`, so this is no longer heresy).

Registry items are emitted from the SAME sources the tests run against — the
registry is generated output with a `--check` twin, never hand-edited (the
bindings-status/packages-inventory pattern, `scripts/generate-bindings-status.mjs`).

## Styling-flavor pivot (2026-07-25)

By maintainer direction, the package's canonical styling is switching from the
pinned `bases/radix` semantic-hook (`cn-*`) system to the **default-Tailwind
utilities-inlined flavor** — class strings supplied verbatim by the maintainer
per component (or taken from upstream `new-york-v4` where not yet supplied).
Consequences, all applied: migrated components style against any Tailwind v4
build without a shadcn style sheet; registry items for migrated components
install through the upstream CLI without its `cn-*` style-transform stripping
(closing part of the Phase-4 finding); the differential rig's vendored React
references switch flavor together with their components. `status.json` tracks
the exact migrated/pending split; the pending families still use `cn-*` +
style-sheet styling until their flavors are supplied.

## Scope

Tiered by what the octane ecosystem already provides. ~62 upstream components;
v1 ships Tiers 1–3 (≈45 components), the rest are recorded out-of-scope in
`status.json` with reasons, not silently missing.

**Tier 1 — primitive-free (markup + cva + `cn()`; ~17):** button, badge, card,
alert, table, input, textarea, label, skeleton, kbd, spinner, item, empty,
breadcrumb, pagination, typography, native-select. Pure structure/class ports;
`data-slot`/`data-variant`/`data-size` attributes and class strings preserved
byte-for-byte (they are the public styling contract).

**Tier 2 — `@octanejs/radix`-backed (~24):** accordion, alert-dialog,
aspect-ratio, avatar, checkbox, collapsible, context-menu, dialog, dropdown-menu,
hover-card, menubar, navigation-menu, popover, progress, radio-group, scroll-area,
select, separator, sheet, slider, switch, tabs, toggle, toggle-group, tooltip.
Phase 0 verifies per-component that `@octanejs/radix` exports the needed
primitive surface from its public entry (the cmdk-plan precedent, which caught
export gaps early); any gap is fixed in `packages/radix` (widening exports or
porting the missing primitive) — never worked around in this package.

**Tier 3 — stateful composites over existing bindings (~6):** command
(`@octanejs/cmdk` — NOTE: in flight on the `cmdk-port-plan` PR; this phase
blocks on it landing and publishing), sonner/toaster (`@octanejs/sonner`; the
`next-themes` theme hook is replaced — see divergences), chart
(`@octanejs/recharts`), data-table (`@octanejs/tanstack-table`), sidebar
(context + `use-mobile` on octane hooks), field (the 2025+ form-replacement
family; plain octane state, no hook-form dependency).

**Out of scope for v1 (each with a `status.json` reason):**

- Components whose third-party runtime dep has no octane binding: calendar +
  date-picker (`react-day-picker`), carousel (`embla-carousel-react`),
  input-otp (`input-otp`), resizable (`react-resizable-panels`), drawer
  (`vaul` on the radix base; upstream itself is displacing it), combobox and
  toast (Base-UI-only primitives), the chat components (`@shadcn/react`).
  Each is a follow-up port target, most as future bindings.
- The Base UI and React Aria bases; the 8-style visual matrix beyond one
  default style; presets; RTL (`Direction`); the `rsc`/`"use client"` axis
  (octane has no Server Components — documented repo-wide divergence).
- CLI/MCP reimplementation — explicitly none: the upstream CLI consumes our
  registry as-is. We ship registry JSON, not tooling.

## Architecture

Source layout mirrors upstream's `bases/radix/ui/` one-file-per-component:

- `src/ui/*.tsrx` — component sources. Upstream files are plain React 19
  function components (no `forwardRef` — upstream already dropped it, which
  removes the single largest historical adaptation); JSX-bearing bodies port to
  `.tsrx`, with `.tsrx.d.ts` sidecars only if a file's exports can't be
  expressed otherwise (sonner precedent, `packages/sonner/src/index.ts:1-8`).
- `src/lib/utils.ts` — `cn()` vendored: `clsx` + `tailwind-merge`, unchanged
  (both framework-free; octane's native clsx-style `class` composition could
  subsume `clsx`, but keeping `cn()` byte-faithful keeps every ported class
  expression diff-able against upstream).
- `src/hooks/*.ts` — `use-mobile` and friends on octane hooks.
- `src/index.ts` — barrel, one namespace per component family (radix-binding
  convention, `packages/radix/src/index.ts`).
- `src/styles/` — the theme token CSS (oklch variables, `--radius` scale,
  `.dark` overrides) and one default style's CSS, exported like sonner's
  stylesheet (`sideEffects` + an exports subpath). Tailwind itself is NOT a
  dependency of this package or repo: components carry class strings; the
  consumer's Tailwind v4 build compiles them. Tests assert classes and
  `data-slot` attributes, never computed styles.
- `scripts/build-registry.mjs` (+ `--check`) — the registry emitter.

Dependency mapping (upstream → this port):

| upstream (radix base) | Octane replacement |
| --- | --- |
| `radix-ui` (unified package) | `@octanejs/radix` |
| `cmdk` | `@octanejs/cmdk` (in-flight PR; pinned version per the cmdk precedent) |
| `sonner` + `next-themes` | `@octanejs/sonner` + a props/context theme divergence |
| `recharts@3.8.0` | `@octanejs/recharts` |
| `lucide-react` | `@octanejs/lucide` |
| `@tanstack/react-table` (data-table docs) | `@octanejs/tanstack-table` |
| `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css` | unchanged (framework-free), via `catalog:default` |
| `react-hook-form` (legacy `form` item only) | not needed — Field family replaces it upstream |

Binding-package conventions this package must follow (all verified against the
current rules): raw-source publish (`main`/`module`/`types` → `src/index.ts`,
`files: ["src"]`), `octane` as `peerDependencies: workspace:*`, third-party deps
via `catalog:default`, sibling bindings pinned to published versions (the
maintainer decision on `cmdk→radix`; registry-item `dependencies` carry the same
pins), `tsconfig` with `jsx: react-jsx` + `jsxImportSource: octane`, central
typecheck via root `tsgo` (never plain `tsc` over `.tsrx`), no `declare module`
shims ever (`.rulesync/rules/project.md:144-168`), `octane.hookSlots.manual`
only if hand-written `.ts` foundations need it (expected NOT needed — sources
are `.tsrx`).

## Intentional divergences

Phrased with the established binding vocabulary; each lands in `status.json`
and inline `// OCTANE DIVERGENCE:` notes at the point of divergence.

- **Native events.** `onInput` drives per-keystroke behavior on `input`,
  `textarea`, and Field internals (`OCTANE_NATIVE_TEXT_ONCHANGE` guidance);
  component-level callback APIs (`onValueChange`, `onCheckedChange`,
  `onOpenChange`) are unchanged. No synthetic `onChange` anywhere.
- **Refs are props.** Upstream already has no `forwardRef`; octane's
  `ref={[a, b]}` replaces any residual ref composition.
- **`asChild` follows the radix-binding contract.** `@octanejs/radix` ships
  `Slot`, and `asChild` composes element *descriptors* (`createElement`), not
  opaque compiled `.tsrx` children (the documented radix/cmdk divergence).
  Ported component sources avoid `asChild` internally where a plain host
  element suffices, so the divergence surface consumers inherit is minimal.
- **No `"use client"`.** Stripped from all sources; the registry emits with an
  `rsc: false` expectation. Not a capability gap consumers can hit — octane has
  no RSC at all.
- **Theming without `next-themes`.** The sonner/toaster wrapper takes `theme`
  as a prop with a documented octane-native provider pattern instead of the
  `useTheme()` hook from `next-themes` (Next.js-specific). The `.dark`
  class/CSS-variable contract is unchanged.
- **Class and attribute output is NOT divergent.** Class strings, cva variant
  maps, `data-slot`/`data-variant`/`data-size` are contract — preserved
  byte-for-byte and diff-checked against the pinned upstream sources by a
  provenance test, so upstream style CSS and consumer selectors keep working.

## Phases

Each phase has a hard exit criterion and gets a `**Status: shipped <date>.**`
stamp updated in place (cmdk-plan convention).

- **Phase 0 — decision lock + scaffold.** Pin the upstream commit + CLI tag;
  audit `@octanejs/radix`'s public exports against every Tier-2 primitive and
  file the gap list (fixes land in `packages/radix` first); package skeleton
  (`package.json`, `tsconfig.json`, `status.json`, `README.md`), `cn()` +
  theme CSS vendored; registration checklist items 1–4 done up front so CI
  gates run from the first commit. *Exit:* skeleton typechecks + `cn()` unit
  tests pass + the radix export-gap list is resolved or ticketed.
  **Status: shipped 2026-07-24.** Pin `4baadbc6` + `shadcn@4.14.1`; the radix
  audit found ZERO namespace-level gaps across all 24 Tier-2 components; full
  registration (catalog, typecheck, vitest, mcp bridge, website, rulesync,
  generated docs) landed with the scaffold. The upstream style CSS proved to be
  Tailwind-`@apply` source (consumer-compiled), so the package ships the token
  CSS and style CSS moved to the Phase 4 registry emit.
- **Phase 1 — Tier 1 static components.** All ~17 markup+cva components, with
  the byte-fidelity provenance test (ported class strings/data-slots vs pinned
  upstream sources). *Exit:* behavioral coverage per component + provenance
  test green + an SSR test rendering each without browser globals.
  **Status: shipped 2026-07-24; exit criterion AMENDED 2026-07-26.** 16 families
  (upstream's 2026 sources have no standalone typography item), behavioral + SSR
  coverage per family, plus hydration adoption tests for representative shapes.
  The planned byte-fidelity provenance test was made unwritable by the
  styling-flavor pivot below — the shipped class strings are maintainer-supplied
  and have no upstream file to diff against. Fidelity for the flavors that DO
  have an upstream counterpart is proven by the differential rig instead; this
  criterion is retired rather than left silently unmet. Surfaced the
  opaque-children rule: a bare `{children}` hole cannot render compiled
  children — `children ?? fallback` and slot-adjacent forwarding go through
  the createElement/props.children channel (breadcrumb/pagination precedents,
  recorded in the status ledger).
- **Phase 2 — Tier 2 radix-backed components.** Grouped by primitive family
  (overlay: dialog/sheet/alert-dialog/popover/tooltip/hover-card; menus:
  dropdown/context/menubar/navigation; inputs: checkbox/radio/switch/slider/
  select/toggle(-group)/tabs; structure: accordion/collapsible/avatar/
  aspect-ratio/progress/scroll-area/separator). *Exit:* behavioral coverage of
  open/close/keyboard/dismiss per family; radix-binding bugs found here are
  fixed in `packages/radix` with their own tests (no local workarounds).
  **Status: shipped 2026-07-24.** All 24 components across the four families;
  54 behavioral tests driving real open/dismiss/keyboard/controlled flows;
  portal-free components server-rendered in the shadcn-ssr project. Zero radix
  export gaps (two alias/behavior notes in the ledger); one radix-binding
  observation to file upstream (Tooltip dev-only update-during-render warning
  at delayDuration=0).
- **Phase 3 — Tier 3 composites.** sidebar (context/provider + `use-mobile`),
  field, chart, data-table docs recipes; command + sonner wrappers land in the
  order their bindings publish. *Exit:* behavioral coverage incl. controlled
  modes; the cmdk dependency is pinned to a published `@octanejs/cmdk`.
  **Status: partially shipped 2026-07-24** — sidebar (all 24 parts +
  `useSidebar` + `useIsMobile`, incl. cookie persistence, Cmd/Ctrl+B, and the
  mobile Sheet branch) and field landed with 16 behavioral tests. Remaining:
  command (blocked on `@octanejs/cmdk` publishing), sonner wrapper, chart,
  data-table.
- **Phase 4 — registry emit + CLI end-to-end.** `build-registry.mjs` emits
  schema-valid JSON (`shadcn registry validate` in a test); an e2e test runs
  the REAL upstream CLI (`npx shadcn@4.14.1 add @octane/button …`) against the
  built registry in a scratch octane+Vite app and asserts the installed app
  compiles and renders. *Exit:* e2e green in CI; `website/` serves `/r/*`.
  **Partially proven 2026-07-24 (playground, live):** the real CLI resolved the
  `@octane` namespace over HTTP, fetched 11 items, installed the `.tsrx`
  sources to the aliased targets, and auto-installed the pinned npm deps
  (registryDependencies are emitted namespace-qualified — bare names resolve
  against the default @shadcn registry). FINDING: the CLI's local style engine
  strips semantic `cn-*` classes from third-party item content (upstream's own
  server avoids this by serving style-RESOLVED content per requested style);
  until the hosted `/r/` endpoint performs the same per-style resolution, the
  registry payloads install verbatim only outside the CLI's transform. The
  hosted-serving design must resolve `cn-*` against the requested style
  (`{style}` URL placeholder) exactly as upstream does.
  **`.tsrx` through the CLI is SAFE — measured 2026-07-26.** `shadcn@4.14.1`
  manipulates installed files with ts-morph but performs **no type-aware pass**
  (`getPreEmitDiagnostics`, `getTypeChecker`, `createProgram`,
  `getSemanticDiagnostics`, `getSourceFile` all absent from `dist`); it only
  calls `createSourceFile` and `forEachDescendant`. Probing ts-morph 26 against
  the real sources: parsing `.tsrx` as TSX yields parse errors but the
  incremental printer re-prints only MODIFIED nodes, so both an import/alias
  rewrite and a `className` attribute edit inside `@{ … }` bodies leave the rest
  of the file byte-identical (verified on button/sheet/field/sidebar/tabs/select;
  sidebar exposes 28 `className` attributes, 4 edited, body intact). Only the
  type-aware path throws on the `.tsrx` extension, and the CLI never takes it.
  Conclusion: ship `.tsrx` verbatim — a pragma-`.tsx` fallback is unnecessary.
  Residual risk stays with `transformStyle`, which EDITS the class strings it
  recognises: the five semantic hooks still in the payloads (`cn-rtl-flip` ×7,
  `cn-font-heading` ×6, `cn-toast`, `cn-native-select`, `cn-native-select-icon`)
  are what per-style server resolution must cover. All three ARE upstream's own
  semantic classes — they appear in the maintainer-supplied sources — and all
  three are defined in `src/styles/theme.css`, so nothing installs dead.
  (`cn-native-select`/`cn-native-select-icon` were ours, not upstream's, and
  were removed when native-select took its utilities-inlined source.)
- **Phase 5 — SSR/hydration hardening.** `-ssr` vitest project (node env,
  `octane({ ssr: true })`, sonner-project pattern `vitest.config.js:1761-1781`)
  plus `hydrateRoot` adoption tests for the overlay components; `status.json`
  `ssr` states real coverage. *Exit:* zero hydration-mismatch warnings across
  the component set.

## Evidence

- **Provenance/fidelity** — the byte-diff test of class strings, variant maps,
  and `data-*` attributes against the pinned upstream sources (this replaces
  differential HTML comparison as the primary parity proof for Tier 1).
- **Component (jsdom)** — behavioral tests per component via
  `@octanejs/testing-library` (open/close, keyboard, controlled/uncontrolled,
  `data-state` transitions).
- **Differential** — for a representative subset (badge, button, tabs, dialog,
  dropdown-menu): the shared rig (`packages/octane/tests/differential/_rig.ts`)
  with this package's `_setup.ts` rewriting `@octanejs/shadcn` → vendored
  upstream `.tsx` sources (pinned commit, provenance headers, prettier-exempt
  for byte fidelity), `octane` → `react`; the React side runs real `radix-ui` +
  `lucide-react`. Full-surface differential is deliberately NOT attempted — the
  primitive layer is already differential-verified in `@octanejs/radix`;
  duplicating it per-shadcn-component buys little. **Shipped 2026-07-24:** 5
  fixtures / 15 byte-compared steps green, zero divergences; portal'd content
  scoped per the radix parity suite's documented approach (non-modal fixtures,
  trigger-side ARIA/state compare, portal markup covered behaviorally).
- **Registry** — schema validation + the Phase 4 CLI e2e.
- **SSR + hydration** — per Phase 5.
- No `skip`/`todo`/`fails` anywhere (`pnpm test:markers:check`;
  `docs/binding-parity-gaps.md` stays at 0).

## Registration checklist

Mirrors the cmdk plan (authoritative template: the `@octanejs/nuqs` addition,
`git show --stat 4097b6c4`): pnpm catalog entries (`class-variance-authority`,
`tailwind-merge`, `tw-animate-css`; `clsx` exists) → `pnpm install` → lockfile →
root `typecheck` script entry → `vitest.config.js` projects (jsdom +
`shadcn-ssr`; differential globalSetup) → `octane-mcp-server` `KNOWN_BINDINGS` →
`website/src/content/bindings.json` (one category) → `website/public/llms.txt` →
`pnpm packages:inventory` → `pnpm bindings:status` → `pnpm binding-parity:gaps` →
evals `corpus:generate` (lockfile changed) → `.rulesync/rules/project.md`
bindings list + `pnpm rules:generate` → this doc in `status.json` `docs` →
final gates (`pnpm format:check`, `pnpm typecheck`, `pnpm test`). No changeset
for a brand-new binding unless the port fixes something inside `packages/octane`.

## Open risks / verification

1. **`@octanejs/radix` surface completeness (highest risk).** ~24 Tier-2
   components lean on it; Phase 0's export audit converts unknown-unknowns into
   a work list before any component is written. Gaps become radix issues —
   which is precisely the dogfooding value the maintainers want from bindings.
2. **Upstream is a moving target with no source versioning.** Mitigation: the
   commit pin + provenance tests; re-pinning is an explicit, reviewed bump that
   re-runs the fidelity suite. Our own registry CAN be versioned (GitHub-ref
   `registryDependencies` support) even though upstream's isn't.
3. **CLI compatibility drift.** The Phase 4 e2e pins `shadcn@4.14.1`; a later
   CLI may change resolution behavior. The e2e failing IS the signal; bump
   deliberately.
4. **`cmdk` PR dependency.** Command blocks on `@octanejs/cmdk` publishing;
   sequence Phase 3 accordingly rather than vendoring a second cmdk.
5. **Tailwind-less test blindness.** Asserting class strings can't catch a
   class that Tailwind v4 won't generate. Mitigation: the Phase 4 e2e app runs
   a real Tailwind build; keep at least one visual-smoke route there.
6. **Octane core bugs surfaced by composites** (sidebar/field state patterns):
   fix at root cause in `packages/octane` with regression tests + changeset —
   never in-binding workarounds (hook-form precedent).

## Multi-base support (Base UI / React Aria) — measured gap, 2026-07-26

> **Superseded 2026-07-28** by [`shadcn-multi-base-plan.md`](./shadcn-multi-base-plan.md).
> Two inputs below have since changed, and together they invert the recommended
> order: the Menu family landed in `@octanejs/base-ui` (31/45 subpaths now, so
> **6** blockers rather than 12), and `@octanejs/aria/components` turns out to be
> a `react-aria-components` port covering every family shadcn ships — so the
> React Aria base needs **no** binding port and goes first. The section below is
> kept for provenance.

Upstream ships each component against three primitive bases. The Radix base is
what this package ports today; the blocker for the other two is binding
coverage, not the shadcn layer. Measured against the pinned upstreams actually
installed in this repo (`@base-ui/react@1.6.0`, `react-aria@3.50.0`):

**React Aria — one gap.** `@octanejs/aria` already covers every area the aria
base needs (interactions, focus, overlays, menu, listbox, select, tabs,
tooltip, dialog, table/tree, i18n, stately). The only missing module is
**`toast`**. That base is one port away from viable.

**Base UI — 22 of 44 public subpaths ported, 22 missing.** The missing set
splits three ways:

| Bucket | Modules | Why it matters |
| --- | --- | --- |
| Blocks components this package already ships (12) | `accordion`, `button`, `collapsible`, `context-menu`, `menu`, `menubar`, `navigation-menu`, `preview-card`, `scroll-area`, `select`, `tabs`, `tooltip` | Required before a Base UI base can reach today's component parity. `button` may already be satisfied by the ported `use-render`; confirm against the base-ui-base `button` source before scoping it. |
| Blocks components that are out of scope anyway (6) | `autocomplete`, `combobox`, `drawer`, `otp-field`, `toast`, `toolbar` | Track with the other out-of-scope bindings; not on the critical path. |
| Infrastructure / type-only (4) | `csp-provider`, `direction-provider`, `types`, `unstable-use-media-query` | Small, but `direction-provider` is needed for the RTL work item below. |

Sequencing (maintainer's call, 2026-07-26): land the binding ports as their own
PRs, in parallel with finishing the Radix base here — do **not** grow this PR.
Recommended order: `@octanejs/aria` `toast` first (single module, unblocks a
whole base), then the 12 Base UI modules. `packages/base-ui/status.json` and
`packages/aria/status.json` both understate current coverage; refresh them in
the PR that moves each surface, not here.

Deferred until at least one alternate base exists: the registry namespace shape
for per-base variants (`@octane/base-ui/select` vs a `base` field on the item).
Designing it now would be speculative — the first real consumer decides it.

## Follow-up

1. Base UI base over `@octanejs/base-ui`; React Aria base over `@octanejs/aria`
   — gated on the binding gaps measured above.
2. New bindings unlocking out-of-scope components: day-picker, embla-carousel,
   input-otp, resizable-panels (each its own port plan).
3. The style matrix (8 styles), presets, RTL/`Direction`, `menuColor`/`menuAccent`.
4. Registry MCP exposure via `@octanejs/mcp-server` (browse/install `@octane/*`).
5. Keep `status.json` `verified`/`surface`/`ssr` honest as coverage grows.
