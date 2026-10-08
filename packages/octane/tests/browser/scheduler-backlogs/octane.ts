import { Island } from './island.js';
import {
	createElement as h,
	createRoot,
	hydrateRoot,
	startTransition,
	useState,
	useActionState,
	useLayoutEffect,
} from '../../../src/index.js';
import { enableNativeReadCollection } from '../../../src/runtime.js';
import {
	createScope,
	createResource,
	query,
	derived$,
	runWithSignalOwner,
} from '../../../src/signals/index.js';
import { registerIndependentHydrationIsland } from '../../../src/hydration/independent-island.js';
import { createIndependentHydrateManifest } from '../../../src/independent-hydration-protocol.js';
import {
	buffered,
	burn,
	commit,
	completeSource,
	count,
	input,
	observe,
	scenario,
	state,
} from './shared.js';

// Public component APIs with compiler-assigned hook slots and the native reader
// ABI, as in signals-native-collection.abi.test.ts. The production runtime is
// bundled unchanged; this fixture does not substitute scheduler implementations.
enableNativeReadCollection();
const draftSlot = Symbol('draft');
const actionSlot = Symbol('action');
const layoutSlot = Symbol('layout');
let release!: () => void;
const ready = new Promise<void>((resolve) => {
	release = resolve;
});
const owner = createScope({ scopeKey: 'browser-backlog' });
const value$ =
	scenario === 'query'
		? createResource(owner, 'query', () =>
				query('query', () => buffered(ready), { kind: 'stream' })(undefined),
			)
		: scenario === 'derived'
			? derived$(() => buffered(ready), { key: 'derived' })
			: undefined;
if (value$)
	runWithSignalOwner(owner, () =>
		value$.subscribe(() => {
			const snapshot = value$.snapshot();
			if (snapshot.status === 'ready' && !snapshot.complete) observe(snapshot.value);
			if (snapshot.complete) completeSource();
		}),
	);

function Draft({ start }: { start: () => void }) {
	const [draft, setDraft] = useState('', draftSlot);
	return h(
		'section',
		null,
		h('input', {
			id: 'draft',
			value: draft,
			onInput: (event: Event) => setDraft(input(event, start)),
		}),
		h('output', { id: 'draft-output' }, draft),
	);
}
function Stream() {
	const value = runWithSignalOwner(owner, () => value$!.latest(0));
	useLayoutEffect(() => commit(value), null, layoutSlot);
	return h('output', { id: 'result' }, String(value));
}
function Actions() {
	const [value, dispatch, pending] = useActionState(
		(previous: number) => {
			observe(previous + 1);
			return previous + 1;
		},
		0,
		actionSlot,
	);
	useLayoutEffect(() => commit(value, pending), null, layoutSlot);
	if (state.startedAt) burn(2);
	return h(
		'main',
		null,
		h(Draft, {
			start: () =>
				startTransition(() => {
					for (let i = 0; i < count; i++) dispatch();
				}),
		}),
		h('output', { id: 'result' }, String(value)),
		h('span', { id: 'pending' }, String(pending)),
	);
}
if (scenario === 'islands') {
	const module = ready.then(() => ({
		default({ element, captures }: { element: Element; captures: readonly unknown[] }) {
			const value = captures[0] as number;
			const original = element.firstElementChild;
			const root = hydrateRoot(element, Island, { value });
			if (element.firstElementChild === original) state.adopted++;
			state.activations.push(value);
			observe(value);
			if (state.activations.length === count) {
				completeSource();
				commit(count);
			}
			return root;
		},
	}));
	for (let value = 1; value <= count; value++) {
		const element = document.querySelector(`[data-octane-hydrate-id="island-${value}"]`)!;
		const manifest = createIndependentHydrateManifest(
			{
				version: 1,
				boundaryId: 'island',
				exportName: 'default',
				captureSchema: [{ name: 'value', type: 'json' }],
				hookSeed: 0,
				idSeed: 0,
				signalSites: [],
				parentDependencies: false,
			},
			[value],
			`island-${value}`,
			'browser-backlog',
			{ moduleId: 'ready-island.js', styles: [] },
		);
		registerIndependentHydrationIsland(element, manifest, {
			load: () => module,
			loadStyles() {},
			onError: (error) => state.errors.push(String(error)),
		});
	}
}
const root = createRoot(document.querySelector('#root')!);
root.render(
	scenario === 'actions'
		? h(Actions, null)
		: h('main', null, h(Draft, { start: release }), ...(value$ ? [h(Stream, null)] : [])),
);
