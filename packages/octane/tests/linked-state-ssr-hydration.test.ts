import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, flushSync, hydrateRoot } from '../src/index.js';
import * as ServerRuntime from 'octane/server';
import * as UniversalRuntime from '../src/universal.js';
import { loadCompiledFixtureSource } from './_server-fixture.js';
import {
	activateStreamedMarkup,
	createPipeableCollector,
	deferred,
	resetStreamRuntimeGlobals,
} from './_server-stream.js';

const FIXTURE_SOURCE = `
import { Suspense, use, useLinkedState, useState } from 'octane';

export function LinkedDraft(props) @{
	const [value, setValue, getValue] = useLinkedState(
		props.source,
		(source, previous) =>
			props.reconcile === undefined
				? 'draft:' + (typeof source === 'object' ? source.id : source)
				: props.reconcile(source, previous),
		props.options,
	);
	props.capture?.({ value, setValue, getValue });
	<button id="linked-draft" onClick={() => setValue((previous) => previous + '!')}>
		{value as string}
	</button>
}

export function LinkedPair(props) @{
	const [value, setValue] = useLinkedState(props.source, (source) => 'pair:' + source);
	<button id="linked-pair" onClick={() => setValue((previous) => previous + '!')}>
		{value as string}
	</button>
}

export function RenderPhaseSource(props) @{
	const [source, setSource] = useState(props.initial);
	const [value, setValue, getValue] = useLinkedState(
		source,
		(current, previous) => props.reconcile(current, previous),
	);
	if (props.editInitial && source === props.initial && value === 'start:' + source) {
		setValue('edited:' + source);
	}
	if (source !== props.target) setSource(props.target);
	props.capture?.({ value, getValue });
	<span id="linked-render-phase">{value as string}</span>
}

export function HydratedRenderPhaseEdit(props) @{
	const [value, setValue, getValue] = useLinkedState(
		props.source,
		(source) => 'draft:' + source,
	);
	if (props.edit && value === 'draft:' + props.source) {
		setValue((previous) => previous + '!');
	}
	props.capture?.({ value, setValue, getValue });
	<span id="hydrated-linked-edit">{value as string}</span>
}

export function ConditionalLinked(props) @{
	let value = 'inactive';
	if (props.active) {
		const [current, setCurrent, getCurrent] = useLinkedState(
			props.source,
			(source) => 'conditional:' + source,
		);
		props.capture?.({ value: current, setValue: setCurrent, getValue: getCurrent });
		value = current;
	}
	<span id="linked-conditional">{value as string}</span>
}

function AsyncLinked(props) @{
	const loaded = use(props.promise);
	const [value, setValue, getValue] = useLinkedState(
		props.source,
		(source) => source + ':' + loaded,
	);
	props.capture?.({ value, setValue, getValue });
	<button id="linked-stream" onClick={() => setValue((previous) => previous + '!')}>
		{value as string}
	</button>
}

export function NestedLinkedSuspense(props) @{
	<Suspense fallback={<p id="linked-outer-pending">{'outer loading'}</p>}>
		<section id="linked-shell">
			<Suspense fallback={<p id="linked-inner-pending">{'inner loading'}</p>}>
				<AsyncLinked {...props} />
			</Suspense>
		</section>
	</Suspense>
}

function ParkedLinkedValue(props) @{
	const [value, setValue, getValue] = useLinkedState(
		props.source,
		(source) => 'draft:' + source,
	);
	props.capture?.({ value, setValue, getValue });
	<span id="hydrated-parked-value">{value as string}</span>
}

function ParkedLinkedResource(props) @{
	if (props.promise != null) use(props.promise);
	<span id="hydrated-parked-ready">{'ready'}</span>
}

export function HydratedParkedLinked(props) @{
	<section>
		<button id="hydrated-parked-edit" onClick={() => props.onEdit?.()}>{'edit'}</button>
		<Suspense fallback={<p id="hydrated-parked-pending">{'loading'}</p>}>
			<ParkedLinkedValue {...props} />
			<ParkedLinkedResource promise={props.promise} />
		</Suspense>
	</section>
}
`;

type FixtureModule = {
	LinkedDraft: any;
	LinkedPair: any;
	RenderPhaseSource: any;
	HydratedRenderPhaseEdit: any;
	ConditionalLinked: any;
	NestedLinkedSuspense: any;
	HydratedParkedLinked: any;
};

let serverFixture: FixtureModule | undefined;
let clientFixture: FixtureModule | undefined;

function serverComponents(): FixtureModule {
	return (serverFixture ??= loadCompiledFixtureSource<FixtureModule>(FIXTURE_SOURCE, {
		id: '/packages/octane/tests/_fixtures/linked-state-ssr-hydration.tsrx',
		mode: 'server',
	}));
}

