# @octanejs/usehooks-ts

An evidence-scoped Octane port of the host-safe `usehooks-ts@3.1.1` hook cohort.
Change supported imports from `usehooks-ts` to `@octanejs/usehooks-ts`.

## Installation

```sh
npm install @octanejs/usehooks-ts
pnpm add @octanejs/usehooks-ts
```

```ts
import { useBoolean, useDebounceValue, useInterval } from '@octanejs/usehooks-ts';
```

## Supported

- State: `useBoolean`, `useCounter`, `useToggle`, `useMap`, `useStep`
- Timing: `useDebounceCallback`, `useDebounceValue`, `useInterval`, `useTimeout`
- Lifecycle: `useIsMounted`, `useUnmount`

Names, argument defaults, return shapes, cleanup, and public types follow
`usehooks-ts@3.1.1`. Hook call sites are independently keyed by Octane's compiler,
including calls where optional trailing arguments are omitted.

## Deferred

Storage and media hooks are deferred until their browser-event and
`initializeWithValue: false` SSR/hydration contracts have dedicated deterministic
proof. DOM observer, measurement, document/window event, script injection,
scroll-lock, clipboard, and direct-element hooks are not exported. There are no
silent stubs.

The pinned upstream source and exact excluded inventory are recorded in
`status.json`. Both projects are MIT licensed.
