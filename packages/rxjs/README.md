# @octanejs/rxjs

[React-RxJS](https://github.com/re-rxjs/react-rxjs) bindings for
[octane](https://github.com/octanejs/octane).

## Installation

```sh
npm install @octanejs/rxjs rxjs
pnpm add @octanejs/rxjs rxjs
```

The package reuses RxJS and `@rx-state/core`, replacing only the React hook and
component layer. Most applications can migrate by changing imports:

```tsx
import { bind } from '@octanejs/rxjs';
import { interval } from 'rxjs';

const [useSeconds] = bind(interval(1000), 0);

function Clock() @{
  const seconds = useSeconds();
  <output>{seconds as any}</output>
}
```

The root entry exports the core binding API. `@octanejs/rxjs/utils` mirrors the
complete framework-neutral `@react-rxjs/utils` surface.

## Intentional differences

- A `StateObservable` is not itself a renderable JSX node. Render its value with
  `useStateObservable` or the hook returned by `bind`.
- `@react-rxjs/dom` is not ported. Its only API wraps ReactDOM's legacy
  `unstable_batchedUpdates`; octane batches observable updates natively.
- A state observable without a default value must be read inside `Subscribe`,
  matching React-RxJS's subscription ownership contract.

The implementation is based on upstream commit
`330f4c329f635c577e39655bd46c0d80a13f3a41`.