function clientComponents(): FixtureModule {
	return (clientFixture ??= loadCompiledFixtureSource<FixtureModule>(FIXTURE_SOURCE, {
		id: '/packages/octane/tests/_fixtures/linked-state-ssr-hydration.tsrx',
		mode: 'client',
	}));
}

interface CapturedLinked<Value> {
	value: Value;
	setValue(next: Value | ((previous: Value) => Value)): void;
	getValue(): Value;
}

interface LinkedOptions<Source, Value> {
	sourceEqual?: (previous: Source, next: Source) => boolean;
	valueEqual?: (previous: Value, next: Value) => boolean;
}

type UniversalLinkedHook = <Source, Value>(
	source: Source,
	reconcile: (source: Source, previous: { source: Source; value: Value } | undefined) => Value,
	options?: LinkedOptions<Source, Value> | string,
	slot?: string,
) => [Value, (next: Value | ((previous: Value) => Value)) => void, (() => Value)?];

const universalLinkedRuntime = UniversalRuntime as typeof UniversalRuntime & {
	useLinkedState?: UniversalLinkedHook;
	__useLinkedStateWithGetter?: UniversalLinkedHook;
};

const universalLinkedPlan = UniversalRuntime.universalPlan('object', {
	kind: 'host',
	type: 'linked-state',
	bindings: [['value', 0]],
});

function universalValues(container: UniversalRuntime.ObjectHostContainer): Record<string, unknown> {
	return Object.fromEntries(container.children.map((child) => [child.type, child.props.value]));
}

async function flushUniversalWork(count = 12): Promise<void> {
	for (let index = 0; index < count; index++) await Promise.resolve();
}

let container: HTMLDivElement;

beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
});

afterEach(() => {
	container.remove();
	resetStreamRuntimeGlobals();
});

describe('useLinkedState server rendering', () => {
	it('renders the initial reconciliation and keeps separate requests independent', () => {
		const server = serverComponents();
		const first = ServerRuntime.renderToString(server.LinkedDraft, { source: 'first' });
		const second = ServerRuntime.renderToString(server.LinkedDraft, { source: 'second' });

		expect(first.html).toContain('>draft:first</button>');
		expect(second.html).toContain('>draft:second</button>');
	});

	it('passes the previous source and latest local edit into same-render source reconciliation', () => {
		const reconcile = vi.fn(
			(source: string, previous: { source: string; value: string } | undefined) =>
				previous === undefined ? `start:${source}` : `${source}<-${previous.value}`,
		);
		const captured: CapturedLinked<string>[] = [];
		const server = serverComponents();
		const result = ServerRuntime.renderToString(server.RenderPhaseSource, {
			initial: 'first',
			target: 'second',
			editInitial: true,
			reconcile,
			capture: (value: CapturedLinked<string>) => captured.push(value),
		});

		container.innerHTML = result.html;
		expect(container.querySelector('#linked-render-phase')?.textContent).toBe(
			'second<-edited:first',
		);
		expect(reconcile.mock.calls).toEqual([
			['first', undefined],
			['second', { source: 'first', value: 'edited:first' }],
		]);
		expect(captured.at(-1)?.getValue()).toBe('second<-edited:first');
	});

	it('isolates conditional linked hooks and exposes the specialized latest-value getter', () => {
		const server = serverComponents();
		let captured: CapturedLinked<string> | undefined;
		const inactive = ServerRuntime.renderToString(server.ConditionalLinked, {
			active: false,
			source: 'hidden',
		});
		const active = ServerRuntime.renderToString(server.ConditionalLinked, {
			active: true,
			source: 'shown',
			capture: (value: CapturedLinked<string>) => (captured = value),
		});

		expect(inactive.html).toContain('>inactive</span>');
		expect(active.html).toContain('>conditional:shown</span>');
		expect(captured?.getValue()).toBe('conditional:shown');
	});

	it('does not invoke the initial source comparator or value comparator unnecessarily', () => {
		const sourceEqual = vi.fn(() => true);
		const valueEqual = vi.fn(() => true);
		const server = serverComponents();
		const result = ServerRuntime.renderToString(server.LinkedDraft, {
			source: { id: 'stable' },
			options: { sourceEqual, valueEqual },
		});

		expect(result.html).toContain('>draft:stable</button>');
		expect(sourceEqual).not.toHaveBeenCalled();
		expect(valueEqual).not.toHaveBeenCalled();
	});
});

