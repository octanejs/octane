import { describe, expect, it, vi } from 'vitest';
import { createRoot, type ComponentBody } from '../src/index.js';
import {
	createObjectContainer,
	createObjectDriver,
	createUniversalRoot,
	defineUniversalComponent,
	rendererRegion,
	universalKey,
	universalPlan,
	universalValue,
	useState as useUniversalState,
	type ObjectHostInstance,
	type RendererRegion,
} from '../src/universal.js';
import {
	EffectEventCleanupScene,
	ExternalStoreWithoutServerScene,
	ExternalStoreWithServerScene,
	KeyedFreshPromiseScene,
	LocalFreshPromiseScene,
	OptimisticOmittedReducerScene,
	RecursiveMultiRefScene,
	RootFreshPromiseScene,
	UnkeyedHostIdentityScene,
	WrongOwnerRegionPropScene,
} from './_fixtures/universal-semantics-regressions.object.tsrx';
import { ReverseOwnerDom } from './_fixtures/universal-reverse-owner.tsrx';

function objectRoot() {
	const container = createObjectContainer();
	const root = createUniversalRoot(container, createObjectDriver());
	return { container, root };
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((onResolve, onReject) => {
		resolve = onResolve;
		reject = onReject;
	});
	return { promise, resolve, reject };
}

async function flushMicrotasks(count = 8): Promise<void> {
	for (let index = 0; index < count; index++) await Promise.resolve();
}

function allInstances(parent: { children: readonly ObjectHostInstance[] }): ObjectHostInstance[] {
	const output: ObjectHostInstance[] = [];
	for (const child of parent.children) output.push(child, ...allInstances(child));
	return output;
}

function instances(parent: { children: readonly ObjectHostInstance[] }, type: string) {
	return allInstances(parent).filter((instance) => instance.type === type);
}

function instance(parent: { children: readonly ObjectHostInstance[] }, type: string) {
	const match = instances(parent, type)[0];
	if (match === undefined) throw new Error(`Missing object host instance ${type}.`);
	return match;
}

function expectRegionUnusable(region: RendererRegion<any>): void {
	const element = document.createElement('div');
	document.body.appendChild(element);
	const root = createRoot(element);
	expect(() => root.render(region.component as ComponentBody<any>, region.props)).toThrow(
		/cannot attach before its universal region commits/,
	);
	root.unmount();
	element.remove();
}

interface FailedDraftProps {
	initial: string;
	text: string;
	duplicateKey: string;
	log: (entry: string) => void;
	captureState(value: {
		value: string;
		setValue: (value: string) => void;
		getValue: () => string;
	}): void;
	captureRegion(region: RendererRegion<any>): void;
}

const capabilityFailurePlan = universalPlan('object', {
	kind: 'host',
	type: 'capability-failure',
	bindings: [['region', 0]],
	children: [{ kind: 'text', slot: 1 }],
});
const duplicateChildPlan = universalPlan('object', { kind: 'host', type: 'duplicate-child' });
const duplicateKeyFailurePlan = universalPlan('object', {
	kind: 'host',
	type: 'duplicate-key-failure',
	bindings: [['region', 0]],
	children: [
		{ kind: 'slot', slot: 1 },
		{ kind: 'slot', slot: 2 },
	],
});

function captureFailedDraft(props: FailedDraftProps) {
	const [value, setValue, getValue] = useUniversalState(props.initial, 'escaped-state');
	props.captureState({ value, setValue, getValue });
	const region = rendererRegion('object', 'dom', ReverseOwnerDom, { log: props.log });
	props.captureRegion(region);
	return region;
}

const CapabilityFailureDraftScene = defineUniversalComponent('object', (props: FailedDraftProps) =>
	universalValue(capabilityFailurePlan, [captureFailedDraft(props), props.text]),
);

const DuplicateKeyFailureDraftScene = defineUniversalComponent(
	'object',
	(props: FailedDraftProps) => {
		const region = captureFailedDraft(props);
		const child = () => universalKey(props.duplicateKey, universalValue(duplicateChildPlan));
		return universalValue(duplicateKeyFailurePlan, [region, child(), child()]);
	},
);

