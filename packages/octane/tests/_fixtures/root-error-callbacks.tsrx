// Fixtures for the React 19 root error-callback options (onCaughtError /
// onUncaughtError on createRoot/hydrateRoot). Each host pairs a thrower with
// (or without) a boundary so the tests can drive both report channels through
// the render and passive-effect paths.
import { ErrorBoundary, useEffect, useState } from 'octane';

let bumpRender: (() => void) | null = null;
export function triggerRenderThrow(): void {
	bumpRender!();
}

function RenderThrower() @{
	const [bang, setBang] = useState(false);
	bumpRender = () => setBang(true);
	if (bang) {
		throw new Error('render-boom');
	}
	<span id="ok">ok</span>
}

export function CaughtHost() @{
	<ErrorBoundary fallback={(e) => 'caught:' + (e as Error).message}>
		<RenderThrower />
	</ErrorBoundary>
}

export function UncaughtHost() @{
	<main>
		<RenderThrower />
	</main>
}

// Throws during the FIRST render — exercises the synchronous initial-mount
// error path (the first root.render() mounts synchronously in Octane) and the
// hydration render path, both of which must honor onUncaughtError.
export function MountThrower() @{
	{
		throwOnMount() as string;
	}
}

function throwOnMount(): string {
	throw new Error('mount-boom');
}

// Interactive recovery probe: a recovered root must keep its container's event
// delegation, so a click on freshly rendered content still reaches handlers.
export function ClickCounter() @{
	const [n, setN] = useState(0);
	<button id="counter" onClick={() => setN(n + 1)}>{'n:' + n}</button>
}

let bumpEffect: (() => void) | null = null;
export function triggerEffectThrow(): void {
	bumpEffect!();
}

function EffectThrower() @{
	const [bang, setBang] = useState(false);
	bumpEffect = () => setBang(true);
	useEffect(() => {
		if (bang) {
			throw new Error('effect-boom');
		}
	}, [bang]);
	<span id="eok">eok</span>
}

export function CaughtEffectHost() @{
	<ErrorBoundary fallback="effect-caught">
		<EffectThrower />
	</ErrorBoundary>
}

export function UncaughtEffectHost() @{
	<main>
		<EffectThrower />
	</main>
}
