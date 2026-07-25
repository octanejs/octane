// A small interactive app that exercises useState, useReducer, useTransition, and
// two Suspense boundaries, with the Octane DevTools panel mounted alongside it (dev
// only) so every panel tab has live data to show.
import { Suspense, use, useMemo, useReducer, useState, useTransition } from 'octane';
import type { OctaneNode } from 'octane';
import { TanStackDevtools } from '@octanejs/tanstack-devtools';
import { octaneDevtools } from '@octanejs/devtools';

function makeDelayed(label: string, ms: number): Promise<string> {
	return new Promise((resolve) => setTimeout(() => resolve(label), ms));
}

// Created once at module scope — OUTSIDE any render — so identity is stable across
// every SSR render pass and client hydration. A promise created during render (even
// via useMemo) can be handed a fresh identity on an SSR replay pass, so the boundary
// can never resolve by identity. Octane seeds the resolved value for hydration, so
// the client adopts the server result instead of re-waiting.
const boundaryAPromise = makeDelayed('boundary A loaded', 400);
const boundaryBPromise = makeDelayed('boundary B loaded', 800);

function Slow(props: { label: string }): OctaneNode {
	// Intentionally-slow render so the Profiler / Performance tabs show it. Kept
	// short so SSR (and a page rendering many of these) still completes quickly.
	const start = Date.now();
	while (Date.now() - start < 2) {
		/* busy-wait ~2ms to register as a slow component */
	}
	return <li>{props.label}</li>;
}

function AsyncChild(props: { promise: Promise<string> }): OctaneNode {
	const value = use(props.promise);
	return <strong>{value as string}</strong>;
}

function Counter(): OctaneNode @{
	const [count, setCount] = useState(0);
	const [total, dispatch] = useReducer((n: number, delta: number) => n + delta, 0);
	<div>
		<button onClick={() => setCount(count + 1)}>{'count: ' + count as string}</button>
		<button onClick={() => dispatch(5)}>{'total += 5 (' + total + ')' as string}</button>
	</div>
}

function FilterList(): OctaneNode @{
	const [pending, startTransition] = useTransition();
	const [query, setQuery] = useState('');
	const items = useMemo(() => Array.from({ length: 200 }, (_, i) => `Item ${i}`), []);
	const shown = items.filter((item) => item.includes(query));
	<div>
		<input
			value={query}
			onInput={(event: Event) => {
				const value = (event.currentTarget as HTMLInputElement).value;
				startTransition(() => setQuery(value));
			}}
		/>
		<span>
			{pending ? ' (filtering…)' : ''}
		</span>
		<ul>
			@for (const item of shown.slice(0, 20); key item) {
				<Slow label={item} />
			}
		</ul>
	</div>
}

export function DevtoolsDemo(): OctaneNode @{
	const showDevtools = import.meta.env.DEV;
	<main style={{ padding: '1rem' }}>
		<h1>Octane DevTools demo</h1>
		<p>Open the Octane panel (bottom corner) and explore the four tabs.</p>
		<Counter />
		<FilterList />
		<Suspense fallback={<em>loading A…</em>}>
			<AsyncChild promise={boundaryAPromise} />
		</Suspense>
		<Suspense fallback={<em>loading B…</em>}>
			<AsyncChild promise={boundaryBPromise} />
		</Suspense>
		@if (showDevtools) {
			<TanStackDevtools plugins={[octaneDevtools()]} />
		}
	</main>
}
