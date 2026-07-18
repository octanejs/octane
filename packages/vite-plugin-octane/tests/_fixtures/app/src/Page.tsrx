import { Hydrate, use, useEffect, useState } from 'octane';
import { interaction, load, media } from 'octane/hydration';
import { RpcProbe } from './Rpc.tsx';
import { Canvas } from '@fixture/object-canvas';
import { Scene } from './Scene.object.tsrx';
import { DeferredHydrationProof } from './deferred-hydration.tsrx';
import { PrefetchedHydrationProof } from './prefetched-hydration.tsrx';
import { GuardedConst } from './GuardedConst.tsrx';

export const fixturePageModuleState = { rendered: false };

module server {
	export async function fixtureRpc(value: string) {
		return 'rpc:' + value;
	}
}

import { fixtureRpc } from 'server';

let pendingFixture: Promise<string> | undefined;
function loadPendingFixture() {
	return pendingFixture ??= new Promise((resolve) => setTimeout(() => resolve('ready'), 10));
}

function UnsplitHydrationProof() @{
	const [active, setActive] = useState(false);
	const [clicks, setClicks] = useState(0);
	useEffect(() => {
		setActive(true);
	}, []);
	<button
		class="vite-unsplit-hydration-proof"
		data-active={active ? 'true' : 'false'}
		data-clicks={String(clicks)}
		onClick={() => setClicks((count) => count + 1)}
	>
		vite-unsplit-hydration-proof
	</button>
}

// A page with a dynamic text hole, a param read, and an event handler — enough
// to prove the server bundle renders hydratable markup (markers + scoped
// state) identical to dev SSR.
export function Page(props: { params: Record<string, string>; url: string }) @{
	const [count, setCount] = useState(1);
	const [guardedVisible, setGuardedVisible] = useState(true);
	fixturePageModuleState.rendered = true;
	if (props.params.slug === 'error') {
		throw new Error('fixture root boundary');
	}
	if (props.params.slug === 'pending') {
		use(loadPendingFixture());
	}
	<main>
		<h1>
			{'Fixture page ' + (props.params.slug ?? 'home')}
		</h1>
		<p class="url">{props.url}</p>
		<p class="count">
			{'Count: ' + count}
		</p>
		<button onClick={() => setCount((current) => current + 1)}>Increment fixture</button>
		<button onClick={() => setGuardedVisible((visible) => !visible)}>
			Toggle guarded const
		</button>
		<GuardedConst visible={guardedVisible} />
		<button onClick={() => fixtureRpc('browser')}>Call server</button>
		<RpcProbe />
		<Canvas>
			<Scene />
		</Canvas>
		<Hydrate when={interaction({ events: 'click' })}>
			<DeferredHydrationProof />
		</Hydrate>
		<Hydrate when={media('(min-width: 2000px)')} prefetch={load()}>
			<PrefetchedHydrationProof />
		</Hydrate>
		<Hydrate when={media('(min-width: 2100px)')} split={false}>
			<UnsplitHydrationProof />
		</Hydrate>
	</main>
}