describe('universal runtime semantic regressions', () => {
	it('retains fresh compiler-memoized promises through every initial suspension stratum', async () => {
		const { container, root } = objectRoot();
		const first = deferred<string>();
		const second = deferred<string>();
		const loadFirst = vi.fn(() => first.promise);
		const loadSecond = vi.fn(() => second.promise);
		const committed = vi.fn();

		const attempt = root.render(RootFreshPromiseScene, {
			input: 'initial',
			loadFirst,
			loadSecond,
			committed,
		});
		expect(attempt.status).toBe('suspended');
		expect(loadFirst).toHaveBeenCalledTimes(1);
		expect(loadSecond).not.toHaveBeenCalled();
		expect(container.commits).toHaveLength(0);

		first.resolve('first-value');
		await flushMicrotasks();
		expect(loadFirst).toHaveBeenCalledTimes(1);
		expect(loadSecond).toHaveBeenCalledOnce();
		expect(loadSecond).toHaveBeenCalledWith('initial', 'first-value');
		expect(container.commits).toHaveLength(0);

		second.resolve('second-value');
		await flushMicrotasks();
		expect(loadFirst).toHaveBeenCalledTimes(1);
		expect(loadSecond).toHaveBeenCalledTimes(1);
		expect(container.commits).toHaveLength(1);
		expect(instance(container, 'fresh-result').props).toMatchObject({
			input: 'initial',
			value: 'second-value',
		});
		expect(committed).toHaveBeenCalledOnce();
		root.unmount();
	});

	it('drops suspended memo replay state on explicit abort', async () => {
		const { container, root } = objectRoot();
		const firstLoads: ReturnType<typeof deferred<string>>[] = [];
		const loadFirst = vi.fn(() => {
			const value = deferred<string>();
			firstLoads.push(value);
			return value.promise;
		});
		const loadSecond = vi.fn(() => Promise.resolve('unused'));
		const props = {
			input: 'same-deps',
			loadFirst,
			loadSecond,
			committed: vi.fn(),
		};

		const aborted = root.render(RootFreshPromiseScene, props);
		expect(aborted.status).toBe('suspended');
		aborted.abort();
		firstLoads[0].resolve('aborted-value');
		await flushMicrotasks();
		expect(container.commits).toHaveLength(0);
		expect(loadFirst).toHaveBeenCalledOnce();

		const fresh = root.render(RootFreshPromiseScene, props);
		expect(fresh.status).toBe('suspended');
		expect(loadFirst).toHaveBeenCalledTimes(2);
		fresh.abort();
		root.unmount();
	});

	it('drops an older suspended memo replay when newer props supersede it', async () => {
		const { container, root } = objectRoot();
		const firstByInput = new Map<string, ReturnType<typeof deferred<string>>>();
		const secondByInput = new Map<string, ReturnType<typeof deferred<string>>>();
		const loadFirst = vi.fn((input: string) => {
			const value = deferred<string>();
			firstByInput.set(input, value);
			return value.promise;
		});
		const loadSecond = vi.fn((input: string) => {
			const value = deferred<string>();
			secondByInput.set(input, value);
			return value.promise;
		});
		const committed = vi.fn();

		root.render(RootFreshPromiseScene, {
			input: 'old',
			loadFirst,
			loadSecond,
			committed,
		});
		root.render(RootFreshPromiseScene, {
			input: 'new',
			loadFirst,
			loadSecond,
			committed,
		});
		firstByInput.get('old')!.resolve('old-first');
		await flushMicrotasks();
		expect(loadSecond.mock.calls.some(([input]) => input === 'old')).toBe(false);
		expect(container.commits).toHaveLength(0);

		firstByInput.get('new')!.resolve('new-first');
		await flushMicrotasks();
		expect(loadSecond.mock.calls.filter(([input]) => input === 'new')).toHaveLength(1);
		secondByInput.get('new')!.resolve('new-second');
		await flushMicrotasks();
		expect(container.commits).toHaveLength(1);
		expect(instance(container, 'fresh-result').props).toMatchObject({
			input: 'new',
			value: 'new-second',
		});
		expect(committed).toHaveBeenCalledOnce();
		root.unmount();
	});

	it('retains one fresh promise per changed dependency until the update commits', async () => {
		const { container, root } = objectRoot();
		const firstByInput = new Map<string, ReturnType<typeof deferred<string>>>();
		const secondByInput = new Map<string, ReturnType<typeof deferred<string>>>();
		const loadFirst = vi.fn((input: string) => {
			const value = deferred<string>();
			firstByInput.set(input, value);
			return value.promise;
		});
		const loadSecond = vi.fn((input: string) => {
			const value = deferred<string>();
			secondByInput.set(input, value);
			return value.promise;
		});
		const committed = vi.fn();
		const props = (input: string) => ({ input, loadFirst, loadSecond, committed });

		root.render(RootFreshPromiseScene, props('a'));
		firstByInput.get('a')!.resolve('first-a');
		await flushMicrotasks();
		secondByInput.get('a')!.resolve('second-a');
		await flushMicrotasks();
		expect(committed).toHaveBeenCalledTimes(1);
		const retained = instance(container, 'fresh-result');

		const update = root.render(RootFreshPromiseScene, props('b'));
		expect(update.status).toBe('suspended');
		expect(instance(container, 'fresh-result')).toBe(retained);
		expect(retained.props.value).toBe('second-a');
		firstByInput.get('b')!.resolve('first-b');
		await flushMicrotasks();
		expect(loadFirst.mock.calls.filter(([input]) => input === 'b')).toHaveLength(1);
		expect(loadSecond.mock.calls.filter(([input]) => input === 'b')).toHaveLength(1);
		expect(committed).toHaveBeenCalledTimes(1);

		secondByInput.get('b')!.resolve('second-b');
		await flushMicrotasks();
		expect(loadFirst.mock.calls.filter(([input]) => input === 'b')).toHaveLength(1);
		expect(loadSecond.mock.calls.filter(([input]) => input === 'b')).toHaveLength(1);
		expect(container.commits).toHaveLength(2);
		expect(instance(container, 'fresh-result').props.value).toBe('second-b');
		expect(committed).toHaveBeenCalledTimes(2);
		root.unmount();
	});

	it('replays a fresh promise discarded by a local pending arm exactly once', async () => {
		const { container, root } = objectRoot();
		const value = deferred<string>();
		const load = vi.fn(() => value.promise);

		root.render(LocalFreshPromiseScene, { input: 'local', load });
		expect(load).toHaveBeenCalledOnce();
		expect(instances(container, 'local-pending')).toHaveLength(1);

		value.resolve('ready');
		await flushMicrotasks();
		expect(load).toHaveBeenCalledOnce();
		expect(instances(container, 'local-pending')).toHaveLength(0);
		expect(instance(container, 'local-result').props.value).toBe('ready');
		root.unmount();
	});

	it('isolates replayed promises for keyed owners sharing a hook slot and dependencies', async () => {
		const { container, root } = objectRoot();
		const pending: ReturnType<typeof deferred<string>>[] = [];
		const load = vi.fn(() => {
			const value = deferred<string>();
			pending.push(value);
			return value.promise;
		});

		root.render(KeyedFreshPromiseScene, { items: [{ id: 'a' }, { id: 'b' }], load });
		expect(load).toHaveBeenCalledTimes(2);
		expect(instances(container, 'keyed-pending')).toHaveLength(2);
		pending[0].resolve('value-a');
		pending[1].resolve('value-b');
		await flushMicrotasks();

		expect(load).toHaveBeenCalledTimes(2);
		expect(instances(container, 'keyed-result').map((child) => child.props.value)).toEqual([
			'value-a',
			'value-b',
		]);
		root.unmount();
	});

	it('keeps Effect Events callable through deletion and root-unmount cleanup phases', async () => {
		const removed = objectRoot();
		const removalLog: string[] = [];
		removed.root.render(EffectEventCleanupScene, {
			show: true,
			value: 'removed',
			log: removalLog.push.bind(removalLog),
		});
		await flushMicrotasks();
		removed.root.render(EffectEventCleanupScene, {
			show: false,
			value: 'removed',
			log: removalLog.push.bind(removalLog),
		});
		expect(removalLog).toEqual(['insertion:removed', 'layout:removed']);
		// Teardown flushes the queued deletion cleanup without mounting passive
		// bodies from the remaining tree.
		removed.root.unmount();
		expect(removalLog).toEqual(['insertion:removed', 'layout:removed', 'passive:removed']);
		await flushMicrotasks();

		const unmounted = objectRoot();
		const unmountLog: string[] = [];
		unmounted.root.render(EffectEventCleanupScene, {
			show: true,
			value: 'unmounted',
			log: unmountLog.push.bind(unmountLog),
		});
		await flushMicrotasks();
		unmounted.root.unmount();
		expect(unmountLog).toEqual(['insertion:unmounted', 'layout:unmounted']);
		await flushMicrotasks();
		expect(unmountLog).toEqual(['insertion:unmounted', 'layout:unmounted', 'passive:unmounted']);
	});

	it('parses the compiler slot when useOptimistic omits its reducer', () => {
		const { container, root } = objectRoot();
		expect(() =>
			root.render(OptimisticOmittedReducerScene, { value: 'base', action: 'optimistic' }),
		).not.toThrow();
		expect(instance(container, 'optimistic-result').props.value).toBe('optimistic');
		root.unmount();
	});

	it.each([
		['omitted server snapshot', ExternalStoreWithoutServerScene],
		['present server snapshot', ExternalStoreWithServerScene],
	])('parses stable useSyncExternalStore slots with %s', (_label, Component) => {
		const { container, root } = objectRoot();
		const log: string[] = [];
		const store = (name: string, value: string) => ({
			getSnapshot: () => value,
			getServerSnapshot: () => `server-${value}`,
			subscribe: (_notify: () => void) => {
				log.push(`subscribe:${name}`);
				return () => log.push(`unsubscribe:${name}`);
			},
		});
		const first = store('first', 'one');
		const second = store('second', 'two');

		root.render(Component, { includeFirst: true, first, second });
		expect(log).toEqual(['subscribe:first', 'subscribe:second']);
		expect(instance(container, 'store-result').props.value).toBe('two');
		log.length = 0;
		root.render(Component, { includeFirst: false, first, second });
		expect(log).toEqual(['unsubscribe:first']);
		root.unmount();
		expect(log).toEqual(['unsubscribe:first', 'unsubscribe:second']);
	});

	it('uses strict positional identity for unkeyed host children', () => {
		const { container, root } = objectRoot();
		const refs: string[] = [];
		const targetRef = (value: ObjectHostInstance | null) =>
			refs.push(value === null ? 'detach' : `attach:${value.id}`);

		root.render(UnkeyedHostIdentityScene, { leading: true, targetRef });
		const first = instance(container, 'target');
		expect(refs).toEqual([`attach:${first.id}`]);
		root.render(UnkeyedHostIdentityScene, { leading: false, targetRef });
		const second = instance(container, 'target');

		expect(second).not.toBe(first);
		expect(refs).toEqual([`attach:${first.id}`, 'detach', `attach:${second.id}`]);
		root.unmount();
		expect(refs.at(-1)).toBe('detach');
	});

	it('attaches and cleans recursive multi-ref arrays without publishing aborted work', () => {
		const { container, root } = objectRoot();
		const log: string[] = [];
		const oldObject = { current: null as ObjectHostInstance | null };
		const nextObject = { current: null as ObjectHostInstance | null };
		const abortedObject = { current: null as ObjectHostInstance | null };
		const callback = (name: string) => (value: ObjectHostInstance | null) => {
			log.push(`${name}:${value === null ? 'detach' : 'attach'}`);
		};
		const cleanupCallback = (name: string) => (_value: ObjectHostInstance | null) => {
			log.push(`${name}:attach`);
			return () => log.push(`${name}:cleanup`);
		};
		const oldCallback = callback('old-callback');
		const oldCleanup = cleanupCallback('old-cleanup');
		const nextCallback = callback('next-callback');
		const nextCleanup = cleanupCallback('next-cleanup');
		const abortedCallback = callback('aborted-callback');
		const abortedCleanup = cleanupCallback('aborted-cleanup');

		root.render(RecursiveMultiRefScene, {
			callback: oldCallback,
			objectRef: oldObject,
			cleanupCallback: oldCleanup,
			value: 'old',
		});
		const host = instance(container, 'multi-ref-host');
		expect(log).toEqual(['old-callback:attach', 'old-cleanup:attach']);
		expect(oldObject.current).toBe(host);

		const aborted = root.prepare(RecursiveMultiRefScene, {
			callback: abortedCallback,
			objectRef: abortedObject,
			cleanupCallback: abortedCleanup,
			value: 'aborted',
		});
		expect(aborted.status).toBe('prepared');
		aborted.abort();
		expect(log).toEqual(['old-callback:attach', 'old-cleanup:attach']);
		expect(oldObject.current).toBe(host);
		expect(abortedObject.current).toBe(null);

		root.render(RecursiveMultiRefScene, {
			callback: nextCallback,
			objectRef: nextObject,
			cleanupCallback: nextCleanup,
			value: 'next',
		});
		expect(log).toEqual([
			'old-callback:attach',
			'old-cleanup:attach',
			'old-callback:detach',
			'old-cleanup:cleanup',
			'next-callback:attach',
			'next-cleanup:attach',
		]);
		expect(oldObject.current).toBe(null);
		expect(nextObject.current).toBe(host);

		root.unmount();
		expect(log.slice(-2)).toEqual(['next-callback:detach', 'next-cleanup:cleanup']);
		expect(nextObject.current).toBe(null);
	});

	it('rejects a renderer-region prop owned by a different renderer before host publication', () => {
		const { container, root } = objectRoot();
		const region = rendererRegion('other', 'dom', ReverseOwnerDom, { log: () => {} });

		expect(() => root.render(WrongOwnerRegionPropScene, { region })).toThrow(
			/region owner "other" cannot be committed by root "object"/,
		);
		expect(container.commits).toHaveLength(0);
		expect(container.instanceCount).toBe(0);
		expect(container.children).toEqual([]);
		root.unmount();
	});

	it.each([
		['capability validation', CapabilityFailureDraftScene],
		['duplicate-key reconciliation', DuplicateKeyFailureDraftScene],
	])('disposes escaped draft handles after %s fails', (failure, Component) => {
		const container = createObjectContainer();
		const driver =
			failure === 'capability validation'
				? { ...createObjectDriver(), capabilities: { text: 'reject' as const } }
				: createObjectDriver();
		const root = createUniversalRoot(container, driver);
		let state:
			| {
					value: string;
					setValue: (value: string) => void;
					getValue: () => string;
			  }
			| undefined;
		let region: RendererRegion<any> | undefined;
		const props = {
			initial: 'initial',
			text: 'unsupported text',
			duplicateKey: 'same',
			regionComponent: ReverseOwnerDom,
			log: () => {},
			captureState: (next: typeof state) => {
				state = next;
			},
			captureRegion: (next: RendererRegion<any>) => {
				region = next;
			},
		};

		expect(() => root.render(Component, props)).toThrow(
			failure === 'capability validation'
				? /rejects primitive text children/
				: /Duplicate universal child key same/,
		);
		expect(container.commits).toHaveLength(0);
		expect(container.instanceCount).toBe(0);
		expect(state).toBeDefined();
		expect(state!.value).toBe('initial');
		expect(state!.getValue()).toBe('initial');
		state!.setValue('must-not-publish');
		expect(state!.getValue()).toBe('initial');
		expect(region).toBeDefined();
		expectRegionUnusable(region!);
		expect(container.commits).toHaveLength(0);
		expect(container.instanceCount).toBe(0);
		root.unmount();
	});
});
