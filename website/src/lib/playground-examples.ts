// Curated playground examples. Every source here compiles warning-free
// through the real pipeline (playground-modules.ts) — enforced by
// tests/playground-examples.test.ts — so keep new examples runnable and
// minimal: each demonstrates one API surface, not a whole app.
//
// File kinds are derived from the file name (see playground-modules.ts):
// `.tsrx` / `.tsx` compile with the octane compiler; `.react.tsx` marks a
// React-HOST file (sucrase react-jsx transform) used by the OctaneCompat
// example, where real react-dom from esm.sh renders the entry.
import type { PlaygroundLang } from './playground.ts';
import type { PlaygroundFile } from './playground-modules.ts';

export interface ExampleWorkspace {
	files: PlaygroundFile[];
	/** Module the sandbox imports and renders. Defaults to the first file. */
	entry: string;
}

export interface PlaygroundExample {
	id: string;
	label: string;
	/** Dropdown <optgroup> label. */
	group: string;
	variants: Partial<Record<PlaygroundLang, ExampleWorkspace>>;
}

function workspace(files: PlaygroundFile[], entry = files[0].name): ExampleWorkspace {
	return { files, entry };
}

// ── Basics ──────────────────────────────────────────────────────────────────

const COUNTER_TSRX = `import { useState } from 'octane';

export default function App() @{
	const [count, setCount] = useState(0);
	const [items, setItems] = useState<string[]>([]);

	const addItem = () => {
		setItems([...items, 'Item #' + (items.length + 1)]);
	};

	<div class="demo">
		<h2>{'Count: ' + count}</h2>

		<button onClick={() => setCount(count + 1)}>Increment</button>
		<button onClick={addItem}>Add item</button>

		@if (count >= 5) {
			<p class="hot">Count is heating up!</p>
		}

		<ul>
			@for (const item of items; key item) {
				<li>{item}</li>
			} @empty {
				<li class="empty">No items yet — add one.</li>
			}
		</ul>

		<style>
			.demo {
				display: grid;
				gap: 0.5rem;
				justify-items: start;
			}
			button {
				padding: 0.4rem 0.9rem;
				border-radius: 8px;
				border: 1px solid #8886;
				background: transparent;
				color: inherit;
				cursor: pointer;
			}
			.hot {
				color: #ff5d72;
			}
			.empty {
				opacity: 0.6;
			}
		</style>
	</div>
}
`;

const COUNTER_TSX = `import { useState } from 'octane';

export default function App() {
	const [count, setCount] = useState(0);
	const [items, setItems] = useState<string[]>([]);

	const addItem = () => {
		setItems([...items, 'Item #' + (items.length + 1)]);
	};

	return (
		<div style={{ display: 'grid', gap: '0.5rem', justifyItems: 'start' }}>
			<h2>{'Count: ' + count}</h2>

			<button onClick={() => setCount(count + 1)}>Increment</button>
			<button onClick={addItem}>Add item</button>

			{count >= 5 ? <p style={{ color: '#ff5d72' }}>Count is heating up!</p> : null}

			<ul>
				{items.map((item) => (
					<li key={item}>{item}</li>
				))}
			</ul>
		</div>
	);
}
`;

const LIST_TSRX = `import { useState } from 'octane';

// Keyed @for reconciliation — rows keep their DOM identity across
// prepends, appends, and reorders; @empty renders when the list is empty.
export default function App() @{
	const [items, setItems] = useState([
		{ id: 1, label: 'apple' },
		{ id: 2, label: 'banana' },
		{ id: 3, label: 'cherry' },
	]);
	const [nextId, setNextId] = useState(4);

	const add = (position: 'start' | 'end') => {
		const item = { id: nextId, label: 'item ' + nextId };
		setNextId(nextId + 1);
		setItems(position === 'start' ? [item, ...items] : [...items, item]);
	};

	<div class="demo">
		<div class="row">
			<button onClick={() => add('start')}>Prepend</button>
			<button onClick={() => add('end')}>Append</button>
			<button onClick={() => setItems([...items].reverse())}>Reverse</button>
			<button onClick={() => setItems([])}>Clear</button>
		</div>

		<ul>
			@for (const item of items; key item.id) {
				<li>
					{item.label as string}
					<button onClick={() => setItems(items.filter((x) => x.id !== item.id))}>
						×
					</button>
				</li>
			} @empty {
				<li class="empty">Empty — add an item above.</li>
			}
		</ul>

		<style>
			.demo {
				display: grid;
				gap: 0.75rem;
			}
			.row {
				display: flex;
				gap: 0.5rem;
			}
			button {
				padding: 0.3rem 0.7rem;
				border-radius: 6px;
				border: 1px solid #8886;
				background: transparent;
				color: inherit;
				cursor: pointer;
			}
			li {
				display: flex;
				align-items: center;
				gap: 0.5rem;
				padding: 0.2rem 0;
			}
			.empty {
				opacity: 0.6;
			}
		</style>
	</div>
}
`;

