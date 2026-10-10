import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../src/runtime.js';
import { createScope, type Scope } from '../src/signals/index.js';
import * as collectorModule from '../src/signals/native-read-collector.js';
import { mount, type MountResult } from './_helpers.js';

// A real overflow lands wherever the engine's stack budget runs out, so it
// cannot target one call. The entry cases arm the same native error at the
// collector's entry, the site of the reported Safari failure.
const collectorEntry = { failAt: 0 };
const createCollector = collectorModule.createNativeReadCollector;
vi.spyOn(collectorModule, 'createNativeReadCollector').mockImplementation((onRead) => {
	const collector = createCollector(onRead);
	const beginRender = collector.beginRender;
	collector.beginRender = (next) => {
		if (collectorEntry.failAt !== 0 && --collectorEntry.failAt === 0)
			throw new RangeError('Maximum call stack size exceeded');
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