describe('useLinkedState hydration', () => {
	it('adopts server DOM, preserves local edits, and reconciles changed sources without remounting', () => {
		const server = serverComponents();
		const client = clientComponents();
		container.innerHTML = ServerRuntime.renderToString(server.LinkedDraft, {
			source: 'first',
		}).html;
		const serverButton = container.querySelector('#linked-draft') as HTMLButtonElement;
		let captured: CapturedLinked<string> | undefined;

		const root = hydrateRoot(container, client.LinkedDraft, {
			source: 'first',
			capture: (value: CapturedLinked<string>) => (captured = value),
		});
		try {
			flushSync(() => {});
			expect(container.querySelector('#linked-draft')).toBe(serverButton);
			expect(serverButton.textContent).toBe('draft:first');
			expect(captured?.getValue()).toBe('draft:first');

			flushSync(() => serverButton.click());
			expect(serverButton.textContent).toBe('draft:first!');
			expect(captured?.getValue()).toBe('draft:first!');

			flushSync(() =>
				root.render(client.LinkedDraft, {
					source: 'second',
					capture: (value: CapturedLinked<string>) => (captured = value),
				}),
			);
			expect(container.querySelector('#linked-draft')).toBe(serverButton);
			expect(serverButton.textContent).toBe('draft:second');
			expect(captured?.getValue()).toBe('draft:second');
		} finally {
			root.unmount();
		}
	});

	it('keeps a render-phase edit when an already-hydrated linked source changes', () => {
		const server = serverComponents();
		const client = clientComponents();
		container.innerHTML = ServerRuntime.renderToString(server.HydratedRenderPhaseEdit, {
			source: 'A',
		}).html;
		const serverNode = container.querySelector('#hydrated-linked-edit') as HTMLSpanElement;
		let captured: CapturedLinked<string> | undefined;
		const capture = (value: CapturedLinked<string>) => (captured = value);

		const root = hydrateRoot(container, client.HydratedRenderPhaseEdit, {
			source: 'A',
			capture,
		});
		try {
			flushSync(() => {});
			expect(container.querySelector('#hydrated-linked-edit')).toBe(serverNode);
			expect(serverNode.textContent).toBe('draft:A');

			flushSync(() =>
				root.render(client.HydratedRenderPhaseEdit, {
					source: 'B',
					edit: true,
					capture,
				}),
			);
			expect(container.querySelector('#hydrated-linked-edit')).toBe(serverNode);
			expect(serverNode.textContent).toBe('draft:B!');
			expect(captured?.getValue()).toBe('draft:B!');
		} finally {
			root.unmount();
		}
	});

	it('retains an event edit made while a hydrated source draft is parked by Suspense', async () => {
		const server = serverComponents();
		const client = clientComponents();
		container.innerHTML = ServerRuntime.renderToString(server.HydratedParkedLinked, {
			source: 'A',
		}).html;
		const sourceNode = container.querySelector('#hydrated-parked-value') as HTMLSpanElement;
		let captured: CapturedLinked<string> | undefined;
		const capture = (value: CapturedLinked<string>) => (captured = value);
		const onEdit = () => captured!.setValue((previous) => previous + '!');
		const root = hydrateRoot(container, client.HydratedParkedLinked, {
			source: 'A',
			capture,
			onEdit,
		});
		const resource = deferred<string>();
		try {
			flushSync(() => {});
			expect(container.querySelector('#hydrated-parked-value')).toBe(sourceNode);
			expect(captured?.getValue()).toBe('draft:A');

			flushSync(() =>
				root.render(client.HydratedParkedLinked, {
					source: 'B',
					promise: resource.promise,
					capture,
					onEdit,
				}),
			);
			expect(container.querySelector('#hydrated-parked-pending')?.textContent).toBe('loading');

			flushSync(() =>
				(container.querySelector('#hydrated-parked-edit') as HTMLButtonElement).click(),
			);
			expect(container.querySelector('#hydrated-parked-pending')?.textContent).toBe('loading');
			expect(captured?.getValue()).toBe('draft:A');
			await act(() => resource.resolve('ready'));

			expect(container.querySelector('#hydrated-parked-value')).toBe(sourceNode);
			expect(sourceNode.textContent).toBe('draft:B!');
			expect(captured?.getValue()).toBe('draft:B!');
		} finally {
			root.unmount();
		}
	});

	it('hydrates equal logical sources with different identities and honors their comparator afterward', () => {
		const server = serverComponents();
		const client = clientComponents();
		const options = {
			sourceEqual: (previous: { id: string }, next: { id: string }) => previous.id === next.id,
		};
		container.innerHTML = ServerRuntime.renderToString(server.LinkedDraft, {
			source: { id: 'same' },
			options,
		}).html;
		const serverButton = container.querySelector('#linked-draft') as HTMLButtonElement;
		const root = hydrateRoot(container, client.LinkedDraft, {
			source: { id: 'same' },
			options,
		});
		try {
			flushSync(() => {});
			flushSync(() => serverButton.click());
			expect(serverButton.textContent).toBe('draft:same!');

			flushSync(() => root.render(client.LinkedDraft, { source: { id: 'same' }, options }));
			expect(container.querySelector('#linked-draft')).toBe(serverButton);
			expect(serverButton.textContent).toBe('draft:same!');

			flushSync(() => root.render(client.LinkedDraft, { source: { id: 'next' }, options }));
			expect(serverButton.textContent).toBe('draft:next');
		} finally {
			root.unmount();
		}
	});

	it('adopts mismatched server content and makes the differing client source interactive', () => {
		const server = serverComponents();
		const client = clientComponents();
		container.innerHTML = ServerRuntime.renderToString(server.LinkedPair, {
			source: 'server',
		}).html;
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = hydrateRoot(container, client.LinkedPair, { source: 'client' });
		try {
			flushSync(() => {});
			const button = container.querySelector('#linked-pair') as HTMLButtonElement;
			expect(button.textContent).toBe('pair:client');
			flushSync(() => button.click());
			expect(button.textContent).toBe('pair:client!');
		} finally {
			root.unmount();
			errors.mockRestore();
		}
	});

	it('streams nested Suspense content, adopts its revealed DOM, and keeps linked events live', async () => {
		const server = serverComponents();
		const client = clientComponents();
		const resource = deferred<string>();
		const collector = createPipeableCollector();
		ServerRuntime.renderToPipeableStream(server.NestedLinkedSuspense, {
			source: 'streamed',
			promise: resource.promise,
		}).pipe(collector.destination);

		expect(collector.chunks.join('')).toContain('inner loading');
		resource.resolve('ready');
		container.innerHTML = await collector.ended;
		activateStreamedMarkup(container);
		const serverButton = container.querySelector('#linked-stream') as HTMLButtonElement;
		expect(serverButton.textContent).toBe('streamed:ready');

		const clientPromise = new Promise<string>(() => {});
		const root = hydrateRoot(container, client.NestedLinkedSuspense, {
			source: 'streamed',
			promise: clientPromise,
		});
		try {
			flushSync(() => {});
			expect(container.querySelector('#linked-stream')).toBe(serverButton);
			flushSync(() => serverButton.click());
			expect(serverButton.textContent).toBe('streamed:ready!');
		} finally {
			root.unmount();
		}
	});

	it('aborts nested streamed Suspense without publishing unresolved linked content', async () => {
		const server = serverComponents();
		const resource = deferred<string>();
		const capture = vi.fn();
		const collector = createPipeableCollector();
		const stream = ServerRuntime.renderToPipeableStream(
			server.NestedLinkedSuspense,
			{ source: 'aborted', promise: resource.promise, capture },
			{ onError() {} },
		);
		stream.pipe(collector.destination);
		expect(collector.chunks.join('')).toContain('inner loading');

		stream.abort(new Error('linked stream cancelled'));
		const aborted = await collector.ended;
		expect(aborted).not.toContain('aborted:late');
		expect(capture).not.toHaveBeenCalled();

		resource.resolve('late');
		await flushUniversalWork();
		expect(collector.chunks.join('')).not.toContain('aborted:late');
		expect(capture).not.toHaveBeenCalled();
	});
});

