# @octanejs/signals-react

Octane binding for [`@preact/signals-react@3.12.0`](https://github.com/preactjs/signals). The framework-neutral `@preact/signals-core` runtime is reused.

## Installation

```sh
npm install @octanejs/signals-react
pnpm add @octanejs/signals-react
```

```ts
import { signal } from '@octanejs/signals-react';
import { useSignals } from '@octanejs/signals-react/runtime';
import { Show } from '@octanejs/signals-react/utils';

const count = signal(0);

export function Counter() {
  useSignals();
  return count.value;
}
```

`wrapJsx` and Signal-as-JSX-text are not available. Call `useSignals()` in components that read signals during render, and read `.value` instead of putting a `Signal` in a child hole. See [UPSTREAM.md](./UPSTREAM.md).
