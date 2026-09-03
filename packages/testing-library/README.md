# @octanejs/testing-library

[React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
for the [octane](https://github.com/octanejs/octane) UI framework.

## Installation

```sh
npm install @octanejs/testing-library
pnpm add @octanejs/testing-library
```

The split mirrors RTL's own architecture (and
`docs/react-library-compat-plan.md` §2): **`@testing-library/dom` is
framework-agnostic and reused verbatim** — every query, `screen`, `within`,
`waitFor`/`waitForElementToBeRemoved`, `findBy*`, `prettyDOM`,
`configure` — while only react-testing-library's thin React layer is ported to
octane: `render`, `cleanup`, `renderHook`, the `act` re-export, and the
focus/blur event helpers and dom-testing-library config wiring
(`eventWrapper`/`asyncWrapper`) that makes
every dispatch/wait commit octane's scheduled work before your assertions run.

```ts
import { render, screen, fireEvent, cleanup } from '@octanejs/testing-library';
import { Counter } from './Counter.tsrx';

afterEach(cleanup); // automatic when your runner exposes a global afterEach

test('increments', () => {
	render(Counter, { props: { step: 2 } });
	fireEvent.click(screen.getByRole('button'));
	expect(screen.getByRole('button').textContent).toBe('Count: 2');
});
```

## API

- `render(ui, options?)` → `{ container, baseElement, ...queries, rerender, unmount, asFragment, debug }`
- `cleanup()` — unmounts everything `render` mounted (auto-registered afterEach
  when a global `afterEach`/`teardown` exists; opt out with
  `RTL_SKIP_AUTO_CLEANUP=true` or import `@octanejs/testing-library/pure`)
- `renderHook(callback, { initialProps, wrapper, ... }?)` → `{ result, rerender, unmount }`
- `act` — octane's `act`, re-exported (always async; always `await` it)
- `screen`, `waitFor`, `within`, … — dom-testing-library, re-exported
- `fireEvent` — DOM event helpers, with focus/blur pairs for delegated handlers

## Octane-specific surface

**Components are values in plain-`.ts` tests** — there's no JSX in a `.ts`
file, so `render` (and `rerender`) take two forms:

```ts
render(Counter, { props: { step: 2 }, wrapper: Providers }); // body + props option
render(createElement(Counter, { step: 2 }), { wrapper: Providers }); // RTL-style element
rerender(Counter, { props: { step: 3 } }); // symmetric with render's options
rerender({ props: { step: 3 } }); // shorthand: original component, new props
```

Same component ⇒ props update in place; a different component tears down and
remounts — exactly RTL's rerender semantics.

## Differences from react-testing-library

Octane dispatches **native, delegated DOM events — there is no synthetic event
layer**. `fireEvent` uses DOM Testing Library with focus/blur pairs for
delegation. Other helpers keep native semantics:

- **`fireEvent.change` fires a native `change`; `fireEvent.input` a native
  `input`.** In React, `onChange` handlers actually run off native `input`
  events, so RTL tests habitually drive text inputs with `fireEvent.change`.
  In octane `onChange` means the platform `change` event (fires on
  commit/blur), and `onInput` fires per keystroke — port such tests to
  `fireEvent.input` (or better, `@testing-library/user-event`, which emits
  real event sequences). Controlled components ARE supported (2026-07-08):
  a `value`/`checked` prop drives the DOM property and reasserts on every
  commit and after discrete events, exactly like React — only the synthetic
  `onChange` normalization is absent, so a controlled text input updates its
  state from `onInput`.
- **Text commit behavior is separate and intentional.** `user.type(input, text)`
  emits native `input` events; a text `onChange` does not run until the edit is
  committed, such as when `await user.tab()` blurs the field. A commit-only host
  should use `defaultValue`, native `onChange`, and
  `suppressNativeChangeWarning`. The hint only acknowledges intent; it does not
  remap or dispatch an event.
- **Checkables need click activation when activation is under test.**
  `await user.click(checkbox)` produces the native `click` → `input` → `change`
  sequence and automatic checked-state transition. `fireEvent.change(checkbox)`
  is only an explicit change dispatch; it does not model the click, activation,
  cancellation/rollback, or full event ordering.
- **Focus helpers emit both native focus events.** `fireEvent.focus` dispatches
  `focus` then `focusin`; `fireEvent.blur` dispatches `blur` then `focusout`,
  matching browser order.
  Octane's delegated `onFocus`/`onBlur` handlers receive `focusin`/`focusout`.
  Both events preserve the supplied options, including `relatedTarget`, except
  that the paired `focusin`/`focusout` always bubbles. The return value is false
  when the native `focus`/`blur` event was canceled.
  Use `user.tab()` or native `focus()`/`blur()` to move actual focus.
- **No enter/leave remapping.** `fireEvent.mouseEnter` dispatches a real
  `mouseenter`, which Octane's capture delegation delivers directly. It does
  not also dispatch `mouseover` to drive React's synthetic event plugins.
- **Every dispatch commits before returning.** The DOM library's
  `eventWrapper` runs every `fireEvent` dispatch in `flushSync` and then drains
  effects, so the event's state updates and `useEffect` cascades are visible
  before the helper returns.
- **Host elements at the root are `container.firstChild`, like RTL.**
  `render(createElement('div', …))` goes through octane's value-position
  renderer, which mounts a lone host element anchorless (the element
  self-delimits, no comment markers) — so RTL's `container.firstChild` idiom
  works as-is. Component roots (`render(App, …)`) mount their template
  directly, also without anchors.
- **`renderHook` and hook slots.** Octane hooks are keyed by compiler-assigned
  call-site slots. Hook callbacks written in your test files Just Work — the
  vite plugin's surgical pass slots base-hook calls in plain `.ts`, and
  `.tsrx`/`.tsx` hooks are fully compiled. The harness additionally runs your
  callback under a `withSlot` path, so calling a single pre-built binding hook
  (`renderHook(() => useStore(api))`) works even unslotted. A hand-written
  callback that calls **two or more base hooks directly without compilation**
  (e.g. authored outside the vite plugin) still needs explicit slot symbols:
  `useState(0, Symbol.for('a'))`.
- **Not ported** (no octane equivalent, by design): `reactStrictMode` /
  StrictMode double-render, `legacyRoot`, `onCaughtError`/`onRecoverableError`
  root options, and RTL's `configure({reactStrictMode})` wrapper —
  `configure`/`getConfig` here are dom-testing-library's own.
- `hydrate: true` adopts server-rendered DOM already inside `container` via
  octane's `hydrateRoot` (the container must hold octane SSR output).

## Test-runner setup

Like RTL, importing the package root auto-registers `afterEach(cleanup)` and
arms octane's "update was not wrapped in act(...)" warning for the run — but
only when your runner exposes **global** test hooks (vitest `globals: true`,
jest). With `globals: false`, register it yourself:

```ts
import { cleanup } from '@octanejs/testing-library';
import { afterEach } from 'vitest';
afterEach(cleanup);
```

`@octanejs/testing-library/pure` skips the side effects entirely, exactly like
`@testing-library/react/pure`.


## `@testing-library/user-event`

Works as-is — no octane adapter needed. `user-event` is framework-agnostic and
dispatches **real native events**, which is exactly octane's event model (a
better fit than React, where it relies on the synthetic layer picking natives
up). Install it alongside this package and use it unchanged; the pairing is
pinned by `tests/user-event.test.ts` (click, `type()` per-keystroke `onInput`,
text commit on `tab()`, checkbox click ordering, `keyboard()`).

## Status

Current scope, known divergences, and verification status are tracked in the
generated [bindings status table](../../docs/bindings-status.md), sourced from
this package's [`status.json`](./status.json).
