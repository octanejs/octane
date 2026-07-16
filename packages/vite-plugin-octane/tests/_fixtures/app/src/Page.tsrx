import { use, useState } from 'octane';
import { RpcProbe } from './Rpc.tsx';
import { Canvas } from '@fixture/object-canvas';
import { Scene } from './Scene.object.tsrx';

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

// A page with a dynamic text hole, a param read, and an event handler — enough
// to prove the server bundle renders hydratable markup (markers + scoped
// state) identical to dev SSR.
export function Page(props: { params: Record<string, string>; url: string }) @{
	const [count, setCount] = useState(1);
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
		<button onClick={() => fixtureRpc('browser')}>Call server</button>
		<RpcProbe />
		<Canvas>
			<Scene />
		</Canvas>
	</main>
}
