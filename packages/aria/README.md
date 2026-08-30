# @octanejs/aria

React Aria for the [octane](https://github.com/octanejs/octane) renderer — a
faithful port of Adobe's [React Aria](https://react-spectrum.adobe.com/react-aria/)
(`react-aria`, `react-stately`, and `react-aria-components`) onto
octane's hooks and native event system.

## Installation

```sh
npm install @octanejs/aria
pnpm add @octanejs/aria
```

- `@octanejs/aria` — the `react-aria` behavior-hook surface.
- `@octanejs/aria/stately` — the `react-stately` state-hook surface.
- `@octanejs/aria/components` — the complete public export surface of
  `react-aria-components@1.19.0`.

Ported from the pinned `adobe/react-spectrum` checkout at commit
`1c84a49a1faf50b571c84e00bcf9c60b22ddd03e`, which publishes
`react-aria@3.50.0`, `react-stately@3.48.0`, and
`react-aria-components@1.19.0`. The components entry point has an exact checked
crosswalk: all 280 runtime exports and all 313 type exports match the pinned
package, with no missing or extra names. Existing families retain differential
tests against React; calendar/date, color, drag and drop, file, data, toast, and
layout additions have focused public-behavior coverage.

Status, supported surface, and known divergences: `status.json` (rendered into
`docs/bindings-status.md`). Source provenance and refresh instructions:
`UPSTREAM.md`.

Verify the pinned public surface with:

```bash
pnpm --filter @octanejs/aria exports:check
```

## Notable divergences

- Octane has no synthetic `onChange`; text-input DOM wiring uses native
  `onInput` (per keystroke — the same timing React's `onChange` has for text
  inputs). React Aria's public value-level `onChange(value)` callbacks are
  unchanged.
- `forwardRef` becomes octane's ref-as-prop (React 19 style).
- React Server Components are not part of the Octane binding.
