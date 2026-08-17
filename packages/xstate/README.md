# @octanejs/xstate

[XState](https://github.com/statelyai/xstate) bindings for the
[Octane](https://github.com/octanejs/octane) UI framework.

The framework-independent `xstate` actor runtime runs unchanged. This package
reimplements the `@xstate/react` 6.1 binding surface with Octane hooks and
context, so most component code only changes its binding import:

```sh
pnpm add xstate @octanejs/xstate
```

```ts
// React
import { useMachine, useSelector } from '@xstate/react';

// Octane
import { useMachine, useSelector } from '@octanejs/xstate';
```

Machines, actor logic, and actor utilities continue to come from `xstate`:

```tsx
import { createMachine } from 'xstate';
import { useMachine } from '@octanejs/xstate';

const toggleMachine = createMachine({
  initial: 'inactive',
  states: {
    inactive: { on: { toggle: 'active' } },
    active: { on: { toggle: 'inactive' } },
  },
});

function Toggle() @{
  const [snapshot, send] = useMachine(toggleMachine);
  <button onClick={() => send({ type: 'toggle' })}>{snapshot.value as string}</button>
}
```

## API

The package matches every runtime export from `@xstate/react` 6.1:

- `useActor`
- `useActorRef`
- `useMachine` (the upstream deprecated alias of `useActor`)
- `useSelector`
- `createActorContext`
- `shallowEqual`

Actor options, required input inference, selector comparators, observers,
persisted snapshots, and provided machine implementations retain the upstream
XState types and behavior.

## Server rendering

Machine and contextual snapshots render on the server. Actors start in an
effect on the client, matching the lifecycle of the upstream React binding.

## Status

Current scope and verification are tracked in the generated
[bindings status table](../../docs/bindings-status.md), sourced from this
package's [`status.json`](./status.json).
