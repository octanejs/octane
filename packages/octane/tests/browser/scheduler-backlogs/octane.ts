import { Island } from './island.js';
import {
	createElement as h,
	createRoot,
	hydrateRoot,
	startTransition,
	useState,
	useActionState,
	useLayoutEffect,
	useEffect,
	memo,
	useDeferredValue,
} from '../../../src/index.js';
import { encodeSignalValue, decodeSignalValue } from '../../../src/data-encoding.js';
import type { StreamedRendererFrame } from '../../../src/streamed-signals-protocol.js';
import { readServerResult } from '../../../src/server-rpc-stream-client.js';
import { encodeServerResultFrame } from '../../../src/server-rpc-protocol.js';
import { readStreamedRendererResponse } from '../../../src/hydration/stream-delivery.js';
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
	cold,
	blocked,
	effect,
	manyRoots,
	producers,
	response,
	task,
	workMs,
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
// bundled unchanged by default; budget counterfactuals are explicit runner options.
enableNativeReadCollection();
const draftSlot = Symbol('draft');
const actionSlot = Symbol('action');
const layoutSlot = Symbol('layout');
let release!: () => void;
const ready = new Promise<void>((resolve) => {
	release = resolve;
});
const owners = Array.from({ length: producers }, (_, index) =>
	createScope({ scopeKey: `browser-backlog-${index}` }),
);
const values = owners.flatMap((owner, index) => {
	const value$ =
		scenario === 'query'
			? createResource(owner, 'query', () =>
					query('query', () => buffered(ready), { kind: 'stream' })(undefined),
				)
			: scenario === 'derived'
				? derived$(() => buffered(ready), { key: `derived-${index}` })
				: undefined;
	if (!value$) return [];
	runWithSignalOwner(owner, () =>
		value$.subscribe(() => {
			const snapshot = value$.snapshot();
			if (snapshot.status === 'error') state.errors.push(String(snapshot.error));
			if (snapshot.status === 'ready' && !snapshot.complete) observe(snapshot.value, index);
			if (snapshot.complete && ++finishedSources === producers) completeSource();
		}),
	);
	return [value$];
});
let finishedSources = 0;
const queries =
	scenario === 'queries'
		? owners.map((owner, producer) =>
				Array.from({ length: count }, (_, index) => {
					const value$ = createResource(owner, `query-${index}`, () =>
						query(`query-${index}`, async () => {
							await ready;
							if (cold) await task();
							return index + 1;
						})(undefined),
					);
					runWithSignalOwner(owner, () =>
						value$.subscribe(() => {
							const snapshot = value$.snapshot();
							if (snapshot.status === 'error') state.errors.push(String(snapshot.error));
							if (snapshot.status === 'ready') {
								observe(snapshot.value, producer);
								if (++finishedSources === count * producers) completeSource();
							}
						}),
					);
					return value$;
				}),
			)
		: [];
