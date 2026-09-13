# @octanejs/grab

Select context for coding agents directly from your Octane website. This is an
API-compatible port of [`react-grab@0.2.0`](https://github.com/aidenybai/react-grab)
that replaces React Fiber inspection (`bippy`) with Octane's `octane/inspect`
adapter and renders the overlay UI with Octane (`createRoot({ inspect: false })`
so grab chrome never appears in owner stacks).

## Installation

```sh
npm install @octanejs/grab octane @react-grab/cli
```

```sh
pnpm add @octanejs/grab octane @react-grab/cli
```

## Usage

```ts
import { init } from '@octanejs/grab';
import '@octanejs/grab/styles.css';

const api = init();
// Prefer the Octane global; `__REACT_GRAB__` remains as a compatibility alias.
```

Mark app subtrees as non-grabbable with `data-react-grab-ignore`. Grab's own
overlay host (`data-react-grab`) is never selectable.

Primitives such as `isElementGrabbable`, `freeze`, and `unfreeze` are available
from `@octanejs/grab/primitives`.

See `UPSTREAM.md` for the export crosswalk, license boundary, and known gaps
(CLI bin packaging, Next/R3F-specific paths).
