import { afterEach, describe, expect, it, vi } from 'vitest';
import { compile } from 'octane/compiler';
import { bootstrapIndependentHydration } from '../../src/hydration/independent-island.js';
import { independentHydrationStrategies } from '../../src/hydration/independent-strategies.js';
import { renderToString } from '../../src/runtime.server.js';
import { evaluateCompiledFixtureCode } from '../_server-fixture.js';

const FILE = '/project/src/Widget.tsrx';

function source(when: string): string {
	return `import { Hydrate } from 'octane';
import { load, idle, interaction, media, never, visible, condition } from 'octane/hydration';
export function App(props) @{
  <Hydrate independent when={${when}}>
    <button type="button">{'x'}</button>
  </Hydrate>
}`;
}

function serverHtml(when: string, props?: Record<string, unknown>): string {
	const server = evaluateCompiledFixtureCode(
		compile(source(when), FILE, { mode: 'server' }).code,
		FILE,
		'server',
		undefined,
	);
	return renderToString(server.App, props, {
		independentHydration: { buildId: 'b', resolve: (moduleId) => ({ moduleId, styles: [] }) },
	}).html;
}

async function settle(): Promise<void> {
	for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

// Passing the strategies arms a trigger during registration. Without them, the
// island loads the built-in strategies on demand and arms once they resolve.
function mount(when: string, { onDemand = false } = {}) {
	const host = document.createElement('main');
	host.innerHTML = serverHtml(when);
	document.body.append(host);
	const loads: string[] = [];
	const errors: unknown[] = [];
	const lifecycle = bootstrapIndependentHydration(host, {
		buildId: 'b',
		loadStyles() {},
		async loadModule(moduleId) {
			loads.push(moduleId);
			return { default: () => ({ unmount() {} }) };
		},
		...(onDemand ? {} : { strategies: independentHydrationStrategies }),
		onError: (error) => errors.push(error),
	});
	const wrapper = host.querySelector('[data-octane-hydrate-when]')!;
	return {
		wrapper,
		loads,
		errors,
		lifecycle,
		cleanup() {
			lifecycle();
			host.remove();
		},
	};
}

class FakeMediaQueryList {
	matches = false;
	readonly listeners = new Set<() => void>();
	constructor(readonly media: string) {}
	addEventListener(_type: 'change', listener: () => void): void {
		this.listeners.add(listener);
	}
	removeEventListener(_type: 'change', listener: () => void): void {
		this.listeners.delete(listener);
	}
	change(matches: boolean): void {
		this.matches = matches;
		for (const listener of [...this.listeners]) listener();
	}
}

function stubMatchMedia(): FakeMediaQueryList[] {
	const lists: FakeMediaQueryList[] = [];
	vi.stubGlobal('matchMedia', (query: string) => {
		const list = new FakeMediaQueryList(query);
		lists.push(list);
		return list;
	});
	return lists;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('independent Hydrate automatic strategies', () => {
	it('activates idle() from an idle callback using the serialized timeout', async () => {
		const callbacks: Array<() => void> = [];
		const timeouts: unknown[] = [];
		vi.stubGlobal('requestIdleCallback', (callback: () => void, options?: { timeout?: number }) => {
			callbacks.push(callback);
			timeouts.push(options?.timeout);
			return callbacks.length;
		});
		vi.stubGlobal('cancelIdleCallback', () => {});
		const view = mount('idle({ timeout: 125 })');
		try {
			expect(view.wrapper.getAttribute('data-octane-hydrate-when')).toBe('idle');
			expect(timeouts).toEqual([125]);
			await settle();
			expect(view.loads).toEqual([]);
			callbacks[0]!();
			await settle();
			expect(view.loads).toHaveLength(1);
		} finally {
			view.cleanup();
		}
	});

	it('activates visible() only after its element intersects, with serialized observer options', async () => {
		const observers: Array<{
			callback: IntersectionObserverCallback;
			options: IntersectionObserverInit | undefined;
			targets: Set<Element>;
		}> = [];
		vi.stubGlobal(
			'IntersectionObserver',
			class {
				readonly record;
				constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
					this.record = { callback, options, targets: new Set<Element>() };
					observers.push(this.record);
				}
				observe(target: Element) {
					this.record.targets.add(target);
				}
				unobserve(target: Element) {
					this.record.targets.delete(target);
				}
				disconnect() {
					this.record.targets.clear();
				}
			},
		);
		const view = mount("visible({ rootMargin: '10px', threshold: [0, 0.5] })");
		try {
			expect(observers).toHaveLength(1);
			expect(observers[0]!.options).toEqual({ rootMargin: '10px', threshold: [0, 0.5] });
			expect([...observers[0]!.targets]).toEqual([view.wrapper]);
			await settle();
			expect(view.loads).toEqual([]);
			observers[0]!.callback(
				[{ isIntersecting: true, target: view.wrapper } as unknown as IntersectionObserverEntry],
				{} as IntersectionObserver,
			);
			await settle();
			expect(view.loads).toHaveLength(1);
			expect(observers[0]!.targets.size).toBe(0);
		} finally {
			view.cleanup();
		}
	});

	it('activates media() when its serialized query starts matching, and stops listening', async () => {
		const lists: FakeMediaQueryList[] = [];
		vi.stubGlobal('matchMedia', (query: string) => {
			const list = new FakeMediaQueryList(query);
			lists.push(list);
			return list;
		});
		const view = mount("media('(min-width: 900px)')");
		try {
			expect(lists.map((list) => list.media)).toEqual(['(min-width: 900px)']);
			await settle();
			expect(view.loads).toEqual([]);
			lists[0]!.change(true);
			await settle();
			expect(view.loads).toHaveLength(1);
			expect(lists[0]!.listeners.size).toBe(0);
		} finally {
			view.cleanup();
		}
	});

	it('disarms a pending trigger across pause and dispose, and re-arms it on resume', async () => {
		const lists: FakeMediaQueryList[] = [];
		vi.stubGlobal('matchMedia', (query: string) => {
			const list = new FakeMediaQueryList(query);
			lists.push(list);
			return list;
		});
		const view = mount("media('print')");
		try {
			expect(lists[0]!.listeners.size).toBe(1);
			view.lifecycle.pause();
			expect(lists[0]!.listeners.size).toBe(0);
			lists[0]!.change(true);
			await settle();
			expect(view.loads).toEqual([]);

			lists[0]!.change(false);
			view.lifecycle.resume();
			expect(lists).toHaveLength(2);
			expect(lists[1]!.listeners.size).toBe(1);
			view.lifecycle();
			expect(lists[1]!.listeners.size).toBe(0);
			lists[1]!.change(true);
			await settle();
			expect(view.loads).toEqual([]);
		} finally {
			view.cleanup();
		}
	});

	it('activates a trigger that already matches on resume', async () => {
		let matches = false;
		vi.stubGlobal('matchMedia', (query: string) => {
			const list = new FakeMediaQueryList(query);
			list.matches = matches;
			return list;
		});
		const view = mount("media('print')");
		try {
			view.lifecycle.pause();
			matches = true;
			view.lifecycle.resume();
			await settle();
			expect(view.loads).toHaveLength(1);
		} finally {
			view.cleanup();
		}
	});

	it('loads omitted strategies on demand, then arms and activates the trigger', async () => {
		const lists = stubMatchMedia();
		const view = mount("media('(min-width: 900px)')", { onDemand: true });
		try {
			await vi.waitFor(() => expect(lists.map((list) => list.listeners.size)).toEqual([1]));
			expect(lists[0]!.media).toBe('(min-width: 900px)');
			expect(view.loads).toEqual([]);
			lists[0]!.change(true);
			await settle();
			expect(view.loads).toHaveLength(1);
			expect(lists[0]!.listeners.size).toBe(0);
			expect(view.errors).toEqual([]);
		} finally {
			view.cleanup();
		}
	});

	it('honors dispose and pause that land before on-demand strategies resolve', async () => {
		const lists = stubMatchMedia();
		const disposed = mount("media('(min-width: 1px)')", { onDemand: true });
		const paused = mount("media('(min-width: 2px)')", { onDemand: true });
		// Both islands wait on the same load, so this one arming witnesses that the
		// others had their chance to arm too.
		const witness = mount("media('(min-width: 3px)')", { onDemand: true });
		try {
			disposed.lifecycle();
			paused.lifecycle.pause();
			await vi.waitFor(() => expect(lists.map((list) => list.media)).toContain('(min-width: 3px)'));
			await settle();
			expect(lists.map((list) => list.media)).toEqual(['(min-width: 3px)']);

			paused.lifecycle.resume();
			expect(lists.map((list) => list.media)).toEqual(['(min-width: 3px)', '(min-width: 2px)']);
			expect(lists[1]!.listeners.size).toBe(1);
			lists[1]!.change(true);
			await settle();
			expect(paused.loads).toHaveLength(1);
			expect(disposed.loads).toEqual([]);
		} finally {
			disposed.cleanup();
			paused.cleanup();
			witness.cleanup();
		}
	});

	it('reports a trigger that fails to arm after on-demand strategies resolve', async () => {
		const failure = new Error('matchMedia unavailable');
		vi.stubGlobal('matchMedia', () => {
			throw failure;
		});
		const view = mount("media('print')", { onDemand: true });
		try {
			await vi.waitFor(() => expect(view.errors).toEqual([failure]));
			expect(view.loads).toEqual([]);
		} finally {
			view.cleanup();
		}
	});

	it('keeps interaction() and never() inert without an intent', async () => {
		for (const when of ['interaction()', 'never()']) {
			const view = mount(when);
			try {
				await settle();
				expect(view.loads).toEqual([]);
			} finally {
				view.cleanup();
			}
		}
	});

	it('serializes only non-default strategy parameters', () => {
		expect(serverHtml('idle()')).not.toContain('data-octane-hydrate-timeout');
		expect(serverHtml('visible()')).not.toContain('data-octane-hydrate-root-margin');
		expect(serverHtml('visible({ threshold: 1 })')).toContain('data-octane-hydrate-threshold="1"');
		expect(serverHtml('visible({ threshold: 1 })')).not.toContain(
			'data-octane-hydrate-root-margin',
		);
	});

	it('rejects condition() and function-form when at compile time', () => {
		for (const when of ['condition(true)', '() => idle()']) {
			let thrown: unknown;
			try {
				compile(source(when), FILE, { mode: 'client' });
			} catch (error) {
				thrown = error;
			}
			expect(thrown).toMatchObject({ code: 'OCTANE_HYDRATE_INDEPENDENT_WHEN' });
		}
		// Ordinary parent-first boundaries still accept both forms.
		expect(() =>
			compile(source('condition(true)').replace('independent ', ''), FILE, { mode: 'client' }),
		).not.toThrow();
	});

	it('rejects an opaque when that resolves to condition() or a function at render time', () => {
		for (const [value, kind] of [
			[{ _t: 'condition' }, 'condition'],
			[() => ({ _t: 'idle' }), 'dynamic'],
		] as const) {
			expect(() => serverHtml('props.when', { when: value })).toThrow(`\`${kind}\` strategy`);
		}
	});
});
