import { Hydrate, useLayoutEffect, useState } from 'octane';
import { interaction } from 'octane/hydration';
import { Body } from './Body.tsrx';
import { History } from './History.tsrx';
import { Composer } from './Composer.tsrx';
import { recordEvaluation } from './evaluation.ts';

recordEvaluation('app');

export function App() @{
	const [ready, setReady] = useState(false);
	useLayoutEffect(() => setReady(true), []);
	<main data-bench-shell data-parent-ready={ready}>
		<h1>Conversation streaming benchmark</h1>
		<p data-public-shell>This shell and composer are public while authorization is pending.</p>
		<Hydrate independent when={interaction()}>
			<Composer />
		</Hydrate>
		<Hydrate independent when={interaction()}>
			<Body />
		</Hydrate>
		<Hydrate independent when={interaction()}>
			<History />
		</Hydrate>
	</main>
}
