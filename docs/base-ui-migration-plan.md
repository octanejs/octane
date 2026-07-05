# Base UI → octane migration plan (`@octanejs/base-ui`)

Faithful port of **Base UI** (`@base-ui/react`, base-ui.com) to the octane
renderer, mirroring the `@octanejs/radix` methodology. Ported from the pinned
`mui/base-ui` checkout at **`v1.6.0`** (the version installable from this
environment's npm), proven by **differential parity** against the real
`@base-ui/react`. Standing discipline (from the Radix port): **when a faithful
port can't reproduce React behavior, fix octane with a regression test + changeset; never
work around it in the binding.**

## Progress (reverse-chronological)

> **Phase 2 (in progress) — CheckboxGroup DONE (2026-07). Green: 41 differential tests.**
> `src/checkbox-group.ts` — a `role="group"` whose child `<Checkbox.Root>`s derive `checked`
> from a shared value array; the previously-dormant parent-checkbox branches in `checkbox.ts`
> are now wired via `useCheckboxGroupParent` (a 3-state select-all parent: indeterminate when
> only some children are ticked). New utils: `areArraysEqual`, `useCheckboxGroupParent`.
> **Remaining Phase 2: NumberField (~2600 lines) + Slider (~2835 lines)** — each a mini-subsystem
> (value/format state machine + pointer scrub/drag) whose architecture is mapped; they are the
> two large dedicated items left.

> **Phase 2 (in progress) — the Field/Form validation SYSTEM + Input DONE (2026-07). Green:
> 39 differential tests vs real `@base-ui/react@1.6.0`, base-ui typecheck clean.** This is the
> densest Phase-2 subsystem (~1800 lines):
> - **Field** (`src/field.ts`): `Field.Root` (+ the real `FieldRootContext` via
>   `useFieldValidation` — the native-constraint + custom async validation state machine — and
>   `useFieldControlRegistration`), `Field.Control`, `Field.Label`, `Field.Description`,
>   `Field.Error` (transition-mounted), `Field.Validity` (render-prop), `Field.Item`. The real
>   `LabelableProvider` (`src/utils/field/`) drives the label↔control↔description id association
>   (`for` / `aria-labelledby` / `aria-describedby`) — verified byte-identical.
> - **Form** (`src/form.ts`): `<form noValidate>` + the real `FormContext` (field registry,
>   submit-time validation, first-invalid focus). **Input** (`src/input.ts`) = `<Field.Control/>`.
> - octane text-input adaptation: the initial value is the `value` ATTRIBUTE, a controlled value
>   is driven via the `.value` PROPERTY (mirrors the checkbox adaptation).
>
> **Binding bug fixed (my `useRenderElement` port, not octane):** the `enabled: false` path
> assigned `outProps = EMPTY_OBJECT` (shared module const) then mutated `outProps.ref`, poisoning
> `EMPTY_OBJECT.ref` with a stale composed-ref callback. A later component rendering with the
> DEFAULT (no-state) EMPTY_OBJECT then emitted `data-ref="<fn>"` via `getStateAttributesProps`.
> Surfaced by a differential test-ordering probe (RadioGroup's grouped Radio uses `enabled:false`
> → then Form failed). Fix: run the composed-refs hook for slot stability but only assign
> `outProps.ref` when enabled, returning EMPTY_OBJECT untouched.

> **Phase 2 (in progress) — Checkbox + Radio + RadioGroup DONE (2026-07). Green: 35 differential
> tests vs real `@base-ui/react@1.6.0`.** The boolean/choice-control family is complete
> (Switch, Checkbox, Radio, RadioGroup), all reusing the octane uncontrolled-input adaptation
> + the field-context infrastructure:
> - **Checkbox** (`src/checkbox.ts`): `Root` + transition-mounted `Indicator`; indeterminate
>   (`aria-checked="mixed"` + `input.indeterminate` property). Group/parent-checkbox branches
>   dormant until CheckboxGroup.
> - **Radio** (`src/radio.ts`) + **RadioGroup** (`src/radio-group.ts`): RadioGroup renders a
>   `role="radiogroup"` via **CompositeRoot** (reusing the Phase-1 roving-focus system), each
>   Radio a **CompositeItem** deriving `aria-checked` from the group value; the selected radio
>   holds the active tab stop (`data-composite-item-active`). New small utils: `serializeValue`,
>   `contains`, `FieldItemContext`, `getDefaultFormSubmitter`, `CheckboxGroupContext`/`RadioGroupContext`.
> - Click interactions verified byte-identical (toggle, selection-move).

> **Phase 2 (in progress) — Field/Form context infrastructure + Switch DONE (2026-07).
> Green: 29 differential tests vs real `@base-ui/react@1.6.0` (3 new Switch: uncontrolled
> toggle, default-checked, disabled — all with click interaction), base-ui typecheck clean.**
>
> - **Field/Form context infrastructure** (`src/utils/field/` + `src/utils/{owner,useValueChanged,noop}.ts`):
>   the context surfaces every form control threads through, ported with Base UI's DEFAULT
>   values so controls work standalone (inert validation): `FieldRootContext`
>   (+ `DEFAULT_FIELD_ROOT_CONTEXT`), `FormContext`, `LabelableContext`, `field/constants`
>   (`DEFAULT_FIELD_ROOT_STATE`/`fieldValidityMapping`/`FieldValidityData`), and the consumer
>   hooks `useRegisterFieldControl`, `useAriaLabelledBy`, `useLabelableId`, `useValueChanged`.
>   The full `Field.Root`/`Form` PROVIDERS (which override the defaults + run validation) land
>   later this phase; the controls are differential-tested standalone first.
> - **Switch** (`src/switch.ts`) — `Switch.Root` (`role="switch"` span + hidden checkbox input)
>   + `Switch.Thumb`. Reuses `useButton`/`useControlled`.
>
> **octane uncontrolled-input adaptation (the Phase-2 crux, reusable by Checkbox/Radio/etc.):**
> octane inputs are UNCONTROLLED (a `checked` prop writes a `checked` ATTRIBUTE), but React's
> controlled `<input checked>` reflects only the INITIAL checked to the attribute (as its
> default-state) and drives the live value via the `.checked` PROPERTY. So the port: (1) passes
> `checked: initialCheckedRef.current || undefined` (the initial state → attribute), (2) drives
> the live `input.checked` PROPERTY imperatively via the native
> `HTMLInputElement.prototype` setter in a layout effect, and (3) the root's `onClick`
> dispatches a native `click` on the hidden input → native `change` → `onChange` (octane
> delegates `change` for de-opt `createElement` inputs — confirmed). This mirrors the proven
> `@octanejs/radix` bubble-input pattern; it is a binding adaptation to octane's *documented*
> uncontrolled-input divergence, not a workaround for a bug. Verified byte-identical incl. the
> click-toggle interaction.

> **Phase 1 COMPLETE — ToggleGroup + Avatar DONE (2026-07). Green: 26 differential tests
> vs real `@base-ui/react@1.6.0`, base-ui typecheck clean, full monorepo suite green.**
> All Phase-1 components shipped: Separator, Fieldset, Meter, Progress, Toggle, **ToggleGroup**,
> **Avatar**.
>
> - **ToggleGroup** (`src/toggle-group.ts`) + Toggle's group path — required porting Base UI's
>   entire **composite roving-focus system** (`src/utils/composite/`): `CompositeRoot` +
>   `useCompositeRoot` (arrow/Home/End keyboard nav, default tab stop), `CompositeList` +
>   `useCompositeListItem` (stable-Map registration → document-order index + MutationObserver),
>   `CompositeItem` + `useCompositeItem` (roving `tabIndex` 0/-1 + focus/hover), plus vendored
>   floating-ui list utils (`list-utils.ts`), `keys.ts` (nav constants + `scrollIntoViewIfNeeded`),
>   a minimal `DirectionContext`, and `useRefWithInit`. Decision: **ported Base UI's composite
>   directly** rather than bridging to `@octanejs/floating-ui`'s `Composite` (different API +
>   behavior would break byte-parity). Differential tests: single-select (roving tabindex +
>   value→aria-pressed + click moves value), multiple-select (`data-multiple`), disabled group.
>   **This unlocks Toolbar / Menu / Menubar / Select / NavigationMenu / Tabs / RadioGroup for
>   later phases.**
> - **Avatar** (`src/avatar.ts`) — Root/Image/Fallback + the **transition system**:
>   `useTransitionStatus` (+ `transitionStatusMapping` → `data-starting-style`/`data-ending-style`),
>   `useOpenChangeComplete` → `useAnimationsFinished` → `useAnimationFrame`/`resolveRef`,
>   `useImageLoadingStatus` (off-DOM `new Image()` load tracking), `useTimeout`. Under jsdom the
>   image never resolves, so (identically on both renderers) the `<img>` stays unmounted and the
>   Fallback shows — verified `<span class="av"><span class="av-fb">JD</span></span>`.
>
> Internals now available for Phase 2+: the composite system, the transition/animation system,
> `useButton`/`useControlled`/`useFocusableWhenDisabled`, `useStableCallback`/`useValueAsRef`/
> `useRefWithInit`/`useTimeout`, `useBaseUiId`/`useRegisteredLabelId`, `DirectionContext`.

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