const LIST_TSX = `import { useState } from 'octane';

// The same keyed list in React-style TSX — .map() with key props instead
// of the @for directive. Both dialects compile to the same runtime.
export default function App() {
	const [items, setItems] = useState([
		{ id: 1, label: 'apple' },
		{ id: 2, label: 'banana' },
		{ id: 3, label: 'cherry' },
	]);
	const [nextId, setNextId] = useState(4);

	const add = (position: 'start' | 'end') => {
		const item = { id: nextId, label: 'item ' + nextId };
		setNextId(nextId + 1);
		setItems(position === 'start' ? [item, ...items] : [...items, item]);
	};

	return (
		<div style={{ display: 'grid', gap: '0.75rem' }}>
			<div style={{ display: 'flex', gap: '0.5rem' }}>
				<button onClick={() => add('start')}>Prepend</button>
				<button onClick={() => add('end')}>Append</button>
				<button onClick={() => setItems([...items].reverse())}>Reverse</button>
				<button onClick={() => setItems([])}>Clear</button>
			</div>

			<ul>
				{items.length === 0 ? (
					<li style={{ opacity: 0.6 }}>Empty — add an item above.</li>
				) : (
					items.map((item) => (
						<li key={item.id}>
							{item.label}
							<button onClick={() => setItems(items.filter((x) => x.id !== item.id))}>
								×
							</button>
						</li>
					))
				)}
			</ul>
		</div>
	);
}
`;

const INPUTS_TSRX = `import { useState } from 'octane';

// Controlled inputs on NATIVE events: onInput fires per keystroke for text
// controls (there is no synthetic onChange layer), while selects and
// checkboxes use the platform's own change event. The @switch directive
// renders one case per discriminant value.
export default function App() @{
	const [name, setName] = useState('world');
	const [kind, setKind] = useState('plain');
	const [loud, setLoud] = useState(false);

	<div class="demo">
		<div class="row">
			<input value={name} onInput={(e) => setName(e.currentTarget.value)} />

			<select value={kind} onChange={(e) => setKind(e.currentTarget.value)}>
				<option value="plain">plain</option>
				<option value="shout">shout</option>
				<option value="whisper">whisper</option>
			</select>

			<label class="row">
				<input
					type="checkbox"
					checked={loud}
					onChange={(e) => setLoud(e.currentTarget.checked)}
				/>
				extra loud
			</label>
		</div>

		<div class="panel">
			@switch (kind) {
				@case 'plain': {
					<p>{'hello, ' + name}</p>
				}
				@case 'shout': {
					<p class="shout">{'HELLO, ' + name.toUpperCase() + (loud ? '!!!' : '!')}</p>
				}
				@case 'whisper': {
					<p class="whisper">{'hello, ' + name.toLowerCase() + '…'}</p>
				}
				@default: {
					<p>(unknown kind)</p>
				}
			}
		</div>

		<style>
			.demo {
				display: grid;
				gap: 0.75rem;
			}
			.row {
				display: flex;
				gap: 0.5rem;
				align-items: center;
			}
			input,
			select {
				padding: 0.3rem 0.5rem;
				border-radius: 6px;
				border: 1px solid #8886;
				background: transparent;
				color: inherit;
			}
			.panel {
				padding: 0.75rem;
				border: 1px solid #8884;
				border-radius: 8px;
			}
			.shout {
				font-weight: 700;
			}
			.whisper {
				opacity: 0.6;
				font-style: italic;
			}
		</style>
	</div>
}
`;

// ── State & context ─────────────────────────────────────────────────────────

const BRANCH_HOOKS_TSRX = `import { useState } from 'octane';

// Octane has no rules of hooks: hooks are keyed by call SITE, not call
// order, so useState may live inside an @if branch. The branch-local
// counter resets every time the branch unmounts — collapse and re-expand
// to watch it happen. (React cannot express this.)
export default function App() @{
	const [open, setOpen] = useState(true);

	<div class="demo">
		<button onClick={() => setOpen(!open)}>
			{(open ? 'Collapse' : 'Expand') as string}
		</button>

		@if (open) {
			const [bumps, setBumps] = useState(0);

			<div class="panel">
				<p>{'Branch-local bumps: ' + bumps}</p>
				<button onClick={() => setBumps(bumps + 1)}>Bump</button>
			</div>
		} @else {
			<p class="hint">Collapsed — re-expand and the inner counter starts fresh.</p>
		}

		<style>
			.demo {
				display: grid;
				gap: 0.75rem;
				justify-items: start;
			}
			button {
				padding: 0.4rem 0.9rem;
				border-radius: 8px;
				border: 1px solid #8886;
				background: transparent;
				color: inherit;
				cursor: pointer;
			}
			.panel {
				padding: 0.75rem;
				border: 1px solid #8884;
				border-radius: 8px;
				display: grid;
				gap: 0.5rem;
				justify-items: start;
			}
			.hint {
				opacity: 0.6;
			}
		</style>
	</div>
}
`;

