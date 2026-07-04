# Base UI → octane migration plan (`@octanejs/base-ui`)

Faithful port of **Base UI** (`@base-ui/react`, base-ui.com) to the octane
renderer, mirroring the `@octanejs/radix` methodology. Ported from the pinned
`mui/base-ui` checkout at **`v1.6.0`** (the version installable from this
environment's npm), proven by **differential parity** against the real
`@base-ui/react`. Standing discipline (from the Radix port): **when a faithful
port can't reproduce React behavior, fix octane with a regression test + changeset; never
work around it in the binding.**

## Progress (reverse-chronological)

> **Phase 1 (in progress) — Meter + Progress + Toggle DONE (2026-07). Green: 21 differential
> tests vs real `@base-ui/react@1.6.0` (Separator ×5, useRender ×2, Fieldset ×4, Meter ×3,
> Progress ×3, Toggle ×4), base-ui typecheck clean, full monorepo suite 1497 green.**
>
> - **Meter** (`src/meter.ts`): Root (`role="meter"`, range math)/Track/Indicator/Value/Label.
>   Proves the multi-part context + derived-state + **style-object serialization parity** with
>   React (`visuallyHidden`, `insetInlineStart`, `width:40%` all byte-identical).
> - **Progress** (`src/progress.ts`): adds the `status` state
>   ('indeterminate'|'progressing'|'complete') via a custom `stateAttributesMapping` →
>   `data-progressing`/`data-complete`/`data-indeterminate` on every part; indeterminate
>   (`value={null}`) omits `aria-valuenow` + empties the fill. Uses `useValueAsRef(format)`.
> - **Toggle** (`src/toggle.ts`): a two-state `<button>` (`type="button"`, `aria-pressed`).
>   Differential test drives **real clicks** — uncontrolled toggle flips byte-identically to
>   React across clicks; disabled + controlled are no-ops. The group path (CompositeItem)
>   throws pending ToggleGroup; standalone is complete.
>
> **Reusable internals layer built (all slot-threaded plain-`.ts`, faithful ports):**
> `utils/useBaseUiId`, `useRegisteredLabelId`, `valueToPercent`, `clamp`, `stringifyLocale`,
> `formatNumber`/`formatNumberValue`, `visuallyHidden`, `useValueAsRef` (≈ floating-ui
> `useLatestRef`), `useStableCallback`, `useControlled`, `useFocusableWhenDisabled`,
> `CompositeRootContext` (stub — undefined until the composite system lands), `useButton`
> (native-event adaptation: `makeEventPreventable` on the native event), `createChangeEventDetails`
> + `REASONS`, `ToggleGroupContext`. Dev-warning surfaces dropped per the port policy.

> **Phase 1 (in progress) — Fieldset DONE (2026-07). Green: 11 differential tests
> (4 new: basic aria-labelledby wiring, disabled, explicit-id, legend render-prop).**
> `src/fieldset.ts` — `Fieldset.Root` (`<fieldset>`, `disabled` state + `data-disabled`,
> provides a plain octane context) and `Fieldset.Legend` (`<div>`, generated id via the
> net-new `src/utils/useBaseUiId.ts` = octane `useId` + `base-ui-` prefix; a layout effect
> feeds `legendId` back to the Root as `aria-labelledby`). Base UI uses a PLAIN React
> context (not the scoped factory) → ported as a plain `createContext` + `Provider`
> (`createElement(Ctx.Provider, …)`) + throwing consumer.
>
> **octane bug #1 — fixed in octane (compiler), not worked around.** A component root that
> PRECEDES a static host root in a multi-root fragment body rendered in REVERSED order.
> Base UI's Fieldset hits this because a Root's children (`[<Legend/>, <control/>]`) thread
> through `useRenderElement` → `createElement('fieldset', { children })`, and the `.tsrx`
> compiler lowers those children to a fragment render-fn. The fragment-body codegen
> (`planJsx` / `emitElementHtml` in `compiler/compile.js`) dropped the component root's
> source-order `<!>` anchor, so the static content drained first and the component appended
> at `endMarker` AFTER it — also a client/server divergence (the server emitted source
> order) that could mis-adopt on hydration. Fix: emit the `<!>` anchor for a component root
> in a mixed body, mirroring the in-element mixed-children path. Regression tests:
> `tests/mixed-child-order.test.ts` (client mount: static / value-position / effect-driven),
> `tests/hydration/mixed-frag-hydrate.test.ts` (server DOM adopted in place, no mismatch).
> Changeset `.changeset/mixed-fragment-component-anchor.md` (`octane` patch). Full suite:
> 1488 tests green.

> **Phase 0 foundation — DONE (2026-07). Green: 7 differential tests, base-ui typecheck
> clean.** Established the whole substrate: pinned `.base-ui/` checkout (gitignored,
> `v1.6.0`), package scaffolding (`package.json`, `tsconfig`, `internal.ts`
> re-namespaced from radix, README), the catalog entry (`@base-ui/react`
> `1.6.0`), the `base-ui` vitest project (jsdom + differential precompile + `octane()`
> exclude for `src/`+floating-ui + subpath aliases), the root typecheck entry, and the
> differential harness (`_setup.ts` per-subpath rewrite `@octanejs/base-ui/<sub>` →
> `@base-ui/react/<sub>`; reuses octane's `mountDifferential`).
>
> **The composition engine is ported and byte-verified** — the make-or-break piece
> (`docs/radix-migration-plan.md:267` rejected Base UI on the missing-clone blocker, now
> resolved): `mergeProps`/`mergePropsN`/`mergeClassNames` (`src/utils/mergeProps.ts` — with
> the octane adaptation: octane dispatches NATIVE events, so `preventBaseUIHandler` is
> shimmed onto the native event instead of gated behind React's `isSyntheticEvent`),
> `useRenderElement` (`src/utils/useRenderElement.ts` — the engine, over octane
> `cloneElement`/`createElement`/`useComposedRefs`; octane's no-rules-of-hooks drops Base
> UI's conditional-ref-hook dance), and the public `useRender` (`src/use-render.ts`) +
> `merge-props` (`src/merge-props.ts`). Supporting utils ported: `resolveClassName`,
> `resolveStyle`, `mergeObjects`, `getStateAttributesProps`, `getElementRef`, and
> `composeRefs` (copied from radix). First component **`Separator`** (`src/separator.ts`)
> passes differential parity in all forms — intrinsic-tag render, render-prop **element**
> (clones onto `<hr>`, className concatenates), render-prop **function**, `className` as a
> function of state, `state`→`data-orientation` — as does `useRender` (basic + function).
> **Key finding: Base UI's `render`-prop is prop-position (an element descriptor), which is
> octane's native shape — a *better* fit than Radix's children-position `asChild`.**
> No octane bugs surfaced yet.

## Phased plan (full surface, ~35 components)

- **Phase 0 — Foundation** (DONE): scaffolding + `.base-ui` + engine + differential harness.
  *Exit:* `useRender` + a trivial component byte-equal in the rig (element+function render,
  className string+fn, `data-*` state). ✅
- **Phase 1 — Simple state / proof**: Separator ✅, Toggle, ToggleGroup, Avatar, Progress,
  Meter, Fieldset. *Exit:* rig-green; state exposure + render engine proven.
- **Phase 2 — Field/Form + form controls (densest)**: Field, Form, Checkbox, CheckboxGroup,
  Switch, Radio, RadioGroup, NumberField, Input, Slider. Validation system + octane
  uncontrolled-input adaptations. *Exit:* native-behavior parity; divergences documented.
- **Phase 3 — Overlays (on `@octanejs/floating-ui`)**: Popover, Dialog, AlertDialog, Tooltip,
  PreviewCard, Menu, Menubar, ContextMenu, Toast. *Exit:* open/close/positioning parity +
  dedicated focus/dismiss tests.
- **Phase 4 — Navigation + composite + Select**: Tabs, Accordion, Collapsible, Toolbar,
  NavigationMenu, ScrollArea, Select. *Exit:* rig + roving-focus/keyboard tests.
- **Phase 5 — Long tail + polish**: Autocomplete, Combobox; SSR/hydration; README +
  divergence notes; changeset; parity-plan + memory. *Exit:* full `pnpm test`/typecheck/
  format green.

## Reused from the octane ecosystem

- **`@octanejs/floating-ui`** — full `@floating-ui/react` port; Base UI's entire
  positioning/interaction/focus/portal substrate (Phase 3+). Depend on it like radix does.
- **`packages/radix/src/` helpers** (copy-by-value, re-namespace `S`): `internal.ts`,
  `compose-refs.ts`, `use-effect-event.ts`, `useControllableState.ts`, `useId.ts`,
  `direction.ts`, `context.ts`, `Presence.ts`, `Portal.ts`, `FocusScope.ts`,
  `DismissableLayer.ts`, `collection.ts`, `scroll-lock.ts`, `use-size.ts`. `Form.ts` is the
  validation reference for Field/Form.
- **octane runtime**: `cloneElement`/`Children`/`isValidElement`/`normalizeClass`.

## Intentional divergences (port the functional outcome, not React's surface)

- Native events, not synthetic (`preventBaseUIHandler` shimmed onto the native event).
- `forwardRef` → ref-as-prop.
- `className` composition via octane's `normalizeClass` at the apply site; the render-prop
  merge concatenates strings exactly like Base UI.
- Dev-only warnings skipped (repo policy).

## Verification

Per phase: the `base-ui` vitest project (differential + unit) green; `pnpm typecheck`;
`pnpm format:check`. Differential parity vs real `@base-ui/react` is the gold
standard. Re-clone the source: `git clone https://github.com/mui/base-ui .base-ui && git -C
.base-ui checkout v1.6.0`.