describe('universal useLinkedState', () => {
	it('retains local edits for stable sources and reconciles from the edited previous value', () => {
		const objectContainer = UniversalRuntime.createObjectContainer();
		const root = UniversalRuntime.createUniversalRoot(
			objectContainer,
			UniversalRuntime.createObjectDriver(),
		);
		let linked: CapturedLinked<string> | undefined;
		const reconcile = vi.fn(
			(source: string, previous: { source: string; value: string } | undefined) =>
				previous === undefined ? source : `${source}<-${previous.value}`,
		);
		const Scene = UniversalRuntime.defineUniversalComponent(
			'object',
			(props: { source: string }) => {
				const [value, setValue, getValue] = universalLinkedRuntime.__useLinkedStateWithGetter!(
					props.source,
					reconcile,
					'linked',
				);
				linked = { value, setValue, getValue: getValue! };
				return UniversalRuntime.universalValue(universalLinkedPlan, [value]);
			},
		);

		try {
			root.render(Scene, { source: 'first' });
			expect(universalValues(objectContainer)).toEqual({ 'linked-state': 'first' });
			linked!.setValue('edited');
			UniversalRuntime.flushUniversalSync(() => {});
			expect(universalValues(objectContainer)).toEqual({ 'linked-state': 'edited' });
			expect(linked!.getValue()).toBe('edited');

			root.render(Scene, { source: 'first' });
			expect(universalValues(objectContainer)).toEqual({ 'linked-state': 'edited' });

			root.render(Scene, { source: 'second' });
			expect(universalValues(objectContainer)).toEqual({ 'linked-state': 'second<-edited' });
			expect(reconcile.mock.calls.at(-1)).toEqual(['second', { source: 'first', value: 'edited' }]);
			expect(linked!.getValue()).toBe('second<-edited');
		} finally {
			root.unmount();
		}
	});

	it('uses custom source and value equality without losing the committed local draft', () => {
		const objectContainer = UniversalRuntime.createObjectContainer();
		const root = UniversalRuntime.createUniversalRoot(
			objectContainer,
			UniversalRuntime.createObjectDriver(),
		);
		let setValue!: (next: string) => void;
		const reconcile = vi.fn((source: { id: string }) => source.id.toLowerCase());
		const Scene = UniversalRuntime.defineUniversalComponent(
			'object',
			(props: { source: { id: string } }) => {
				const [value, update] = universalLinkedRuntime.useLinkedState!(
					props.source,
					reconcile,
					{
						sourceEqual: (previous, next) => previous.id.toLowerCase() === next.id.toLowerCase(),
						valueEqual: (previous, next) => previous.toLowerCase() === next.toLowerCase(),
					},
					'linked',
				);
				setValue = update;
				return UniversalRuntime.universalValue(universalLinkedPlan, [value]);
			},
		);

		try {
			root.render(Scene, { source: { id: 'FIRST' } });
			expect(universalValues(objectContainer)).toEqual({ 'linked-state': 'first' });
			setValue('FIRST');
			UniversalRuntime.flushUniversalSync(() => {});
			expect(universalValues(objectContainer)).toEqual({ 'linked-state': 'first' });
			root.render(Scene, { source: { id: 'first' } });
			expect(universalValues(objectContainer)).toEqual({ 'linked-state': 'first' });
			expect(reconcile).toHaveBeenCalledTimes(1);

			root.render(Scene, { source: { id: 'SECOND' } });
			expect(universalValues(objectContainer)).toEqual({ 'linked-state': 'second' });
		} finally {
			root.unmount();
		}
	});

	it('advances the committed source while retaining the previous equal value identity', () => {
		const objectContainer = UniversalRuntime.createObjectContainer();
		const root = UniversalRuntime.createUniversalRoot(
			objectContainer,
			UniversalRuntime.createObjectDriver(),
		);
		const previousSources: Array<string | undefined> = [];
		let getValue!: () => { label: string };
		const Scene = UniversalRuntime.defineUniversalComponent(
			'object',
			(props: { source: string }) => {
				const [value, , getter] = universalLinkedRuntime.__useLinkedStateWithGetter!(
					props.source,
					(source, previous) => {
						previousSources.push(previous?.source);
						return { label: source === 'third' ? 'changed' : 'unchanged' };
					},
					{ valueEqual: (previous, next) => previous.label === next.label },
					'linked',
				);
				getValue = getter!;
				return UniversalRuntime.universalValue(universalLinkedPlan, [value]);
			},
		);

		try {
			root.render(Scene, { source: 'first' });
			const original = getValue();
			root.render(Scene, { source: 'second' });
			expect(getValue()).toBe(original);
			root.render(Scene, { source: 'third' });
			expect(getValue()).toEqual({ label: 'changed' });
			expect(previousSources).toEqual([undefined, 'first', 'second']);
		} finally {
			root.unmount();
		}
	});

	it('keeps abandoned Suspense reconciliation invisible to getters and later committed sources', async () => {
		const objectContainer = UniversalRuntime.createObjectContainer();
		const root = UniversalRuntime.createUniversalRoot(
			objectContainer,
			UniversalRuntime.createObjectDriver(),
		);
		const blocker = deferred<string>();
		const previousSources: Array<string | undefined> = [];
		let getValue!: () => string;
		const Scene = UniversalRuntime.defineUniversalComponent(
			'object',
			(props: { source: string; suspend?: boolean }) => {
				const [value, , getter] = universalLinkedRuntime.__useLinkedStateWithGetter!(
					props.source,
					(source, previous) => {
						previousSources.push(previous?.source);
						return source;
					},
					'linked',
				);
				getValue = getter!;
				if (props.suspend) UniversalRuntime.use(blocker.promise);
				return UniversalRuntime.universalValue(universalLinkedPlan, [value]);
			},
		);

		try {
			root.render(Scene, { source: 'committed' });
			expect(getValue()).toBe('committed');
			const attempt = root.render(Scene, { source: 'abandoned', suspend: true });
			expect(attempt.status).toBe('suspended');
			expect(universalValues(objectContainer)).toEqual({ 'linked-state': 'committed' });
			expect(getValue()).toBe('committed');

			root.render(Scene, { source: 'replacement' });
			expect(universalValues(objectContainer)).toEqual({ 'linked-state': 'replacement' });
			expect(previousSources).toEqual([undefined, 'committed', 'committed']);
			expect(getValue()).toBe('replacement');

			blocker.resolve('late');
			await flushUniversalWork();
			expect(universalValues(objectContainer)).toEqual({ 'linked-state': 'replacement' });
			expect(getValue()).toBe('replacement');
		} finally {
			root.unmount();
		}
	});

	it('keeps retained hidden Suspense content anchored to its last committed linked source', async () => {
		const objectContainer = UniversalRuntime.createObjectContainer();
		const root = UniversalRuntime.createUniversalRoot(
			objectContainer,
			UniversalRuntime.createObjectDriver(),
		);
		const blocker = deferred<string>();
		const previousValues: Array<{ source: string; value: string } | undefined> = [];
		let linked!: CapturedLinked<string>;
		const fallbackPlan = UniversalRuntime.universalPlan('object', {
			kind: 'host',
			type: 'linked-pending',
			props: { value: 'loading' },
		});
		const Scene = UniversalRuntime.defineUniversalComponent(
			'object',
			(props: { source: string; suspend?: boolean }) =>
				UniversalRuntime.universalTry(
					() => {
						const [value, setValue, getValue] = universalLinkedRuntime.__useLinkedStateWithGetter!(
							props.source,
							(source, previous) => {
								previousValues.push(previous);
								return source;
							},
							'linked',
						);
						linked = { value, setValue, getValue: getValue! };
						if (props.suspend) UniversalRuntime.use(blocker.promise);
						return UniversalRuntime.universalValue(universalLinkedPlan, [value]);
					},
					() => UniversalRuntime.universalValue(fallbackPlan),
				),
		);

		try {
			root.render(Scene, { source: 'first' });
			linked.setValue('edited first');
			UniversalRuntime.flushUniversalSync(() => {});
			expect(linked.getValue()).toBe('edited first');

			root.render(Scene, { source: 'discarded', suspend: true });
			expect(universalValues(objectContainer)).toEqual({
				'linked-state': 'edited first',
				'linked-pending': 'loading',
			});
			expect(linked.getValue()).toBe('edited first');
			linked.setValue((previous) => `${previous}!`);
			UniversalRuntime.flushUniversalSync(() => {});
			expect(universalValues(objectContainer)).toEqual({
				'linked-state': 'edited first',
				'linked-pending': 'loading',
			});
			expect(linked.getValue()).toBe('edited first');

			root.render(Scene, { source: 'accepted' });
			expect(universalValues(objectContainer)).toEqual({ 'linked-state': 'accepted' });
			expect(previousValues.at(-1)).toEqual({ source: 'first', value: 'edited first' });
			expect(linked.getValue()).toBe('accepted');

			blocker.resolve('late');
			await flushUniversalWork();
			expect(universalValues(objectContainer)).toEqual({ 'linked-state': 'accepted' });
		} finally {
			root.unmount();
		}
	});

	it('retains universal event edits with an inline comparator while a replacement source waits behind Suspense', async () => {
		const objectContainer = UniversalRuntime.createObjectContainer();
		const root = UniversalRuntime.createUniversalRoot(
			objectContainer,
			UniversalRuntime.createObjectDriver(),
		);
		const blocker = deferred<string>();
		let linked!: CapturedLinked<string>;
		const fallbackPlan = UniversalRuntime.universalPlan('object', {
			kind: 'host',
			type: 'linked-pending',
			props: { value: 'loading' },
		});
		const Scene = UniversalRuntime.defineUniversalComponent(
			'object',
			(props: { source: string; suspend?: boolean }) =>
				UniversalRuntime.universalTry(
					() => {
						const [value, setValue, getValue] = universalLinkedRuntime.__useLinkedStateWithGetter!(
							props.source,
							(source) => `draft:${source}`,
							{ valueEqual: (previous, next) => Object.is(previous, next) },
							'linked',
						);
						linked = { value, setValue, getValue: getValue! };
						if (props.suspend) UniversalRuntime.use(blocker.promise);
						return UniversalRuntime.universalValue(universalLinkedPlan, [value]);
					},
					() => UniversalRuntime.universalValue(fallbackPlan),
				),
		);

		try {
			root.render(Scene, { source: 'A' });
			root.render(Scene, { source: 'B', suspend: true });
			expect(linked.getValue()).toBe('draft:A');
			linked.setValue((previous) => `${previous}!`);
			linked.setValue((previous) => `${previous}?`);
			expect(linked.getValue()).toBe('draft:A');
			UniversalRuntime.flushUniversalSync(() => {});
			expect(universalValues(objectContainer)).toEqual({
				'linked-state': 'draft:A',
				'linked-pending': 'loading',
			});
			blocker.resolve('ready');
			await flushUniversalWork();

			expect(universalValues(objectContainer)).toEqual({ 'linked-state': 'draft:B!?' });
			expect(linked.getValue()).toBe('draft:B!?');
		} finally {
			root.unmount();
		}
	});

	it('honors the latest inline comparator for edits to a hidden replacement source', async () => {
		const objectContainer = UniversalRuntime.createObjectContainer();
		const root = UniversalRuntime.createUniversalRoot(
			objectContainer,
			UniversalRuntime.createObjectDriver(),
		);
		const blocker = deferred<string>();
		let linked!: CapturedLinked<string>;
		const fallbackPlan = UniversalRuntime.universalPlan('object', {
			kind: 'host',
			type: 'linked-pending',
			props: { value: 'loading' },
		});
		const Scene = UniversalRuntime.defineUniversalComponent(
			'object',
			(props: { source: string; suspend?: boolean; ignoreCase?: boolean }) =>
				UniversalRuntime.universalTry(
					() => {
						const [value, setValue, getValue] = universalLinkedRuntime.__useLinkedStateWithGetter!(
							props.source,
							(source) => `draft:${source}`,
							{
								valueEqual: (previous, next) =>
									props.ignoreCase
										? previous.toLowerCase() === next.toLowerCase()
										: Object.is(previous, next),
							},
							'linked',
						);
						linked = { value, setValue, getValue: getValue! };
						if (props.suspend) UniversalRuntime.use(blocker.promise);
						return UniversalRuntime.universalValue(universalLinkedPlan, [value]);
					},
					() => UniversalRuntime.universalValue(fallbackPlan),
				),
		);

		try {
			root.render(Scene, { source: 'A' });
			root.render(Scene, { source: 'B', suspend: true });
			linked.setValue((previous) => `${previous}!`);
			UniversalRuntime.flushUniversalSync(() => {});

			root.render(Scene, { source: 'B', suspend: true, ignoreCase: true });
			linked.setValue('DRAFT:B!');
			linked.setValue((previous) => `${previous}?`);
			UniversalRuntime.flushUniversalSync(() => {});
			expect(linked.getValue()).toBe('draft:A');

			blocker.resolve('ready');
			await flushUniversalWork();

			expect(universalValues(objectContainer)).toEqual({ 'linked-state': 'draft:B!?' });
			expect(linked.getValue()).toBe('draft:B!?');
		} finally {
			root.unmount();
		}
	});

	it('keeps an old transition out of committed reads while its replacement source is hidden', async () => {
		const objectContainer = UniversalRuntime.createObjectContainer();
		const root = UniversalRuntime.createUniversalRoot(
			objectContainer,
			UniversalRuntime.createObjectDriver(),
		);
		const transitionBlocker = deferred<void>();
		const suspenseBlocker = deferred<string>();
		const renderValues: string[] = [];
		let linked!: CapturedLinked<string>;
		const fallbackPlan = UniversalRuntime.universalPlan('object', {
			kind: 'host',
			type: 'linked-pending',
			props: { value: 'loading' },
		});
		const Scene = UniversalRuntime.defineUniversalComponent(
			'object',
			(props: { source: string; suspend?: boolean }) =>
				UniversalRuntime.universalTry(
					() => {
						const [value, setValue, getValue] = universalLinkedRuntime.__useLinkedStateWithGetter!(
							props.source,
							(source) => `draft:${source}`,
							'linked',
						);
						linked = { value, setValue, getValue: getValue! };
						if (props.suspend) {
							renderValues.push(getValue!());
							UniversalRuntime.use(suspenseBlocker.promise);
						}
						return UniversalRuntime.universalValue(universalLinkedPlan, [value]);
					},
					() => UniversalRuntime.universalValue(fallbackPlan),
				),
		);

		try {
			root.render(Scene, { source: 'A' });
			UniversalRuntime.startTransition(async () => {
				linked.setValue('stale A');
				await transitionBlocker.promise;
			});
			expect(linked.getValue()).toBe('stale A');

			root.render(Scene, { source: 'B', suspend: true });
			root.render(Scene, { source: 'B', suspend: true });
			expect(renderValues.at(-1)).toBe('draft:B');
			expect(universalValues(objectContainer)).toEqual({
				'linked-state': 'draft:A',
				'linked-pending': 'loading',
			});
			expect(linked.getValue()).toBe('draft:A');

			transitionBlocker.resolve();
			await flushUniversalWork();
			expect(linked.getValue()).toBe('draft:A');
			expect(universalValues(objectContainer)).toEqual({
				'linked-state': 'draft:A',
				'linked-pending': 'loading',
			});

			suspenseBlocker.resolve('ready');
			await flushUniversalWork();
			expect(universalValues(objectContainer)).toEqual({ 'linked-state': 'draft:B' });
			expect(linked.getValue()).toBe('draft:B');
		} finally {
			transitionBlocker.resolve();
			suspenseBlocker.resolve('late');
			await flushUniversalWork();
			root.unmount();
		}
	});

	it('preserves a pending edit when a hidden replacement source is abandoned', async () => {
		const objectContainer = UniversalRuntime.createObjectContainer();
		const root = UniversalRuntime.createUniversalRoot(
			objectContainer,
			UniversalRuntime.createObjectDriver(),
		);
		const transitionBlocker = deferred<void>();
		const suspenseBlocker = deferred<string>();
		let linked!: CapturedLinked<string>;
		const fallbackPlan = UniversalRuntime.universalPlan('object', {
			kind: 'host',
			type: 'linked-pending',
			props: { value: 'loading' },
		});
		const Scene = UniversalRuntime.defineUniversalComponent(
			'object',
			(props: { source: string; suspend?: boolean }) =>
				UniversalRuntime.universalTry(
					() => {
						const [value, setValue, getValue] = universalLinkedRuntime.__useLinkedStateWithGetter!(
							props.source,
							(source) => `draft:${source}`,
							'linked',
						);
						linked = { value, setValue, getValue: getValue! };
						if (props.suspend) UniversalRuntime.use(suspenseBlocker.promise);
						return UniversalRuntime.universalValue(universalLinkedPlan, [value]);
					},
					() => UniversalRuntime.universalValue(fallbackPlan),
				),
		);

		try {
			root.render(Scene, { source: 'A' });
			UniversalRuntime.startTransition(async () => {
				linked.setValue('legitimate A edit');
				await transitionBlocker.promise;
			});
			root.render(Scene, { source: 'B', suspend: true });
			expect(linked.getValue()).toBe('draft:A');

			root.render(Scene, { source: 'A' });
			expect(universalValues(objectContainer)).toEqual({ 'linked-state': 'draft:A' });
			expect(linked.getValue()).toBe('legitimate A edit');

			transitionBlocker.resolve();
			await flushUniversalWork();
			expect(universalValues(objectContainer)).toEqual({ 'linked-state': 'legitimate A edit' });
			expect(linked.getValue()).toBe('legitimate A edit');

			suspenseBlocker.resolve('late');
			await flushUniversalWork();
			expect(universalValues(objectContainer)).toEqual({ 'linked-state': 'legitimate A edit' });
		} finally {
			transitionBlocker.resolve();
			suspenseBlocker.resolve('late');
			await flushUniversalWork();
			root.unmount();
		}
	});

	it('discards an older transition edit when an urgent source change replaces its generation', async () => {
		const objectContainer = UniversalRuntime.createObjectContainer();
		const root = UniversalRuntime.createUniversalRoot(
			objectContainer,
			UniversalRuntime.createObjectDriver(),
		);
		let setValue!: (next: string) => void;
		const Scene = UniversalRuntime.defineUniversalComponent(
			'object',
			(props: { source: string }) => {
				const [value, update] = universalLinkedRuntime.useLinkedState!(
					props.source,
					(source) => `draft:${source}`,
					'linked',
				);
				setValue = update;
				return UniversalRuntime.universalValue(universalLinkedPlan, [value]);
			},
		);

		try {
			root.render(Scene, { source: 'first' });
			UniversalRuntime.startTransition(() => setValue('stale first edit'));
			root.render(Scene, { source: 'second' });
			await flushUniversalWork();

			expect(universalValues(objectContainer)).toEqual({ 'linked-state': 'draft:second' });
		} finally {
			root.unmount();
		}
	});

	it('rebases later functional edits on the new source while an old transition stays pending', async () => {
		const objectContainer = UniversalRuntime.createObjectContainer();
		const root = UniversalRuntime.createUniversalRoot(
			objectContainer,
			UniversalRuntime.createObjectDriver(),
		);
		let linked!: CapturedLinked<string>;
		const Scene = UniversalRuntime.defineUniversalComponent(
			'object',
			(props: { source: string }) => {
				const [value, setValue, getValue] = universalLinkedRuntime.__useLinkedStateWithGetter!(
					props.source,
					(source) => `draft:${source}`,
					'linked',
				);
				linked = { value, setValue, getValue: getValue! };
				return UniversalRuntime.universalValue(universalLinkedPlan, [value]);
			},
		);

		try {
			root.render(Scene, { source: 'first' });
			expect(linked.getValue()).toBe('draft:first');
			UniversalRuntime.startTransition(() => linked.setValue('stale first edit'));
			root.render(Scene, { source: 'second' });
			expect(linked.getValue()).toBe('draft:second');
			linked.setValue((previous) => `${previous}!`);
			linked.setValue((previous) => `${previous}?`);
			UniversalRuntime.flushUniversalSync(() => {});
			expect(universalValues(objectContainer)).toEqual({ 'linked-state': 'draft:second!?' });
			expect(linked.getValue()).toBe('draft:second!?');

			await flushUniversalWork();
			expect(universalValues(objectContainer)).toEqual({ 'linked-state': 'draft:second!?' });
			expect(linked.getValue()).toBe('draft:second!?');
		} finally {
			root.unmount();
		}
	});
});
