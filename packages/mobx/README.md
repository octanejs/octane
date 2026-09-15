# @octanejs/mobx

MobX bindings for Octane. The package re-exports the framework-independent
`mobx` core and implements the `mobx-react-lite` function-component surface with
Octane hooks. This release targets `mobx-react-lite@5.0.3` and uses MobX 7.
If your application also imports `mobx` directly, use a compatible MobX 7 version
so both imports share one core instance.

## Installation

```sh
npm install @octanejs/mobx
pnpm add @octanejs/mobx
```

```tsrx
import { makeAutoObservable, observer } from '@octanejs/mobx';

const store = makeAutoObservable({ count: 0 });

const Counter = observer(function Counter(props: { store: typeof store }) @{
	<button onClick={() => props.store.count++}>{props.store.count as string}</button>
});
```

## Supported

- MobX core exports
- `observer`
- `useObserver`
- `Observer`
- `useLocalObservable`
- `enableStaticRendering`, `isUsingStaticRendering`, and the retained `useStaticRendering` alias
- `_observerFinalizationRegistry` and `clearTimers`

## Compatibility

This binding targets compiled Octane function components. React class
components, legacy `Provider`/`inject`, `forwardRef` compatibility options,
React-specific batching, and React DevTools integration are not included.

See [UPSTREAM.md](./UPSTREAM.md) for the pinned APIs, renderer differences,
and compatibility evidence.
