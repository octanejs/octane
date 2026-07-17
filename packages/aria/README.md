# @octanejs/aria

React Aria for the [octane](https://github.com/octanejs/octane) renderer — a
faithful port of Adobe's [React Aria](https://react-spectrum.adobe.com/react-aria/)
(`react-aria`, `react-stately`, and eventually `react-aria-components`) onto
octane's hooks and native event system.

- `@octanejs/aria` — the `react-aria` behavior-hook surface.
- `@octanejs/aria/stately` — the `react-stately` state-hook surface.
- `@octanejs/aria/components` — the `react-aria-components` surface (planned).

Ported from the pinned `adobe/react-spectrum` checkout at the commit publishing
`react-aria@3.50.0` / `react-stately@3.48.0` / `react-aria-components@1.19.0`,
and proven by differential parity: the same fixture runs through
`@octanejs/aria` and the real React packages, asserting byte-identical DOM.

Status, supported surface, and known divergences: `status.json` (rendered into
`docs/bindings-status.md`). Plan and progress: `docs/aria-migration-plan.md`.

## Notable divergences

- Octane has no synthetic `onChange`; text-input DOM wiring uses native
  `onInput` (per keystroke — the same timing React's `onChange` has for text
  inputs). React Aria's public value-level `onChange(value)` callbacks are
  unchanged.
- `forwardRef` becomes octane's ref-as-prop (React 19 style).
