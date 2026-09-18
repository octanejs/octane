# @octanejs/grab

Element-grabbing overlay for Octane apps: hold a hotkey, click any element, and copy a structured context payload (component stack, source location, bounding box, snippet) for an agent or tool. Ported from `react-grab` 0.2.0.

## Installation

```sh
npm install @octanejs/grab
pnpm add @octanejs/grab
```

## Usage

```ts
import { init } from '@octanejs/grab';

const api = init();
```

`init()` mounts the overlay (shadow-DOM canvas + toolbar) and returns the `ReactGrabAPI`: `activate`, `deactivate`, `setEnabled`, `copyElement`, `comment`, `getStack`, `getSource`, `registerPlugin`, `dispose`, and state getters. Importing the package auto-inits in the browser unless `window.__REACT_GRAB_DISABLED__` is set; use `init({ enabled: false })` for an inert handle.

```ts
import { commentPlugin, openPlugin, generateSnippet } from '@octanejs/grab';
```

## Entry points

| Import | Surface |
| --- | --- |
| `@octanejs/grab` | `init`, plugins, errors, `generateSnippet`, global API (`getGlobalApi`, `setGlobalApi`, `registerPlugin`, `unregisterPlugin`), all option/state/theme types |
| `@octanejs/grab/core` | Core runtime: `init`, `getStack`, `formatElementInfo`, `isInstrumentationActive`, `DEFAULT_THEME`, `copyContent` |
| `@octanejs/grab/primitives` | Headless primitives: `copyContent`, `disposeBaselineStyles`, error classes, stack/element types |

## Octane port notes

- Component ancestry resolves through Octane scopes instead of React fibers; the `bippy` bridge is a clean-room reimplementation (`src/bippy/`).
- `options.freezeReactUpdates` freezes Octane updates; the option name is retained for API parity.
- `./styles.css` ships as authored source consumed by the overlay; it is not a JS module entry.

See [UPSTREAM.md](./UPSTREAM.md) for the immutable source pin, API crosswalk, test adaptation, and recorded evidence.
