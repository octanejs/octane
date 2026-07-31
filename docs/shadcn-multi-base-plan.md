# shadcn multi-base support — React Aria and Base UI

Extends [`@octanejs/shadcn`](../packages/shadcn) from a single Radix-backed
component set to upstream's **three parallel primitive bases**: Radix (shipped),
React Aria, and Base UI.

This is Follow-up #1 of [`shadcn-port-plan.md`](./shadcn-port-plan.md). That
document's "Multi-base support" section measured the gap on 2026-07-26; the
numbers below re-measure it against the tree as of 2026-07-29 and reach a
different sequencing conclusion.

## Why this is not a new port

`packages/shadcn` already ships 44 component sources (40 families, ~185 exports),
a registry emitter with a `--check` twin, and a 15-file test suite including a
differential rig. Upstream's own multi-base design is what makes this tractable:
**a component's class strings, `data-slot`/`data-variant`/`data-size` attributes,
and cva variant maps are identical across bases.** Only the primitive imports and
the parts wiring differ. The visual and DOM-contract layer is already ported and
tested; this work re-hosts it on two more primitive libraries.

## Measured gap (2026-07-29)

### React Aria — no primitive ports required

`@octanejs/aria/components` is a real `react-aria-components` port: 50 modules
covering 153 RAC exports, published at its own subpath. 49 RAC export names are
absent, but they cluster entirely into families the shipped shadcn components do
not use:

| Missing cluster | Count | Needed by the 44 shipped families? |
| --- | --- | --- |
| `Calendar*` / `Date*` / `TimeField` | 16 | No — `calendar`/`date-picker` are not shipped (await a day-picker binding) |
| `Color*` | 11 | No — no color components exist upstream or here |
| `Virtualizer` / `*Layout` / `Rect`/`Point`/`Size` | 10 | No |
| `UNSTABLE_Toast*` | 5 | No — shadcn's toast is `sonner`, already ported |
| `DropZone` / `FileTrigger` / `DIRECTORY_DRAG_TYPE` | 3 | No |
| `Focusable`, `Pressable`, `I18nProvider`, `RouterProvider`, `SSRProvider` | 5 | **Possibly** — these exist under `packages/aria/src` but are not re-exported from `/components` |

The only plausible work is a **re-export fix** on that last row, and only if the
aria-base sources reach for them. The earlier "only `toast` is missing" note
described the *hooks* tier; the components tier is in better shape than recorded.

### Base UI — 6 blockers, not 12

32 of 45 upstream subpaths are ported. The Menu family (`menu`, `menubar`,
`context-menu`) landed after the previous measurement, which removes most of the
old blocker list. Filtering the remainder to what the shipped families need:

| Bucket | Modules |
| --- | --- |
| **Blocks a shipped family (6)** | `accordion`, `collapsible`, `tabs`, `select`, `scroll-area`, `navigation-menu` |
| Out of scope regardless (6) | `autocomplete`, `combobox`, `drawer`, `otp-field`, `toast`, `toolbar` |
| Type-only / already present (2) | `types`; `utils` is ported as a directory and was previously miscounted as missing |

### Consequence for sequencing

The prior plan recommended `aria toast` first, then twelve Base UI modules. Both
inputs have changed: React Aria needs **no** port, and Base UI needs **six**.
React Aria therefore goes first — it validates the whole multi-base architecture
with zero binding work, so any structural mistake surfaces while it is still
cheap to redo. Base UI then lands into a proven frame as its primitives arrive.

## Architecture

### Directory layout

Adopt upstream's `bases/{base}/ui/` shape, with the base-agnostic layers shared:

```text
packages/shadcn/src/
  bases/
    radix/ui/*.tsrx         # moved from src/ui/ in Phase 0
    react-aria/ui/*.tsrx
    base-ui/ui/*.tsrx
  lib/                      # shared — cn(), variant helpers
  hooks/                    # shared
  styles/                   # shared — theme tokens
```