const committed = owners.map(() => 0);

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
function Stream({ index }: { index: number }) {
	const value = runWithSignalOwner(owners[index], () => values[index].latest(0));
	useLayoutEffect(
		() => {
			committed[index] = value;
			commit(
				value,
				false,
				committed.every((current) => current === count),
			);
		},
		null,
		layoutSlot,
	);
	useEffect(effect, null, Symbol.for('effect'));
	return h('output', { className: 'result' }, String(value));
}
function Queries({ index }: { index: number }) {
	const value = runWithSignalOwner(
		owners[index],
		() => queries[index].filter((value$) => value$.latest(0) > 0).length,
	);
	useLayoutEffect(
		() => {
			committed[index] = value;
			commit(
				value,
				false,
				committed.every((current) => current === count),
			);
		},
		null,
		layoutSlot,
	);
	useEffect(effect, null, Symbol.for('effect'));
	return h('output', { className: 'result' }, String(value));
}
function Actions() {
	const [value, dispatch, pending] = useActionState(
		(previous: number) => {
			const finish = () => {
				observe(previous + 1);
				if (previous + 1 === count) completeSource();
				return previous + 1;
			};
			return cold || (blocked && previous === 0) ? task().then(finish) : finish();
		},
		0,
		actionSlot,
	);
	useLayoutEffect(() => commit(value, pending), null, layoutSlot);
	useEffect(effect, null, Symbol.for('effect'));
	if (state.startedAt) burn(workMs);
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
const Slow = memo(function Slow({ value }: { value: number }) {
	if (value) burn(workMs * count);
	useLayoutEffect(
		() => {
			if (value) {
				observe(value);
				completeSource();
			}
			commit(value);
		},
		null,
		layoutSlot,
	);
	useEffect(effect, null, Symbol.for('effect'));
	return h('output', { id: 'result' }, String(value));
});
function Deferred() {
	const [value, setValue] = useState(0, Symbol.for('value'));
	const deferred = useDeferredValue(value, Symbol.for('deferred'));
	return h(
		'main',
		null,
		h(Draft, {
			start: () => {
				void (cold ? task() : Promise.resolve()).then(() => setValue(count));
			},
		}),
		h(Slow, { value: deferred }),
	);
}
const payloadBytes = Number(new URL(location.href).searchParams.get('payloadBytes') ?? 0);
function payload(value: number) {
	return payloadBytes ? { value, padding: String(value).padEnd(payloadBytes, 'x') } : value;
}
async function read(producer: number) {
	if (scenario === 'rpc') {
		const frames = [
			{ kind: 'stream' },
			...Array.from({ length: count }, (_, i) => ({ kind: 'value', value: payload(i + 1) })),
			{ kind: 'complete' },
		];
		const chunks = frames.map((frame, sequence) =>
			encodeServerResultFrame(sequence, frame as Parameters<typeof encodeServerResultFrame>[1]),
		);
		const bytes = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.length, 0));
		let offset = 0;
		for (const chunk of chunks) {
			bytes.set(chunk, offset);
			offset += chunk.length;
		}
		await ready;
		const stream = (await readServerResult(response(bytes))) as AsyncIterable<
			ReturnType<typeof payload>
		>;
		for await (const value of stream) publish(value, producer);
	} else {
		const identity = {
			protocol: 1,
			buildId: 'build',
			documentId: 'document',
			ownerKey: 'owner',
			instanceKey: 'instance',
			nodeKey: 'node',
			selectionKey: 'selection',
			selectionGeneration: 0,
			attempt: 0,
		};
		const frames = [
			{ kind: 'open', resource: 'stream' },
			...Array.from({ length: count }, (_, i) => ({
				kind: 'value',
				value: encodeSignalValue(payload(i + 1)),
			})),
			{ kind: 'complete' },
		].map((frame, sequence) => ({ ...frame, identity, sequence, channel: 'result' }));
		const bytes = new TextEncoder().encode(
			frames.map((frame) => JSON.stringify(frame) + '\n').join(''),
		);
		await ready;
		await readStreamedRendererResponse(response(bytes), {
			async receive(input) {
				const frame = input as StreamedRendererFrame;
				if (frame.kind === 'value')
					publish(decodeSignalValue(frame.value) as ReturnType<typeof payload>, producer);
				return 'accepted';
			},
			failSelection() {
				return true;
			},
		});
	}
	if (++finishedSources === producers) completeSource();
}
function publish(data: ReturnType<typeof payload>, producer: number) {
	const value = typeof data === 'number' ? data : data.value;
	if (typeof data !== 'number' && data.padding !== String(value).padEnd(payloadBytes, 'x'))
		throw new Error('payload changed');
	observe(value, producer);
	committed[producer] = value;
	document.querySelector('#result')!.textContent = String(Math.min(...committed));
	commit(
		value,
		false,
		committed.every((current) => current === count),
	);
}
const disposals: Array<() => void> = [];
if (scenario === 'islands') {
	const module = ready.then(() => ({
		default({ element, captures }: { element: Element; captures: readonly unknown[] }) {
			const value = captures[0] as number;
			const original = element.firstElementChild;
			const root = hydrateRoot(element, Island, { value });
			if (element.firstElementChild === original) state.adopted++;
			state.activations.push(value);
			observe(value);
			commit(value);
			if (state.activations.length === count) {
				completeSource();
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
		disposals.push(
			registerIndependentHydrationIsland(element, manifest, {
				load: () => (cold ? ready.then(task).then(() => module) : module),
				loadStyles() {},
				onError: (error) => state.errors.push(String(error)),
			}),
		);
	}
}
const readers = scenario === 'queries' ? queries : values;
const Reader = scenario === 'queries' ? Queries : Stream;
const root = createRoot(document.querySelector('#root')!);
disposals.push(() => root.unmount());
root.render(
	scenario === 'actions'
		? h(Actions, null)
		: scenario === 'deferred'
			? h(Deferred, null)
			: h(
					'main',
					null,
					h(Draft, { start: release }),
					...(manyRoots ? [] : readers.map((_, index) => h(Reader, { index, key: index }))),
					...(['rpc', 'renderer'].includes(scenario) ? [h('output', { id: 'result' }, '0')] : []),
				),
);
if (manyRoots)
	for (let index = 0; index < readers.length; index++) {
		const container = document.body.appendChild(document.createElement('div'));
		const streamRoot = createRoot(container);
		streamRoot.render(h(Reader, { index }));
		disposals.push(() => {
			streamRoot.unmount();
			container.remove();
		});
	}
if (scenario === 'rpc' || scenario === 'renderer')
	for (let index = 0; index < producers; index++)
		void read(index).catch((error) => state.errors.push(String(error)));
window.__schedulerDispose = () => {
	for (const dispose of disposals) dispose();
	for (const owner of owners) owner.dispose();
};
state.readyAt = performance.now();
