import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../src/runtime.js';
import { createScope, type Scope } from '../src/signals/index.js';
import { SignalObserver } from '../src/signals/graph.js';
import * as collectorModule from '../src/signals/native-read-collector.js';
import type { NativeReadSource } from '../src/signals/read-protocol.js';
import { mount, type MountResult } from './_helpers.js';

// A real overflow lands wherever the engine's stack budget runs out, so it
// cannot target one call. The entry cases arm the same native error at the
// collector's entry, the site of the reported Safari failure. The subscription
// cases arm it where a render records its read's subscription, or where a failed
// render releases one.
const overflow = () => new RangeError('Maximum call stack size exceeded');
const collectorEntry = { failAt: 0 };
const subscription = { attachFailAt: 0, recordFailAt: 0, disposeFailAt: 0 };
const armedSources = new WeakMap<NativeReadSource, NativeReadSource>();
function armed(source: NativeReadSource): NativeReadSource {
	let wrapper = armedSources.get(source);
	if (wrapper === undefined) {
		wrapper = {
			getVersion: () => source.getVersion(),
			retired: () => source.retired?.() ?? false,
			serialize: (version) => source.serialize?.(version),
			subscribe(notify) {
				const dispose = source.subscribe(notify);
				return () => {
					if (subscription.disposeFailAt !== 0 && --subscription.disposeFailAt === 0)
						throw overflow();
					dispose();
				};
			},
		};
		armedSources.set(source, wrapper);
	}
	return wrapper;
}
// A consumer records each subscription in a Map; a growing Map can exhaust the stack.
const setEntry = Map.prototype.set;
function recordFailing<K, V>(this: Map<K, V>, key: K, value: V): Map<K, V> {
	if (
		subscription.recordFailAt !== 0 &&
		typeof value === 'object' &&
		value !== null &&
		'leases' in value &&
		--subscription.recordFailAt === 0
	)
		throw overflow();
	return setEntry.call(this, key, value) as Map<K, V>;
}
// Its owner's Set of observers can too, as a subscription attaches.
const addMember = Set.prototype.add;
function attachFailing<T>(this: Set<T>, value: T): Set<T> {
	if (
		subscription.attachFailAt !== 0 &&
		value instanceof SignalObserver &&
		--subscription.attachFailAt === 0
	)
		throw overflow();
	return addMember.call(this, value) as Set<T>;
}
const createCollector = collectorModule.createNativeReadCollector;
vi.spyOn(collectorModule, 'createNativeReadCollector').mockImplementation((onRead) => {
	const collector = createCollector((owner, source, version) =>
		onRead(owner, armed(source), version),
	);
	const beginRender = collector.beginRender;
	collector.beginRender = (next) => {
		if (collectorEntry.failAt !== 0 && --collectorEntry.failAt === 0) throw overflow();
		return beginRender(next);
	};
	return collector;
});
client.enableNativeReadCollection();

