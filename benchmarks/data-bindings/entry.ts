/**
 * One renderer, lane and scenario per page: `?renderer=octane&lane=hooks&scenario=own`.
 * Each step runs synchronously in one call, so the runner times it with
 * `performance.now()` around the call and checks the DOM in the same task.
 */
import { RENDERERS, LANES, SCENARIOS, WRITTEN } from './contract.mjs';
import { bareStore, dataStore, ids, item, items, setLabel } from './data.ts';

const query = new URLSearchParams(location.search);
const renderer = query.get('renderer') as keyof typeof LANES;
const lane = query.get('lane')!;
const scenario = query.get('scenario')!;
if (
	!RENDERERS.includes(renderer) ||
	!LANES[renderer].includes(lane) ||
	!SCENARIOS.includes(scenario)
)
	throw new Error(`unknown case ${location.search}`);
const container = document.getElementById('app')!;

interface Renderer {
	counts: { renders: number };
	mount(props: object): void;
	update(props: object): void;
	unmount(): void;
	flush(fn: () => void): void;
}

async function load(): Promise<Renderer> {
	if (renderer === 'react') {
		const [{ createElement }, { createRoot }, { flushSync }, app] = await Promise.all([
			import('react'),
			import('react-dom/client'),
			import('react-dom'),
			import('./react-app.ts'),
		]);
		let root: ReturnType<typeof createRoot> | null = null;
		const render = (props: object) =>
			flushSync(() => root!.render(createElement(app.App, props as never)));
		return {
			counts: app.counts,
			mount: (props) => ((root = createRoot(container)), render(props)),
			update: render,
			unmount: () => (root!.unmount(), (root = null)),
			flush: flushSync,
		};
	}
	const [{ createRoot, flushSync }, app, signals] = await Promise.all([
		import('octane'),
		import('./octane-app.tsrx'),
		import('./signal-read.ts'),
	]);
	if (lane === 'signals') signals.enableSignalReads();
	let root: ReturnType<typeof createRoot> | null = null;
	return {
		counts: app.counts,
		mount: (props) => (
			(root = createRoot(container)),
			flushSync(() => root!.render(app.App, props as never))
		),
		update: (props) => flushSync(() => root!.render(app.App, props as never)),
		unmount: () => (root!.unmount(), (root = null)),
		flush: flushSync,
	};
}

const view = await load();
let store = dataStore();
let bare = bareStore();
let tick = 0;
let label = 0;
/** The `handle` lane's handles, made once per store, outside the timed steps. */
const handlesOf = (from: typeof store) => ({
	item: new Map(ids.map((id) => [id, from.read(item, { id })])),
	items: from.read(items),
});
let handles = handlesOf(store);
const props = () => ({ lane, scenario, tick, store, bare, handles });
const text = (index: number) => container.querySelectorAll('li')[index]?.textContent;

/** Each step returns what the runner checks: rendered rows, and the row a write changed. */
const steps = {
	mount() {
		view.mount(props());
	},
	rerender() {
		tick++;
		view.update(props());
	},
	write() {
		const next = `edit ${++label}`;
		view.flush(() => {
			if (lane === 'bare') bare.setLabel(ids[WRITTEN]!, next);
			else void store.write(setLabel, { id: ids[WRITTEN]!, label: next });
		});
		return next;
	},
	unmount() {
		view.unmount();
	},
};

(window as any).__bench = {
	run(step: keyof typeof steps) {
		const before = view.counts.renders;
		const started = performance.now();
		const expected = steps[step]();
		const duration = performance.now() - started;
		return {
			duration,
			renders: view.counts.renders - before,
			rows: container.querySelectorAll('li').length,
			written: expected === undefined || scenario === 'none' ? true : text(WRITTEN) === expected,
		};
	},
	/** Settle the writes and start from fresh stores, outside the timed steps. */
	async reset() {
		await new Promise((resolve) => setTimeout(resolve, 0));
		await store.retire();
		store = dataStore();
		handles = handlesOf(store);
		bare = bareStore();
	},
};
(window as any).__ready = true;
