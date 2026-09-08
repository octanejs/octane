# @octanejs/intersection-observer

An Octane binding for [`react-intersection-observer`](https://github.com/thebuilder/react-intersection-observer), pinned to version 10.1.0.

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
