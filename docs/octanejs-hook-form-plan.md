# Octane Binding Port: @octanejs/hook-form

> Full port of **react-hook-form 7.81.0** (upstream commit `b7df98c2`) to octane,
> with the upstream test suite ported alongside. Status: **complete** (2026-07-09).

## Shape

react-hook-form has no framework-agnostic core package, but its source splits
cleanly, and the port mirrors the upstream file layout 1:1 under
`packages/hook-form/src/` (each file carries a `Vendored from …` header):

- **Framework-free core, vendored byte-close**: `logic/` (createFormControl,
  validateField, …), `utils/` (get/set/unset, createSubject, …), `types/`,
  `constants.ts`. Diffs against upstream stay reviewable for future syncs.
- **React layer → octane hooks**: `useForm`, `useController`, `useFieldArray`,
  `useFormState`, `useWatch`, `useFormContext`, `useIsomorphicLayoutEffect`
  (plain `.ts` — auto-slotted by the vite plugin, like `@octanejs/redux`).
- **Components → `.tsrx`** (components in binding src need the FULL compile so
  their custom-hook calls are slot-wrapped; the plain-`.ts` pass slots only
  BASE hooks): `controller.tsrx`, `watch.tsrx`, `formStateSubscribe.tsrx`,
  `form.tsrx`, `FormProvider.tsrx` — each with a hand-authored `.tsrx.d.ts`.
- `index.react-server.ts` is NOT ported (octane has no server components).

## The one deliberate divergence: `onInput`

Octane events are native + delegated (no synthetic layer); the per-keystroke
event is `input`. Upstream's `onChange` handler surface is therefore exposed as
**`onInput`**:

- `register()` → `{ name, ref, onInput, onBlur }`; `UseFormRegisterReturn.onChange`
  → `onInput` in types.
- `useController` `field.onInput` (also the programmatic setter, accepting an
  event or raw value — upstream `field.onChange` semantics).
- Option names/semantics unchanged (`mode: 'onChange'` still validates per
  keystroke; register options keep their `onChange`/`onBlur` callback keys).
- Internal event routing untouched: the handler branches blur/focusout vs
  everything else, so subscribe payloads report `type: 'input'` for
  keystroke-driven events ('change' for programmatic Controller sets).

No dual `onInput`+`onChange` aliasing — a single listener means no double-fire
dedupe shim (native `change` on blur is simply not listened to).

## Test parity

Upstream `src/__tests__` ported near-verbatim into
`packages/hook-form/tests/upstream/` (same file layout; header cites the
source). Mechanical mapping: jest→vi, `@testing-library/react` →
`@octanejs/testing-library`, `fireEvent.change`→`fireEvent.input`,
`field.onChange`→`field.onInput`, StrictMode render option dropped,
forwardRef→ref-as-prop, `react-dom/server` → `octane/server`'s
`renderToStaticMarkup` (HTML expectations byte-identical to upstream).

- `tests/upstream/logic|utils/**` — framework-free unit suite (~270 tests).
- `tests/upstream/*.test.tsx` + `useForm/**` + `useFieldArray/**` — the
  component suites (~900 tests), jsdom project.
- `tests/upstream/*.server.test.tsx` — node-env `hook-form-server` project
  (octane server runtime; `octane` aliased to the server entry for the
  binding's plain-`.ts` hook imports).
- `tests/conformance/` — export-surface parity pin vs the real react-hook-form
  (every upstream runtime export, no extras) + octane-specific event micro-suite
  + field-array node-identity canaries.
- `tests/differential/` — the SAME `.tsrx` fixtures run through
  @octanejs/hook-form AND real react-hook-form (redux-style precompile);
  byte-identical DOM asserted after typing/validation/submit/reset/array-op
  steps. The shared rig gained a native `input(selector, value)` driver.
- `typetests/` — upstream `__typetest__` (Path/FieldPath type machinery, zod
  resolver inference) vendored; wired into `pnpm typecheck`.

Genuine gaps are pinned `it.fails` + `// GAP` notes (auto-flip when fixed).

## Octane bugs found & fixed by this port (root-cause fixes, no workarounds)

1. **Compiler**: type-only statements nested in function bodies crashed esrap
   (nulled `typeAnnotation`) — now pruned like top-level ones
   (`packages/octane/tests/compile-nested-type-statements.test.ts`).
2. **Runtime**: zero-arg `useState()`/`useRef()` missed the trailing-slot ABI
   reinterpretation and threw
   (`packages/octane/tests/zero-arg-hooks.test.tsrx`).
3. **Runtime**: `act()` was async-only; React's sync-act contract (flush before
   return) is now supported — required by hundreds of upstream tests.
4. **Runtime**: the de-opt pure-host → component upgrade now ADOPTS the
   existing host tree — element reuse + raw children wrapped into item ranges
   in place, recursively, via childSlot's upgrade branch and the ForSlot
   `adopt` queue — instead of rebuilding, so sibling node identity, focus, and
   input state survive a `{cond && <Comp/>}` flip (React parity;
   `packages/octane/tests/deopt-pure-host-upgrade.test.ts`).
5. **Runtime**: controlled checkables with native `onInput`/`onChange` were
   un-toggleable — the controlled-state restore ran at the end of the CLICK
   dispatch, before the platform's `input`/`change` fired, so handlers read a
   reverted `checked`. The follow-up input/change arms the restore now;
   rejected toggles still snap back
   (`packages/octane/tests/controlled-checkable-native-events.test.tsrx`).
6. **Runtime**: de-opt children now key by SLOT-SCOPED position (compound
   keys, both in the blocks list path and the raw reconciler) — a nested
   `.map()` changing length, or a `{cond && <el/>}` hole flipping falsy, no
   longer shifts SIBLING implicit keys, which remounted/morphed them (the raw
   path could even morph a clicked button into a submit button mid-dispatch
   and fire a phantom form submission;
   `packages/octane/tests/deopt-fragment-sibling-keys.test.ts`).
7. **@tsrx/core (patched via pnpm patch — upstream this into the tsrx
   repo)**: a self-closing JSX element as an expression root mis-lexed
   everything after `/>` as JSX text unless the closer was adjacent — the
   standard prettier `=> (\n  <div />\n)` shape failed to parse.

## Remaining pinned divergences (pre-existing documented octane designs)

Eight ported tests stay `it.fails`-pinned on divergences that are DOCUMENTED
octane-wide design decisions, not port workarounds: microtask-flush commit
granularity vs React's macrotask coalescing (an extra committed render around
async handleSubmit/notification continuations — 6 pins), the eager `Object.is`
setState bailout (one fewer probe render than React — 1 pin), and native-event
delivery of a no-op input event React's synthetic value tracker swallows
(1 pin). Each pin's GAP note cites the corresponding conformance doc.

## Release

`@octanejs/hook-form@0.1.0` (patch-track alpha, like the other bindings).
Changesets: `hook-form-binding.md`, `sync-act-and-zero-arg-hooks.md`.
