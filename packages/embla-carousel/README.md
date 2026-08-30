# @octanejs/embla-carousel

Octane binding for `embla-carousel-react@8.6.0`. It keeps the familiar default
`useEmblaCarousel` API while reusing Embla's framework-neutral runtime.

## Installation

```sh
npm install @octanejs/embla-carousel
pnpm add @octanejs/embla-carousel
```

```tsrx
import useEmblaCarousel from '@octanejs/embla-carousel';

export function Carousel() @{
	const [viewportRef, api] = useEmblaCarousel({ loop: true });

	<section>
		<div ref={viewportRef}>
			<div>
				<div>First</div>
				<div>Second</div>
			</div>
		</div>
		<button onClick={() => api?.scrollPrev()}>Previous</button>
		<button onClick={() => api?.scrollNext()}>Next</button>
	</section>
}
```

Replace the React import:

```diff
- import useEmblaCarousel from 'embla-carousel-react';
+ import useEmblaCarousel from '@octanejs/embla-carousel';
```

The call signature, tuple result, exported types, and `globalOptions` property
match upstream. The published package has no React runtime or type dependency.

Lifecycle and option updates run against the pinned React adapter as a live
differential oracle. Real layout and pointer physics are delegated unchanged to
`embla-carousel`. The required Chromium lane verifies nonzero layout, scrolling,
selection updates, and destroy cleanup against the real core.