const CONTEXT_TSRX = `import { createContext, use, useState } from 'octane';

const Theme = createContext('light');

// use(Theme) reads the closest provider. Unlike other hooks, use() may sit
// anywhere — even behind conditions — because context is identity-keyed.
function ThemeCard() @{
	const theme = use(Theme);

	<div class={'card ' + theme}>
		<p>{'The current theme is ' + theme + '.'}</p>
	</div>
}

export default function App() @{
	const [theme, setTheme] = useState('light');

	<div class="demo">
		<button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
			Switch theme
		</button>

		<Theme.Provider value={theme}>
			<ThemeCard />
		</Theme.Provider>

		<ThemeCard />
		<p class="hint">The second card sits outside the provider, so it sees the fallback.</p>

		<style>
			.demo {
				display: grid;
				gap: 0.75rem;
				justify-items: start;
			}
			button {
				padding: 0.4rem 0.9rem;
				border-radius: 8px;
				border: 1px solid #8886;
				background: transparent;
				color: inherit;
				cursor: pointer;
			}
			.card {
				padding: 0.75rem 1rem;
				border-radius: 8px;
				border: 1px solid #8884;
			}
			.card.dark {
				background: #101318;
				color: #f4eee8;
			}
			.card.light {
				background: #f6f2ea;
				color: #1c1b18;
			}
			.hint {
				opacity: 0.6;
			}
		</style>
	</div>
}
`;

const CONTEXT_TSX = `import { createContext, use, useState } from 'octane';

const Theme = createContext('light');

function ThemeCard() {
	const theme = use(Theme);

	return (
		<div
			style={{
				padding: '0.75rem 1rem',
				borderRadius: '8px',
				border: '1px solid #8884',
				background: theme === 'dark' ? '#101318' : '#f6f2ea',
				color: theme === 'dark' ? '#f4eee8' : '#1c1b18',
			}}
		>
			<p>{'The current theme is ' + theme + '.'}</p>
		</div>
	);
}

export default function App() {
	const [theme, setTheme] = useState('light');

	return (
		<div style={{ display: 'grid', gap: '0.75rem', justifyItems: 'start' }}>
			<button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
				Switch theme
			</button>

			<Theme.Provider value={theme}>
				<ThemeCard />
			</Theme.Provider>

			<ThemeCard />
			<p style={{ opacity: 0.6 }}>
				The second card sits outside the provider, so it sees the fallback.
			</p>
		</div>
	);
}
`;

const PORTAL_TSRX = `import { createPortal, useState } from 'octane';

// createPortal(Component, target, props) renders into another DOM subtree
// — here document.body — while events still bubble through the COMPONENT
// tree, so the demo's own handlers see clicks from inside the toast.
function Toast(props: { onDismiss: () => void }) @{
	<aside class="toast" role="status">
		<p>Draft saved.</p>
		<button onClick={props.onDismiss}>Dismiss</button>

		<style>
			.toast {
				position: fixed;
				right: 1rem;
				bottom: 1rem;
				display: flex;
				gap: 0.75rem;
				align-items: center;
				padding: 0.6rem 0.9rem;
				border-radius: 10px;
				border: 1px solid #8886;
				background: #22262e;
				color: #f4eee8;
				box-shadow: 0 8px 24px #0006;
			}
			button {
				padding: 0.25rem 0.6rem;
				border-radius: 6px;
				border: 1px solid #8886;
				background: transparent;
				color: inherit;
				cursor: pointer;
			}
		</style>
	</aside>
}

export default function App() @{
	const [toastOpen, setToastOpen] = useState(false);

	<div class="demo">
		<button onClick={() => setToastOpen(true)}>Save draft</button>

		@if (toastOpen) {
			{createPortal(Toast, document.body, { onDismiss: () => setToastOpen(false) })}
		}

		<p class="hint">
			The toast mounts at the end of document.body — inspect the preview to see it
			escape this component's DOM.
		</p>

		<style>
			.demo {
				display: grid;
				gap: 0.75rem;
				justify-items: start;
			}
			button {
				padding: 0.4rem 0.9rem;
				border-radius: 8px;
				border: 1px solid #8886;
				background: transparent;
				color: inherit;
				cursor: pointer;
			}
			.hint {
				opacity: 0.6;
			}
		</style>
	</div>
}
`;

