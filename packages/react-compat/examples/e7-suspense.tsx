// E7 — Suspense + use(promise). The async shape (the react-query / data-loader
// pattern): a component `use()`s a thrown-and-cached promise; a Suspense
// boundary shows a fallback until it resolves, then reveals. Exercises Octane's
// throw-to-suspend + reveal with no code rewrite — `Suspense`/`use` are both
// `status: same`, re-homed to the compat shim.
import { Suspense, use } from 'react';

function Content(props: { resource: Promise<string> }) {
	const value = use(props.resource);
	return <span className="data">{value}</span>;
}

export function App(props: { resource: Promise<string> }) {
	return (
		<Suspense fallback={<span className="loading">loading…</span>}>
			<Content resource={props.resource} />
		</Suspense>
	);
}
