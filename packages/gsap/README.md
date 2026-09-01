# @octanejs/gsap

GSAP lifecycle integration for Octane. It mirrors the official `@gsap/react`
`useGSAP` contract while using compiler-selected Octane hook slots.

```bash
npm install @octanejs/gsap gsap
pnpm add @octanejs/gsap gsap
```

```tsrx
import gsap from 'gsap';
import { useGSAP } from '@octanejs/gsap';
import { useRef } from 'octane';

function AnimatedCard() @{
	const scope = useRef<HTMLDivElement>(null);
	const { contextSafe } = useGSAP(
		() => {
			gsap.from('.card', { y: 24, opacity: 0, stagger: 0.08 });
		},
		{ scope },
	);

	const pulse = contextSafe(() => {
		gsap.to('.card', { scale: 1.05, yoyo: true, repeat: 1 });
	});

	<div ref={scope}>
		<button onClick={pulse}>Pulse</button>
		<div class="card">Scoped animation</div>
	</div>
}
```

## Contract

`useGSAP` accepts the same callback, dependency-array, and config forms as
`@gsap/react` 2.1.2. Config supports `scope`, `dependencies`, and
`revertOnUpdate`. The returned `context` and `contextSafe` identities remain
stable for the component lifetime, and GSAP context cleanup runs on dependency
replacement and unmount.

`useGSAP.register(gsapInstance)` selects a GSAP instance explicitly.
`useGSAP.headless` is `true`, matching the upstream package contract.

## SSR

Server rendering returns stable context helpers but does not execute animation
effects. Hydration activates the normal client lifecycle.

## Licensing

This adapter is independently authored and MIT licensed. GSAP is a peer
dependency and is not copied or redistributed here. GSAP uses its own
no-charge license; review the [GSAP licensing terms](https://gsap.com/licensing/)
for your use case.
