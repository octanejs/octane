import { use, useState } from 'octane';
import { RpcProbe } from './Rpc.tsx';

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
	const [count] = useState(1);
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
		<button onClick={() => fixtureRpc('browser')}>Call server</button>
		<RpcProbe />
	</main>
}
