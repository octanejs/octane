# @octanejs/intersection-observer

An Octane binding for [`react-intersection-observer`](https://github.com/thebuilder/react-intersection-observer), pinned to version 11.0.1.

## Installation

```sh
npm install @octanejs/intersection-observer
pnpm add @octanejs/intersection-observer
```

```tsrx
import { useInView } from '@octanejs/intersection-observer';

export function LazySection() @{
	const { ref, inView } = useInView({ threshold: 0.5 });
	<section ref={ref}>{inView ? 'Visible' : 'Keep scrolling'}</section>
}
```

Exports `useInView`, `useOnInView`, `InView`, `observe`, `defaultFallbackInView`, and the upstream-compatible public types.

For `InView`'s render-prop form in `.tsrx`, use `children={({ inView, ref }) => ...}`. Nested TSRX children compile to an opaque render block and are reserved for the plain-child wrapper form.

`useInView` and `useOnInView<TElement>` return callback refs with cleanup functions.
The effect hook preserves the target element type in `entry.target`. Replacing a
target or observation options releases the previous observation, and cleanup is
idempotent even when the same callback has multiple registrations.

`initialInView` provides the server snapshot. Observation starts on client commit;
hydration adopts the server element and unmount releases its observer.