There is no `src/index.ts`: each family is reached by its own subpath, so a
barrel would exist only to be tree-shaken.

Sharing `lib/`, `hooks/` and `styles/` is not a convenience: those layers carry
the class/token contract that is *supposed* to be identical across bases.
Duplicating them would let the bases drift visually, which is precisely the
regression this structure prevents.

The move happens in Phase 0, while exactly one base exists. Performing it later,
with three bases in flight, is strictly worse.

### Distribution: registry-first, no barrel

Maintainer direction (2026-07-29): the primary distribution is the **registry** —
consumers run the shadcn CLI and own the copied sources, which is shadcn's whole
philosophy. The package additionally exposes **one subpath per component
family**, so an application that prefers a dependency can take exactly the
families it uses.

The monolithic barrel is **removed**. `import { Button, Dialog } from
'@octanejs/shadcn'` pulled every family — and transitively every primitive of
every base — into a consumer bundle to use one component. There is no `.` entry,
and no `main`/`module`/`types` fields.

```jsonc
{
  "./Button":            "./src/bases/radix/ui/button.tsrx",
  "./DropdownMenu":      "./src/bases/radix/ui/dropdown-menu.tsrx",
  // …one per family; radix is the default base, so it takes the bare subpath
  "./react-aria/Button": "./src/bases/react-aria/ui/button.tsrx",
  "./base-ui/Button":    "./src/bases/base-ui/ui/button.tsrx",
  "./cn":                "./src/lib/utils.ts",
  "./types":             "./src/lib/types.ts",
  "./hooks/use-mobile":  "./src/hooks/use-mobile.ts",
  "./theme.css":         "./src/styles/theme.css"
}
```

Subpaths are the PascalCase of the kebab-case family file, following the
`@octanejs/lexical` precedent for `.tsrx` subpath exports. A family subpath
yields the whole family (`./Dialog` → `Dialog`, `DialogContent`,
`DialogTrigger`, …) because compound parts share context and cannot be split.

Type resolution is not assumed. `tests/types/subpath-surface.ts` imports through
every published subpath and fails both on an unresolved module (`TS2307`) and on
a binding that resolved to `any` — the failure mode an ambient
`declare module '*.tsrx'` would otherwise hide. It runs as a second `tsrx-tsc`
program (`tsconfig.consumer.json`) because the package tsconfig excludes
`tests/` and `src/` never imports its own subpaths, so neither would catch a
broken exports map.

### Registry: one namespace per base

Base selection happens at install time, via the namespace protocol:

```jsonc
// components.json
"registries": {
  "@octane":         "https://octanejs.dev/r/{name}.json",
  "@octane-aria":    "https://octanejs.dev/r/react-aria/{name}.json",
  "@octane-base-ui": "https://octanejs.dev/r/base-ui/{name}.json"
}
```

```bash
npx shadcn add @octane-aria/button
```

Item names stay identical across bases, so switching base is a `components.json`
change rather than a rewrite of every `add` command. This supersedes the parent
plan's deferral of the per-base registry shape — registry-first distribution
makes it load-bearing now rather than in Phase 4.

### Dependencies

`@octanejs/aria` and `@octanejs/base-ui` join `@octanejs/radix` as dependencies.
Per the maintainer policy recorded in `status.json`, sibling bindings are pinned
to published versions, not workspace ranges.

## Non-breaking guarantees

The Phase 0 restructure moves 44 files; that is where breakage would originate.
Four mechanical gates make safety provable rather than asserted:

1. **`pnpm --dir packages/shadcn registry:check`** — the emitter's existing
   `--check` twin. Byte-identical registry output after the move proves no
   shadcn-CLI consumer can observe it. This is the load-bearing gate, because
   the registry is the primary distribution.
2. **The suite passes with assertions untouched** — only import specifiers may
   change. A test edited to match new behavior has stopped being evidence.
3. **`tests/exports.test.ts`** — every base source file maps to a subpath, every
   subpath resolves to a file that exists, and every radix family has a registry
   item. Catches a component that is added but reachable by neither route.
