# @octanejs/zag

[Zag](https://zagjs.com/) state-machine bindings for the
[Octane](https://github.com/octanejs/octane) UI framework.

## Installation

```sh
npm install @octanejs/zag
pnpm add @octanejs/zag
```

This package ports `@zag-js/react@1.42.0` onto Octane while reusing the
framework-agnostic `@zag-js/core`, `@zag-js/store`, `@zag-js/types`, and
`@zag-js/utils` packages unchanged. It is the runtime substrate for Octane
ports of component libraries built on Zag, including Ark UI and Chakra UI.

Change the framework adapter import while keeping machine definitions and
connect functions on their existing `@zag-js/*` packages:

```ts
// before
import { normalizeProps, useMachine } from '@zag-js/react';

// after
import { normalizeProps, useMachine } from '@octanejs/zag';
```

```tsx
import { normalizeProps, useMachine } from '@octanejs/zag';
import * as toggle from '@zag-js/toggle';

export function Toggle() @{
  const service = useMachine(toggle.machine, { id: 'example' });
  const api = toggle.connect(service, normalizeProps);

  <button {...api.getRootProps()}>{api.pressed ? 'On' : 'Off'}</button>
}
```

## API

The public surface matches `@zag-js/react@1.42.0`:

- `useMachine` runs a Zag machine with Octane hooks.
- `normalizeProps` types Zag-generated host props for Octane JSX.
- `Portal` renders into `document.body` or a supplied container and supports
  disabled and server-rendered in-place output.
- `mergeProps` is re-exported from `@zag-js/core`.
- `useSyncExternalStore` is re-exported from Octane.

The adapter forwards Octane's compiler-assigned hook slots through every
composed hook and through Zag's indirect `bindable` and `track` callbacks.
Distinct machines and bindable context values therefore remain independent.

## Verification

Behavioral tests cover transitions, bindable context, independent hook call
sites, multi-child portals, disabled portals, and server rendering. A
differential test runs the same machine through this package and
`@zag-js/react@1.42.0` and compares the state/context trace. Published source
and dependency checks ensure React is development-only.

Current scope and verification status are tracked in the generated
[bindings status table](../../docs/bindings-status.md), sourced from this
package's [`status.json`](./status.json).