describe('signal writes after a render exhausts the native stack', () => {
	const scopes: Scope[] = [];
	let rendered: MountResult | undefined;

	afterEach(() => {
		collectorEntry.failAt = 0;
		subscription.attachFailAt = 0;
		subscription.recordFailAt = 0;
		subscription.disposeFailAt = 0;
		Map.prototype.set = setEntry;
		Set.prototype.add = addMember;
		rendered?.unmount();
		rendered = undefined;
		for (const scope of scopes) scope.dispose();
		scopes.length = 0;
	});

	function source$(scopeKey: string) {
		const scope = createScope({ scopeKey });
		scopes.push(scope);
		return scope.signal$('value', 0);
	}

	function Reader({ value$, depth }: { value$: ReturnType<typeof source$>; depth: number }) {
		const value = value$.get();
		return depth > 0
			? client.createElement(Reader, { value$, depth: depth - 1 })
			: client.createElement('output', null, String(value));
	}

	// A failed render must not leave subscriptions behind for its discarded reads.
	function subscribers() {
		return scopes
			.flatMap((scope) => scope.inspect().nodes)
			.reduce((total, node) => total + node.subscribers, 0);
	}

	// The surviving tree must still render and subscribe, not merely accept writes.
	function expectLiveRender(value$: ReturnType<typeof source$>, next: number) {
		rendered = mount(Reader, { value$, depth: 2 });
		client.flushSync(() => value$.set(next));
		expect(rendered.find('output').textContent).toBe(String(next));
	}

	it('allows a write after recursion overflows during render or its cleanup', () => {
		const value$ = source$('stack-overflow-recursion');
		function callAtDepth(frames: number, run: () => void): void {
			if (frames === 0) run();
			else callAtDepth(frames - 1, run);
		}
		// Each caller depth moves where the engine runs out of stack.
		for (let frames = 0; frames < 32; frames++) {
			const container = document.createElement('div');
			const root = client.createRoot(container);
			let failure: unknown;
			callAtDepth(frames, () => {
				try {
					root.render(Reader, { value$, depth: 1e6 });
				} catch (error) {
					failure = error;
				}
			});
			expect(failure).toBeInstanceOf(RangeError);
			expect(() => value$.set(frames + 1)).not.toThrow();
			root.unmount();
		}
		expect(subscribers()).toBe(0);
		expectLiveRender(value$, 100);
	});

	it.each([
		['a child', 2],
		['a grandchild', 3],
	])('allows a write after %s overflows while entering its render', (_owner, failAt) => {
		const value$ = source$('stack-overflow-render-entry');
		collectorEntry.failAt = failAt;
		let failure: unknown;
		try {
			rendered = mount(Reader, { value$, depth: 2 });
		} catch (error) {
			failure = error;
		}
		expect(failure).toBeInstanceOf(RangeError);
		expect(collectorEntry.failAt).toBe(0);
		expect(() => value$.set(1)).not.toThrow();
		expect(subscribers()).toBe(0);
		expectLiveRender(value$, 2);
	});

	it.each([
		[
			// The child's read attaches its observer after its parent's read.
			'subscribes to its read',
			() => {
				subscription.attachFailAt = 2;
				Set.prototype.add = attachFailing;
			},
		],
		[
			// The child's read records its subscription after its parent's read.
			'records its read',
			() => {
				subscription.recordFailAt = 2;
				Map.prototype.set = recordFailing;
			},
		],
		[
			// The grandchild overflows entering its render, and releasing its
			// parent's read then exhausts the stack too.
			'releases its read',
			() => {
				collectorEntry.failAt = 3;
				subscription.disposeFailAt = 1;
			},
		],
	])('leaves no subscription when a failed render overflows as it %s', (_site, arm) => {
		const value$ = source$('stack-overflow-subscription');
		arm();
		let failure: unknown;
		try {
			rendered = mount(Reader, { value$, depth: 2 });
		} catch (error) {
			failure = error;
		}
		Map.prototype.set = setEntry;
		Set.prototype.add = addMember;
		expect(failure).toBeInstanceOf(RangeError);
		expect([collectorEntry.failAt, ...Object.values(subscription)]).toEqual([0, 0, 0, 0]);
		expect(() => value$.set(1)).not.toThrow();
		expect(subscribers()).toBe(0);
		expectLiveRender(value$, 2);
	});

	it('keeps a later root updating after a root overflows while entering', async () => {
		const value$ = source$('stack-overflow-root-entry');
		collectorEntry.failAt = 1;
		expect(() => mount(Reader, { value$, depth: 2 })).toThrow(RangeError);
		// More updates than the nested-update limit: none may count as nested
		// inside the failed render.
		rendered = mount(Reader, { value$, depth: 0 });
		for (let depth = 1; depth <= 60; depth++) {
			rendered.root.render(Reader, { value$, depth });
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(rendered.container.textContent).toBe('0');
		}
		client.flushSync(() => value$.set(1));
		expect(rendered.container.textContent).toBe('1');
	});

	it('keeps a parent subscribed after its @try catches a child that overflowed while entering', async () => {
		// A static import would create the native driver before the collector spy.
		const { CaughtReader } = await import('./_fixtures/native-read-collection.tsrx');
		const count$ = source$('stack-overflow-caught-entry');
		collectorEntry.failAt = 2;
		rendered = mount(CaughtReader, { count$ });
		expect(collectorEntry.failAt).toBe(0);
		expect(rendered.container.textContent).toBe('caught0');
		client.flushSync(() => count$.set(1));
		expect(rendered.container.textContent).toBe('caught1');
	});
});
