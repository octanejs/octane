# @octanejs/auto-animate

Octane binding for [`@formkit/auto-animate@0.10.0`](https://github.com/formkit/auto-animate). The vanilla `autoAnimate` core is reused unchanged. The React hook is ported at `@octanejs/auto-animate/react`.

For vanilla APIs, import directly from `@formkit/auto-animate`. Use `@octanejs/auto-animate/react` when animation setup and cleanup should follow an Octane component's lifecycle. The existing vanilla re-exports from `@octanejs/auto-animate` remain supported.

## Installation

```sh
npm install @octanejs/auto-animate
pnpm add @octanejs/auto-animate
```

```tsrx
import { useAutoAnimate } from '@octanejs/auto-animate/react';

export function List(props: { items: string[] }) @{
	const [parent] = useAutoAnimate();
	<ul ref={parent}>
		@for (const item of props.items; key item) {
			<li>{item}</li>
		}
	</ul>
}
```

Vue, Preact, Solid, Angular, Nuxt, Marko, and Qwik entry points are not part of this binding. See [UPSTREAM.md](./UPSTREAM.md).