const DYNAMIC_TSRX = `import { useState } from 'octane';

// <{expr}> renders a component chosen from an expression. Swapping the
// expression remounts just that slot's subtree — the parent never
// re-renders.
function Red(props: { label: string }) @{
	<span class="chip red">{'red: ' + props.label}</span>
}

function Blue(props: { label: string }) @{
	<span class="chip blue">{'blue: ' + props.label}</span>
}

function Green(props: { label: string }) @{
	<span class="chip green">{'green: ' + props.label}</span>
}

const CHIPS = { red: Red, blue: Blue, green: Green };

export default function App() @{
	const [which, setWhich] = useState<keyof typeof CHIPS>('red');
	const Chip = CHIPS[which];

	<div class="demo">
		<div class="row">
			<button onClick={() => setWhich('red')}>red</button>
			<button onClick={() => setWhich('blue')}>blue</button>
			<button onClick={() => setWhich('green')}>green</button>
		</div>

		<div class="panel">
			<{Chip} label="live swap" />
		</div>

		<style>
			.demo {
				display: grid;
				gap: 0.75rem;
				justify-items: start;
			}
			.row {
				display: flex;
				gap: 0.5rem;
			}
			button {
				padding: 0.3rem 0.7rem;
				border-radius: 6px;
				border: 1px solid #8886;
				background: transparent;
				color: inherit;
				cursor: pointer;
			}
			.panel {
				padding: 0.75rem;
				border: 1px solid #8884;
				border-radius: 8px;
			}
			.chip {
				padding: 0.35rem 0.75rem;
				border-radius: 6px;
			}
			.red {
				background: #fee2e2;
				color: #991b1b;
			}
			.blue {
				background: #dbeafe;
				color: #1e40af;
			}
			.green {
				background: #d1fae5;
				color: #065f46;
			}
		</style>
	</div>
}
`;

// ── Async & Suspense ────────────────────────────────────────────────────────

const SUSPENSE_TSRX = `import { useState, use } from 'octane';

// @try / @pending / @catch is TSRX's Suspense surface. use() suspends the
// boundary until the promise settles; a rejection routes to @catch, whose
// reset() clears the boundary and re-runs the body.
function fakeFetch(shouldFail: boolean, attempt: number) {
	return new Promise<string>((resolve, reject) => {
		setTimeout(() => {
			if (shouldFail) reject(new Error('simulated fetch failure'));
			else resolve('response #' + attempt + ': shipping is the feature');
		}, 800);
	});
}

function Quote(props: { promise: Promise<string> }) @{
	const quote = use(props.promise);

	<p class="quote">{'“' + quote + '”'}</p>
}

export default function App() @{
	const [attempt, setAttempt] = useState(1);
	const [shouldFail, setShouldFail] = useState(false);

	const promise = fakeFetch(shouldFail, attempt);

	<div class="demo">
		<div class="row">
			<button onClick={() => setAttempt(attempt + 1)}>Refetch</button>
			<label class="row">
				<input
					type="checkbox"
					checked={shouldFail}
					onChange={(e) => setShouldFail(e.currentTarget.checked)}
				/>
				simulate failure
			</label>
		</div>

		<div class="panel">
			@try {
				<Quote promise={promise} />
			} @pending {
				<p class="hint">loading…</p>
			} @catch (err, reset) {
				<>
					<p class="boom">{err.message as string}</p>
					<button
						onClick={() => {
							setShouldFail(false);
							reset();
						}}
					>
						Reset
					</button>
				</>
			}
		</div>

		<style>
			.demo {
				display: grid;
				gap: 0.75rem;
			}
			.row {
				display: flex;
				gap: 0.5rem;
				align-items: center;
			}
			button {
				padding: 0.3rem 0.7rem;
				border-radius: 6px;
				border: 1px solid #8886;
				background: transparent;
				color: inherit;
				cursor: pointer;
			}
			.panel {
				padding: 0.75rem;
				border: 1px solid #8884;
				border-radius: 8px;
				display: grid;
				gap: 0.5rem;
				justify-items: start;
			}
			.quote {
				margin: 0;
			}
			.hint {
				opacity: 0.6;
				margin: 0;
			}
			.boom {
				color: #ff5d72;
				margin: 0;
			}
		</style>
	</div>
}
`;