4. **`tests/types/subpath-surface.ts`** — the published subpath surface carries
   real types, not `any`.

The barrel removal is a genuine breaking change for anyone importing
`@octanejs/shadcn` directly, and is intentional; it needs a changeset and a
migration note (`import { Button } from '@octanejs/shadcn/Button'`).

Standing project rule, restated because multi-base work tends to surface core
defects: when a base exposes an Octane runtime, compiler, scheduler, SSR, or
hydration bug, repair it at root cause in `packages/octane` with a regression
test and a changeset. Never an in-binding workaround (the hook-form precedent).

## Phases

### Phase 0 — Foundations (no new components)

1. Fast-forward the branch to current `upstream/main`; run `pnpm install` (the
   lockfile moved and four workspace packages were added: `cli`, `valtio`,
   `docusaurus`, and a docusaurus test fixture).
2. Move `src/ui/*.tsrx` → `src/bases/radix/ui/*.tsrx`; update the registry
   emitter's source root and the test imports.
3. Prove the move: `registry:check` byte-identical, full package suite green,
   `pnpm typecheck`, `pnpm format:check`.
4. Replace the barrel with per-family subpath exports; migrate the tests off
   `@octanejs/shadcn` onto those subpaths (they resolve by package
   self-reference, so the suite exercises the real exports map rather than a
   vitest alias).
5. Add the consumer type probe and the export drift guard.

**Exit criteria:** zero diff in emitted registry output; every existing test
passes with only import specifiers changed; the subpath type probe and the
export drift guard both fail when deliberately broken.

### Phase 1 — React Aria base

1. Confirm whether the aria-base sources need `Focusable`/`Pressable`/
   `I18nProvider`/`RouterProvider`/`SSRProvider`; if so, re-export them from
   `@octanejs/aria/components` in a `packages/aria` PR with its own test.
2. Port Tier 1 (static/presentational) → Tier 2 (stateful primitives) → Tier 3
   (composites), mirroring the tier order the Radix base used.
3. Per family: class strings and `data-*` attributes byte-match the Radix base;
   behavior is tested against the shared parameterized suite.
4. SSR/hydration coverage for the portal-free families, matching the Radix
   base's current SSR boundary.

### Phase 2 — Base UI primitives

Six ports, each its own PR per the maintainer's sequencing call, in dependency
order (cheapest first, each unblocking the next):

`collapsible` → `accordion` → `tabs` → `scroll-area` → `select` →
`navigation-menu`

Each lands with differential verification against real `@base-ui/react@1.6.0`,
and refreshes `packages/base-ui/status.json` in the same PR that moves the
surface.

### Phase 3 — Base UI base

The same tiered port as Phase 1, over the primitives from Phase 2.

### Phase 4 — Registry multi-base protocol

`shadcn-port-plan.md` deliberately deferred the per-base registry namespace
shape (`@octane/base-ui/select` versus a `base` field on the item) as
speculative until a real consumer existed. Phase 1 creates that consumer, so the
decision is made on evidence and then documented here.

## Risks

- **Silent visual drift between bases.** The mitigation is structural: shared
  `lib/`/`styles/`, plus a cross-base assertion that class strings and `data-*`
  attributes are byte-identical per family.
- **The Phase 0 move.** Contained by the three gates above; the registry
  `--check` twin is the load-bearing one.
- **Base-specific primitive semantics** (focus management, portal behavior,
  controlled-state timing) that no class-string comparison can observe. Covered
  behaviorally in the shared suite, not by markup diffing.
- **Tailwind-less test blindness** — inherited from the parent plan: asserting a
  class string cannot catch a class Tailwind v4 will not generate. The e2e app's
  real Tailwind build remains the backstop.
- **Coverage claims drifting from reality.** Both `packages/aria/status.json`
  and `packages/base-ui/status.json` understated coverage badly enough to invert
  this plan's sequencing. Refresh `status.json` in the PR that moves each
  surface, never in a later cleanup.
