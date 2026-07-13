# Sonner → Octane port (`@octanejs/sonner`)

This binding is a direct Octane port of the published **`sonner@2.0.7`** source.
The pinned upstream reference is tag `v2.0.7` (commit `3ba7aa17`). It preserves
Sonner's public API and DOM/CSS contract while replacing React renderer details
with Octane's compiler and runtime.

## Scope

The port includes:

- the callable `toast()` API and `success`, `info`, `warning`, `error`,
  `loading`, `message`, `custom`, `promise`, `dismiss`, `getHistory`, and
  `getToasts` methods;
- `Toaster` and `useSonner`;
- toast updates, promise loading/success/error/finally/unwrap behavior, custom
  content, action and cancel buttons, multiple targeted toasters, and explicit
  positions;
- the upstream stack layout, measurement, visible-toast limit, timers,
  document-visibility pausing, focus/hotkey behavior, pointer swipe dismissal,
  themes, rich colors, class/style overrides, icons, and stylesheet.

## Architecture

`src/state.ts` keeps Sonner's renderer-independent observer and promise state
machine. `src/sonner.tsrx` and `src/assets.tsrx` are compiler-owned Octane
components. `src/styles.css` carries the published 2.0.7 styling contract.

The intentional renderer adaptations are small:

- React hooks, element validation, and `flushSync` use Octane equivalents.
- `forwardRef` is represented by Octane's normal `ref` prop.
- callbacks observe native DOM events, not React synthetic events.
- the document-visibility initializer checks for `document` during SSR.
- dynamic toast and position arrays use keyed `@for` blocks.

## Evidence

- Store tests cover method shape, id/update/history semantics, promise rejection,
  resolved `Error` values, extended results, and unwrap behavior.
- Component tests cover accessibility and data attributes, styles, updates,
  custom content, actions/cancel, toaster targeting, promise transitions,
  keyboard focus, and dismissal timing.
- A differential fixture runs through both `@octanejs/sonner` and real
  `sonner@2.0.7` on React; normalized DOM must remain byte-identical after
  mount, create, update, and action-toast steps.
- A server project compiles the full package graph in SSR mode and renders an
  empty accessible toaster host without browser globals. A client hydration
  test adopts that host, verifies its identity is preserved, and shows the
  first client-created toast without a mismatch.

## Follow-up

The published 2.0.7 surface is implemented. Browser-level pointer-swipe
geometry remains useful hardening work; it does not change the supported
client API.