const SUSPENSE_TSX = `import { useState, use, Suspense, ErrorBoundary } from 'octane';

// The same boundary in TSX: <Suspense> + <ErrorBoundary> components
// instead of the @try directive. use() works identically in both dialects.
function fakeFetch(shouldFail: boolean, attempt: number) {
	return new Promise<string>((resolve, reject) => {
		setTimeout(() => {
			if (shouldFail) reject(new Error('simulated fetch failure'));
			else resolve('response #' + attempt + ': shipping is the feature');
		}, 800);
	});
}

function Quote(props: { promise: Promise<string> }) {
	const quote = use(props.promise);

	return <p>{'“' + quote + '”'}</p>;
}

export default function App() {
	const [attempt, setAttempt] = useState(1);
	const [shouldFail, setShouldFail] = useState(false);

	const promise = fakeFetch(shouldFail, attempt);

	return (
		<div style={{ display: 'grid', gap: '0.75rem', justifyItems: 'start' }}>
			<div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
				<button onClick={() => setAttempt(attempt + 1)}>Refetch</button>
				<label style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
					<input
						type="checkbox"
						checked={shouldFail}
						onChange={(e) => setShouldFail(e.currentTarget.checked)}
					/>
					simulate failure
				</label>
			</div>

			<ErrorBoundary
				fallback={(error: Error) => <p style={{ color: '#ff5d72' }}>{error.message}</p>}
			>
				<Suspense fallback={<p style={{ opacity: 0.6 }}>loading…</p>}>
					<Quote promise={promise} />
				</Suspense>
			</ErrorBoundary>
		</div>
	);
}
`;

const PARALLEL_USE_APP_TSRX = `import { useState, use } from 'octane';
import { fetchCity, fetchForecast } from './Data.tsrx';

// Octane's parallel use(): provably-independent promises created for the
// same boundary START TOGETHER and the boundary suspends once — two 700ms
// fetches settle in ~700ms, not ~1400ms. React runs the same code as a
// serial waterfall.
function Dashboard(props: { attempt: number }) @{
	const city = use(fetchCity(props.attempt));
	const forecast = use(fetchForecast(props.attempt));

	<div>
		<p>{'City: ' + city}</p>
		<p>{'Forecast: ' + forecast}</p>
	</div>
}

export default function App() @{
	const [attempt, setAttempt] = useState(1);
	const [startedAt, setStartedAt] = useState(() => performance.now());

	<div class="demo">
		<button
			onClick={() => {
				setStartedAt(performance.now());
				setAttempt(attempt + 1);
			}}
		>
			Reload both
		</button>

		<div class="panel">
			@try {
				<>
					<Dashboard attempt={attempt} />
					<Elapsed since={startedAt} />
				</>
			} @pending {
				<p class="hint">loading both…</p>
			}
		</div>

		<style>
			.demo {
				display: grid;
				gap: 0.75rem;
				justify-items: start;
			}
			button {
				padding: 0.4rem 0.9rem;
				border-radius: 8px;
				border: 1px solid #8886;
				background: transparent;
				color: inherit;
				cursor: pointer;
			}
			.panel {
				padding: 0.75rem;
				border: 1px solid #8884;
				border-radius: 8px;
			}
			.hint {
				opacity: 0.6;
				margin: 0;
			}
		</style>
	</div>
}

function Elapsed(props: { since: number }) @{
	const ms = Math.round(performance.now() - props.since);

	<p class="hint">{'Both resolved after ~' + ms + 'ms — two 700ms fetches, one round.'}</p>
}
`;

const PARALLEL_USE_DATA_TSRX = `// Fake API module — each call takes 700ms. Because the two fetches are
// independent, octane starts them in parallel for the same boundary.
function delay<T>(ms: number, value: T): Promise<T> {
	return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export function fetchCity(attempt: number) {
	return delay(700, 'Reykjavík (' + attempt + ')');
}

export function fetchForecast(attempt: number) {
	return delay(700, 'aurora with a chance of drizzle (' + attempt + ')');
}
`;

// ── Transitions & animation ─────────────────────────────────────────────────

const TRANSITIONS_TSRX = `import { useState, useDeferredValue, useTransition } from 'octane';

// useDeferredValue lets the slow list lag one step behind the input, and
// useTransition keeps the UI responsive while a heavy update commits.
const WORDS = ['ember', 'orchid', 'quartz', 'saffron', 'thistle', 'umbra', 'verdant', 'willow'];
const ITEMS = Array.from({ length: 1500 }, (_, i) => WORDS[i % WORDS.length] + '-' + i);

function SlowList(props: { query: string }) @{
	// Artificial cost so the deferral is visible.
	const start = performance.now();
	while (performance.now() - start < 40) {
		// busy-wait ~40ms per render
	}
	const matches = ITEMS.filter((item) => item.includes(props.query)).slice(0, 12);

	<ul>
		@for (const item of matches; key item) {
			<li>{item}</li>
		} @empty {
			<li class="hint">no matches</li>
		}
	</ul>
}

export default function App() @{
	const [query, setQuery] = useState('');
	const deferredQuery = useDeferredValue(query);
	const [isPending, startTransition] = useTransition();
	const [sorted, setSorted] = useState(false);
	const isStale = query !== deferredQuery;

	<div class="demo">
		<div class="row">
			<input
				placeholder="type to filter 1500 items…"
				value={query}
				onInput={(e) => setQuery(e.currentTarget.value)}
			/>
			<button onClick={() => startTransition(() => setSorted(!sorted))}>
				{(isPending ? 'Sorting…' : sorted ? 'Unsort' : 'Sort') as string}
			</button>
		</div>

		<div class={'panel' + (isStale ? ' stale' : '')}>
			<SlowList query={sorted ? deferredQuery.split('').sort().join('') : deferredQuery} />
		</div>

		<style>
			.demo {
				display: grid;
				gap: 0.75rem;
			}
			.row {
				display: flex;
				gap: 0.5rem;
			}
			input {
				padding: 0.3rem 0.5rem;
				border-radius: 6px;
				border: 1px solid #8886;
				background: transparent;
				color: inherit;
				min-width: 16rem;
			}
			button {
				padding: 0.3rem 0.7rem;
				border-radius: 6px;
				border: 1px solid #8886;
				background: transparent;
				color: inherit;
				cursor: pointer;
			}
			.panel {
				padding: 0.75rem;
				border: 1px solid #8884;
				border-radius: 8px;
				transition: opacity 0.15s;
			}
			.stale {
				opacity: 0.5;
			}
			.hint {
				opacity: 0.6;
			}
		</style>
	</div>
}
`;

const VIEW_TRANSITION_TSRX = `import { useState, startTransition, ViewTransition } from 'octane';

// <ViewTransition> animates enter/exit through the browser's View
// Transition API — wrap the element, name the animations, and make the
// state change inside startTransition. Browsers without the native API
// simply skip the animation.
export default function App() @{
	const [visible, setVisible] = useState(true);

	<div class="demo">
		<button onClick={() => startTransition(() => setVisible(!visible))}>
			{(visible ? 'Remove card' : 'Add card') as string}
		</button>

		<div class="stage">
			@if (visible) {
				<ViewTransition enter="card-in" exit="card-out">
					<div class="card">I animate in and out</div>
				</ViewTransition>
			}
		</div>

		<style>
			.demo {
				display: grid;
				gap: 0.75rem;
				justify-items: start;
			}
			button {
				padding: 0.4rem 0.9rem;
				border-radius: 8px;
				border: 1px solid #8886;
				background: transparent;
				color: inherit;
				cursor: pointer;
			}
			.stage {
				min-height: 4rem;
			}
			.card {
				padding: 1rem 1.5rem;
				border-radius: 10px;
				border: 1px solid #8886;
				background: #22262e;
			}
			:global(::view-transition-new(.card-in)) {
				animation: card-in 400ms cubic-bezier(0.16, 1, 0.3, 1) both;
			}
			:global(::view-transition-old(.card-out)) {
				animation: card-out 260ms cubic-bezier(0.4, 0, 1, 1) both;
			}
			@keyframes card-in {
				from {
					opacity: 0;
					transform: translateY(14px) scale(0.8);
				}
			}
			@keyframes card-out {
				to {
					opacity: 0;
					transform: translateY(14px) scale(0.8);
				}
			}
		</style>
	</div>
}
`;

// ── Forms ───────────────────────────────────────────────────────────────────

const FORM_ACTIONS_TSRX = `import { useActionState, useFormStatus } from 'octane';

// <form action={fn}> + useActionState wires an async action to the form;
// useFormStatus lets any child read the in-flight state without prop
// drilling.
async function saveName(previous: string, formData: FormData) {
	const name = String(formData.get('name') ?? '').trim();
	if (!name) return 'Enter a name before saving.';

	// Stand-in for a real request.
	await new Promise((resolve) => setTimeout(resolve, 700));
	return 'Saved ' + name + '.';
}

function SubmitButton() @{
	const status = useFormStatus();

	<button type="submit" disabled={status.pending}>
		{(status.pending ? 'Saving…' : 'Save') as string}
	</button>
}

export default function App() @{
	const [message, submit] = useActionState(saveName, '');

	<form action={submit} class="demo">
		<label>
			Name
			<input name="name" defaultValue="Ada" />
		</label>

		<SubmitButton />

		@if (message) {
			<p role="status">{message as string}</p>
		}

		<style>
			.demo {
				display: grid;
				gap: 0.75rem;
				justify-items: start;
			}
			label {
				display: grid;
				gap: 0.25rem;
			}
			input {
				padding: 0.3rem 0.5rem;
				border-radius: 6px;
				border: 1px solid #8886;
				background: transparent;
				color: inherit;
			}
			button {
				padding: 0.4rem 0.9rem;
				border-radius: 8px;
				border: 1px solid #8886;
				background: transparent;
				color: inherit;
				cursor: pointer;
			}
		</style>
	</form>
}
`;

// ── Ecosystem ───────────────────────────────────────────────────────────────

const ESM_SH_TSRX = `import { useSyncExternalStore } from 'octane';
import { createStore } from 'zustand/vanilla';

// Third-party imports work in the playground: bare specifiers resolve
// through esm.sh (this one becomes https://esm.sh/zustand/vanilla).
// useSyncExternalStore subscribes octane to the external store.
const store = createStore<{ count: number }>(() => ({ count: 0 }));

const increment = () => store.setState((state) => ({ count: state.count + 1 }));
const reset = () => store.setState({ count: 0 });

export default function App() @{
	const count = useSyncExternalStore(store.subscribe, () => store.getState().count);

	<div class="demo">
		<h2>{'Zustand count: ' + count}</h2>

		<div class="row">
			<button onClick={increment}>Increment</button>
			<button onClick={reset}>Reset</button>
		</div>

		<p class="hint">
			The store lives outside octane entirely — any subscriber sees the same state.
		</p>

		<style>
			.demo {
				display: grid;
				gap: 0.75rem;
				justify-items: start;
			}
			.row {
				display: flex;
				gap: 0.5rem;
			}
			button {
				padding: 0.4rem 0.9rem;
				border-radius: 8px;
				border: 1px solid #8886;
				background: transparent;
				color: inherit;
				cursor: pointer;
			}
			.hint {
				opacity: 0.6;
			}
		</style>
	</div>
}
`;

const OCTANE_COMPAT_HOST = `import { useState } from 'react';
import { OctaneCompat } from 'octane/react';
import { Island } from './Island.tsrx';

// This file is a REACT host — real react-dom (from esm.sh) renders it.
// <OctaneCompat> mounts the compiled Octane island inside the React tree;
// events inside the island are native and bubble through to React
// ancestors, and the island runs its own Suspense boundary.
export default function App() {
	const [mounted, setMounted] = useState(true);
	const [hostClicks, setHostClicks] = useState(0);

	return (
		<main
			style={{ display: 'grid', gap: '0.75rem', justifyItems: 'start' }}
			onClick={() => setHostClicks((clicks) => clicks + 1)}
		>
			<h2 style={{ margin: 0 }}>React 19 host</h2>
			<p style={{ margin: 0, opacity: 0.7 }}>
				{'Clicks seen by the React host (bubbled from anywhere below): ' + hostClicks}
			</p>

			<button onClick={() => setMounted((value) => !value)}>
				{mounted ? 'Unmount island' : 'Mount island'}
			</button>

			{mounted ? (
				<OctaneCompat>
					<Island start={3} />
				</OctaneCompat>
			) : null}
		</main>
	);
}
`;

const OCTANE_COMPAT_ISLAND = `import { useState, use } from 'octane';

// A compiled Octane island hosted by the React tree in App.react.tsx.
// It keeps its own state, native events, and @try/@pending Suspense.
function fakeFetch(attempt: number) {
	return new Promise<string>((resolve) => {
		setTimeout(() => resolve('island data #' + attempt), 700);
	});
}

function IslandData(props: { promise: Promise<string> }) @{
	const data = use(props.promise);

	<p class="data">{data as string}</p>
}

export function Island(props: { start: number }) @{
	const [count, setCount] = useState(props.start);
	const [attempt, setAttempt] = useState(1);

	const promise = fakeFetch(attempt);

	<section class="island">
		<h3>Octane island</h3>

		<div class="row">
			<button onClick={() => setCount(count + 1)}>{'clicks: ' + count}</button>
			<button onClick={() => setAttempt(attempt + 1)}>Refetch</button>
		</div>

		@try {
			<IslandData promise={promise} />
		} @pending {
			<p class="hint">island loading…</p>
		}

		<style>
			.island {
				padding: 0.9rem 1.1rem;
				border: 1px dashed #ff5d72aa;
				border-radius: 10px;
				display: grid;
				gap: 0.5rem;
				justify-items: start;
			}
			h3 {
				margin: 0;
				color: #ff5d72;
			}
			.row {
				display: flex;
				gap: 0.5rem;
			}
			button {
				padding: 0.3rem 0.7rem;
				border-radius: 6px;
				border: 1px solid #8886;
				background: transparent;
				color: inherit;
				cursor: pointer;
			}
			.data,
			.hint {
				margin: 0;
			}
			.hint {
				opacity: 0.6;
			}
		</style>
	</section>
}
`;

// ── Catalogue ───────────────────────────────────────────────────────────────

export const CUSTOM_EXAMPLE_ID = 'custom';
export const DEFAULT_EXAMPLE_ID = 'counter';

export const EXAMPLES: PlaygroundExample[] = [
	{
		id: 'counter',
		label: 'Counter',
		group: 'Basics',
		variants: {
			tsrx: workspace([{ name: 'App.tsrx', source: COUNTER_TSRX }]),
			tsx: workspace([{ name: 'App.tsx', source: COUNTER_TSX }]),
		},
	},
	{
		id: 'keyed-list',
		label: 'Keyed lists',
		group: 'Basics',
		variants: {
			tsrx: workspace([{ name: 'App.tsrx', source: LIST_TSRX }]),
			tsx: workspace([{ name: 'App.tsx', source: LIST_TSX }]),
		},
	},
	{
		id: 'inputs',
		label: 'Inputs & @switch',
		group: 'Basics',
		variants: {
			tsrx: workspace([{ name: 'App.tsrx', source: INPUTS_TSRX }]),
		},
	},
	{
		id: 'branch-hooks',
		label: 'Branch-local hooks',
		group: 'State & context',
		variants: {
			tsrx: workspace([{ name: 'App.tsrx', source: BRANCH_HOOKS_TSRX }]),
		},
	},
	{
		id: 'context',
		label: 'Context',
		group: 'State & context',
		variants: {
			tsrx: workspace([{ name: 'App.tsrx', source: CONTEXT_TSRX }]),
			tsx: workspace([{ name: 'App.tsx', source: CONTEXT_TSX }]),
		},
	},
	{
		id: 'portals',
		label: 'Portals',
		group: 'State & context',
		variants: {
			tsrx: workspace([{ name: 'App.tsrx', source: PORTAL_TSRX }]),
		},
	},
	{
		id: 'dynamic-tags',
		label: 'Dynamic tags <{expr}>',
		group: 'State & context',
		variants: {
			tsrx: workspace([{ name: 'App.tsrx', source: DYNAMIC_TSRX }]),
		},
	},
	{
		id: 'suspense',
		label: 'Suspense + use()',
		group: 'Async & Suspense',
		variants: {
			tsrx: workspace([{ name: 'App.tsrx', source: SUSPENSE_TSRX }]),
			tsx: workspace([{ name: 'App.tsx', source: SUSPENSE_TSX }]),
		},
	},
	{
		id: 'parallel-use',
		label: 'Parallel use() (multi-file)',
		group: 'Async & Suspense',
		variants: {
			tsrx: workspace(
				[
					{ name: 'App.tsrx', source: PARALLEL_USE_APP_TSRX },
					{ name: 'Data.tsrx', source: PARALLEL_USE_DATA_TSRX },
				],
				'App.tsrx',
			),
		},
	},
	{
		id: 'transitions',
		label: 'Transitions & deferred values',
		group: 'Transitions & animation',
		variants: {
			tsrx: workspace([{ name: 'App.tsrx', source: TRANSITIONS_TSRX }]),
		},
	},
	{
		id: 'view-transition',
		label: 'ViewTransition',
		group: 'Transitions & animation',
		variants: {
			tsrx: workspace([{ name: 'App.tsrx', source: VIEW_TRANSITION_TSRX }]),
		},
	},
	{
		id: 'form-actions',
		label: 'Form actions',
		group: 'Forms',
		variants: {
			tsrx: workspace([{ name: 'App.tsrx', source: FORM_ACTIONS_TSRX }]),
		},
	},
	{
		id: 'esm-sh',
		label: 'Third-party import (zustand)',
		group: 'Ecosystem',
		variants: {
			tsrx: workspace([{ name: 'App.tsrx', source: ESM_SH_TSRX }]),
		},
	},
	{
		id: 'octane-compat',
		label: 'OctaneCompat in React (multi-file)',
		group: 'Ecosystem',
		variants: {
			tsrx: workspace(
				[
					{ name: 'App.react.tsx', source: OCTANE_COMPAT_HOST },
					{ name: 'Island.tsrx', source: OCTANE_COMPAT_ISLAND },
				],
				'App.react.tsx',
			),
		},
	},
];

export function getExample(id: string): PlaygroundExample | undefined {
	return EXAMPLES.find((example) => example.id === id);
}

/** Deep-copy an example variant into a mutable workspace. */
export function exampleWorkspace(
	example: PlaygroundExample,
	lang: PlaygroundLang,
): ExampleWorkspace | null {
	const variant = example.variants[lang];
	if (!variant) return null;
	return {
		entry: variant.entry,
		files: variant.files.map((file) => ({ ...file })),
	};
}

/** The workspace the playground boots with (counter example). */
export const DEFAULT_WORKSPACES: Record<PlaygroundLang, ExampleWorkspace> = {
	tsrx: exampleWorkspace(getExample(DEFAULT_EXAMPLE_ID)!, 'tsrx')!,
	tsx: exampleWorkspace(getExample(DEFAULT_EXAMPLE_ID)!, 'tsx')!,
};
