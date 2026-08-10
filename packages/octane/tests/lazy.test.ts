import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mount, act } from './_helpers';
import { flushSync, hydrateRoot, lazy } from '../src/index.js';
import { compile } from 'octane/compiler';
import { condition, never } from 'octane/hydration';
import * as Server from 'octane/server';
import { prerender } from 'octane/static';
import { loadCompiledFixtureSource } from './_server-fixture';
import { Greeting, Counter, LazyHost, LazyUpdateHost } from './_fixtures/lazy.tsrx';

// React's lazy(load) — code-splitting. The wrapper suspends into the nearest
// boundary until load()'s promise settles, then renders the loaded component.

function deferred<T>() {
	let resolve!: (v: T) => void;
	let reject!: (e: any) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

const LAZY_MODULE_SOURCE = `
	import { Hydrate, lazy, use } from 'octane';

	export const moduleLoaders = { first: null, second: null, dormant: null };
	const LazyFirst = lazy(() => moduleLoaders.first());
	const LazySecond = lazy(() => moduleLoaders.second());
	const LazyDormant = lazy(() => moduleLoaders.dormant());

	export function FirstModule() @{
		<button id="first-lazy-module">first</button>
	}

	export function SecondModule() @{
		<span id="second-lazy-module">second</span>
	}

	export function DormantModule() @{
		<button id="dormant-lazy-module">dormant</button>
	}

	function PendingData(props) @{
		const value = use(props.load(props.id));
		<span id="lazy-sibling-data">{value as string}</span>
	}

	export function LazyModuleHost(props) @{
		<section>
			@try {
				<>
					<PendingData id={props.id} load={props.load} />
					<LazyFirst />
					<LazySecond />
				</>
			} @pending {
				<span id="lazy-module-pending">loading</span>
			} @catch (error) {
				<span id="lazy-module-error">{error.message as string}</span>
			}
		</section>
	}

	export function DormantLazyHost(props) @{
		<main>
			@try {
				<>
					<PendingData id={props.id} load={props.load} />
					@if (props.id === 'updated') {
						<LazyFirst />
					}
				</>
			} @pending {
				<span id="outside-lazy-pending">loading</span>
			}
			<Hydrate when={props.when} split={false}>
				<LazyDormant />
			</Hydrate>
		</main>
	}

	export function ConditionalLazyHost(props) @{
		<section>
			@try {
				<>
					<PendingData id={props.id} load={props.load} />
					@if (props.enabled) {
						<LazyFirst />
					}
				</>
			} @pending {
				<span id="conditional-lazy-pending">loading</span>
			}
		</section>
	}
`;

describe('lazy — client', () => {
	it('starts eligible lazy modules alongside an earlier pending sibling', async () => {
		const client = loadCompiledFixtureSource(LAZY_MODULE_SOURCE, {
			id: 'parallel-lazy-modules.tsrx',
			mode: 'client',
			compileOptions: { hmr: false, dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod' },
		});
		const data = deferred<string>();
		const first = deferred<any>();
		const second = deferred<any>();
		const loadData = vi.fn(() => data.promise);
		const loadFirst = vi.fn(() => first.promise);
		const loadSecond = vi.fn(() => second.promise);
		client.moduleLoaders.first = loadFirst;
		client.moduleLoaders.second = loadSecond;
		let defaultReads = 0;
		const root = mount(client.LazyModuleHost, { id: 'initial', load: loadData });

		try {
			expect(loadData).toHaveBeenCalledExactlyOnceWith('initial');
			expect(loadFirst).toHaveBeenCalledOnce();
			expect(loadSecond).toHaveBeenCalledOnce();
			expect(root.find('#lazy-module-pending').textContent).toBe('loading');

			await act(() =>
				first.resolve({
					get default() {
						defaultReads++;
						return client.FirstModule;
					},
				}),
			);
			expect(defaultReads).toBe(0);

			await act(() => {
				second.resolve({ default: client.SecondModule });
				data.resolve('ready');
			});
			expect(root.find('#lazy-sibling-data').textContent).toBe('ready');
			expect(root.find('#first-lazy-module').textContent).toBe('first');
			expect(root.find('#second-lazy-module').textContent).toBe('second');
			expect(defaultReads).toBeGreaterThan(0);
			expect(loadFirst).toHaveBeenCalledOnce();
			expect(loadSecond).toHaveBeenCalledOnce();
		} finally {
			root.unmount();
		}
	});

	it('shares preloaded lazy modules across independently pending roots', async () => {
		const client = loadCompiledFixtureSource(LAZY_MODULE_SOURCE, {
			id: 'concurrent-lazy-modules.tsrx',
			mode: 'client',
			compileOptions: { hmr: false, dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod' },
		});
		const firstData = deferred<string>();
		const secondData = deferred<string>();
		const firstModule = deferred<any>();
		const secondModule = deferred<any>();
		const preloadFirst = vi.fn(() => firstModule.promise);
		const preloadSecond = vi.fn(() => secondModule.promise);
		client.moduleLoaders.first = preloadFirst;
		client.moduleLoaders.second = preloadSecond;
		const first = mount(client.LazyModuleHost, {
			id: 'first',
			load: () => firstData.promise,
		});
		const second = mount(client.LazyModuleHost, {
			id: 'second',
			load: () => secondData.promise,
		});

		try {
			expect(preloadFirst).toHaveBeenCalledOnce();
			expect(preloadSecond).toHaveBeenCalledOnce();
			expect(first.find('#lazy-module-pending').textContent).toBe('loading');
			expect(second.find('#lazy-module-pending').textContent).toBe('loading');

			await act(() => {
				firstModule.resolve({ default: client.FirstModule });
				secondModule.resolve({ default: client.SecondModule });
				firstData.resolve('first-ready');
			});
			expect(first.find('#lazy-sibling-data').textContent).toBe('first-ready');
			expect(first.find('#first-lazy-module').textContent).toBe('first');
			expect(second.find('#lazy-module-pending').textContent).toBe('loading');

			await act(() => secondData.resolve('second-ready'));
			expect(second.find('#lazy-sibling-data').textContent).toBe('second-ready');
			expect(second.find('#first-lazy-module').textContent).toBe('first');
			expect(second.find('#second-lazy-module').textContent).toBe('second');
			expect(preloadFirst).toHaveBeenCalledOnce();
			expect(preloadSecond).toHaveBeenCalledOnce();
		} finally {
			second.unmount();
			first.unmount();
		}
	});

	it('does not preload a dormant hydration island while an outside sibling suspends', async () => {
		const server = loadCompiledFixtureSource(LAZY_MODULE_SOURCE, {
			id: 'dormant-lazy-modules.tsrx',
			mode: 'server',
			compileOptions: { hmr: false, dev: false },
		});
		server.moduleLoaders.dormant = () => Promise.resolve({ default: server.DormantModule });
		const blocked = never();
		const { html } = await prerender(server.DormantLazyHost, {
			id: 'initial',
			when: blocked,
			load: () => Promise.resolve('server-initial'),
		});
		const container = document.createElement('div');
		container.innerHTML = html;
		document.body.appendChild(container);
		const preserved = container.querySelector('#dormant-lazy-module');
		const client = loadCompiledFixtureSource(LAZY_MODULE_SOURCE, {
			id: 'dormant-lazy-modules.tsrx',
			mode: 'client',
			compileOptions: { hmr: false, dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod' },
		});
		const outside = deferred<string>();
		const outsideModule = deferred<any>();
		const islandModule = deferred<any>();
		const loadOutside = vi.fn(() => outside.promise);
		const preloadOutside = vi.fn(() => outsideModule.promise);
		const preloadIsland = vi.fn(() => islandModule.promise);
		client.moduleLoaders.first = preloadOutside;
		client.moduleLoaders.dormant = preloadIsland;
		const root = hydrateRoot(container, client.DormantLazyHost, {
			id: 'initial',
			when: blocked,
			load: loadOutside,
		});

		try {
			flushSync(() => {});
			expect(container.querySelector('#dormant-lazy-module')).toBe(preserved);
			expect(preloadIsland).not.toHaveBeenCalled();
			expect(preloadOutside).not.toHaveBeenCalled();

			root.render(client.DormantLazyHost, {
				id: 'updated',
				when: blocked,
				load: loadOutside,
			});
			flushSync(() => {});
			expect(loadOutside).toHaveBeenCalledExactlyOnceWith('updated');
			expect(preloadOutside).toHaveBeenCalledOnce();
			expect(preloadIsland).not.toHaveBeenCalled();
			expect(container.querySelector('#dormant-lazy-module')).toBe(preserved);

			await act(() => {
				outsideModule.resolve({ default: client.FirstModule });
				outside.resolve('updated');
			});
			expect(container.querySelector('#first-lazy-module')?.textContent).toBe('first');
			expect(preloadIsland).not.toHaveBeenCalled();

			await act(() =>
				root.render(client.DormantLazyHost, {
					id: 'updated',
					when: condition(true),
					load: loadOutside,
				}),
			);
			expect(preloadIsland).toHaveBeenCalledOnce();
			expect(container.querySelector('#dormant-lazy-module')).toBe(preserved);

			await act(() => islandModule.resolve({ default: client.DormantModule }));
			expect(container.querySelector('#dormant-lazy-module')).toBe(preserved);
			expect(preserved?.textContent).toBe('dormant');
			expect(preloadIsland).toHaveBeenCalledOnce();
		} finally {
			root.unmount();
			container.remove();
		}
	});

	it('does not preload a lazy module in an unselected conditional branch', async () => {
		const client = loadCompiledFixtureSource(LAZY_MODULE_SOURCE, {
			id: 'conditional-lazy-modules.tsrx',
			mode: 'client',
			compileOptions: { hmr: false, dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod' },
		});
		const data = deferred<string>();
		const module = deferred<any>();
		const loadData = vi.fn(() => data.promise);
		const preload = vi.fn(() => module.promise);
		client.moduleLoaders.first = preload;
		const root = mount(client.ConditionalLazyHost, {
			id: 'conditional',
			load: loadData,
			enabled: false,
		});

		try {
			expect(loadData).toHaveBeenCalledOnce();
			expect(preload).not.toHaveBeenCalled();
			await act(() => data.resolve('ready'));
			expect(preload).not.toHaveBeenCalled();

			root.update(client.ConditionalLazyHost, {
				id: 'conditional',
				load: loadData,
				enabled: true,
			});
			expect(preload).toHaveBeenCalledOnce();
			await act(() => module.resolve({ default: client.FirstModule }));
			expect(root.find('#first-lazy-module').textContent).toBe('first');
			expect(preload).toHaveBeenCalledOnce();
		} finally {
			root.unmount();
		}
	});

	it('delivers a rejected preloaded lazy module to its error boundary', async () => {
		const client = loadCompiledFixtureSource(LAZY_MODULE_SOURCE, {
			id: 'rejected-lazy-module.tsrx',
			mode: 'client',
			compileOptions: { hmr: false, dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod' },
		});
		const data = deferred<string>();
		const first = deferred<any>();
		const second = deferred<any>();
		const preload = vi.fn(() => first.promise);
		client.moduleLoaders.first = preload;
		client.moduleLoaders.second = () => second.promise;
		const root = mount(client.LazyModuleHost, { id: 'rejected', load: () => data.promise });

		try {
			expect(preload).toHaveBeenCalledOnce();
			await act(() => first.reject(new Error('preloaded module failed')));
			expect(root.find('#lazy-module-pending').textContent).toBe('loading');
			await act(() => {
				second.resolve({ default: client.SecondModule });
				data.resolve('ready');
			});
			expect(root.find('#lazy-module-error').textContent).toBe('preloaded module failed');
			expect(preload).toHaveBeenCalledOnce();
		} finally {
			root.unmount();
		}
	});

	it.each(['loader', 'subscription'] as const)(
		'retries a synchronous %s failure when the preloaded module actually renders',
		async (failure) => {
			const client = loadCompiledFixtureSource(LAZY_MODULE_SOURCE, {
				id: `retry-lazy-${failure}.tsrx`,
				mode: 'client',
				compileOptions: { hmr: false, dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod' },
			});
			const data = deferred<string>();
			const first = deferred<any>();
			const second = deferred<any>();
			let attempts = 0;
			const loadFirst = vi.fn(() => {
				if (++attempts > 1) return first.promise;
				if (failure === 'loader') throw new Error('module load interrupted');
				return {
					then() {
						throw new Error('module subscription interrupted');
					},
				};
			});
			const loadSecond = vi.fn(() => second.promise);
			client.moduleLoaders.first = loadFirst;
			client.moduleLoaders.second = loadSecond;
			const root = mount(client.LazyModuleHost, { id: 'retry', load: () => data.promise });

			try {
				expect(loadFirst).toHaveBeenCalledOnce();
				expect(loadSecond).toHaveBeenCalledOnce();
				await act(() => {
					second.resolve({ default: client.SecondModule });
					data.resolve('ready');
				});
				expect(loadFirst).toHaveBeenCalledTimes(2);
				expect(root.find('#lazy-module-pending').textContent).toBe('loading');

				await act(() => first.resolve({ default: client.FirstModule }));
				expect(root.find('#first-lazy-module').textContent).toBe('first');
				expect(root.find('#second-lazy-module').textContent).toBe('second');
				expect(loadFirst).toHaveBeenCalledTimes(2);
				expect(loadSecond).toHaveBeenCalledOnce();
			} finally {
				root.unmount();
			}
		},
	);

	it.each(['fulfilled', 'rejected'] as const)(
		'exposes a synchronous subscription throw after a thenable has %s',
		async (outcome) => {
			const client = loadCompiledFixtureSource(LAZY_MODULE_SOURCE, {
				id: `settled-lazy-subscription-${outcome}.tsrx`,
				mode: 'client',
				compileOptions: { hmr: false, dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod' },
			});
			const data = deferred<string>();
			const second = deferred<any>();
			const settledError = new Error('settled module rejected');
			const loadFirst = vi.fn(() => ({
				then(resolve: (value: any) => void, reject: (reason: Error) => void) {
					if (outcome === 'fulfilled') resolve({ default: client.FirstModule });
					else reject(settledError);
					throw new Error('post-settle subscription failed');
				},
			}));
			client.moduleLoaders.first = loadFirst;
			client.moduleLoaders.second = () => second.promise;
			const props = { id: 'settled', load: () => data.promise };
			const root = mount(client.LazyModuleHost, props);
			let retry: ReturnType<typeof mount> | undefined;

			try {
				await act(() => {
					second.resolve({ default: client.SecondModule });
					data.resolve('ready');
				});
				expect(root.find('#lazy-module-error').textContent).toBe('post-settle subscription failed');

				retry = mount(client.LazyModuleHost, props);
				if (outcome === 'fulfilled') {
					expect(retry.find('#first-lazy-module').textContent).toBe('first');
				} else {
					expect(retry.find('#lazy-module-error').textContent).toBe('settled module rejected');
				}
				expect(loadFirst).toHaveBeenCalledOnce();
			} finally {
				retry?.unmount();
				root.unmount();
			}
		},
	);

	it('does not call load() until the component first renders', async () => {
		const d = deferred<{ default: any }>();
		const load = vi.fn(() => d.promise);
		const L = lazy(load);
		expect(load).not.toHaveBeenCalled();

		const r = mount(LazyHost, { comp: L, name: 'ada' });
		expect(load).toHaveBeenCalledTimes(1);
		r.unmount();
	});

	it('suspends into the @pending fallback, then reveals the loaded component', async () => {
		const d = deferred<{ default: any }>();
		const L = lazy(() => d.promise);
		const r = mount(LazyHost, { comp: L, name: 'ada' });
		expect(r.find('.fallback').textContent).toBe('loading');
		expect(r.findAll('.loaded')).toHaveLength(0);

		await act(() => {
			d.resolve({ default: Greeting });
		});
		expect(r.findAll('.fallback')).toHaveLength(0);
		expect(r.find('.loaded').textContent).toBe('hello ada');
		r.unmount();
	});

	it('loads once per lazy(): a second mount after resolve renders with no fallback', async () => {
		const d = deferred<{ default: any }>();
		const load = vi.fn(() => d.promise);
		const L = lazy(load);

		const r1 = mount(LazyHost, { comp: L, name: 'one' });
		await act(() => {
			d.resolve({ default: Greeting });
		});
		expect(r1.find('.loaded').textContent).toBe('hello one');
		r1.unmount();

		const r2 = mount(LazyHost, { comp: L, name: 'two' });
		expect(r2.findAll('.fallback')).toHaveLength(0);
		expect(r2.find('.loaded').textContent).toBe('hello two');
		expect(load).toHaveBeenCalledTimes(1);
		r2.unmount();
	});

	it('routes a rejected load to @catch', async () => {
		const d = deferred<{ default: any }>();
		const L = lazy(() => d.promise);
		const r = mount(LazyHost, { comp: L });
		expect(r.find('.fallback').textContent).toBe('loading');

		await act(() => {
			d.reject(new Error('chunk failed'));
		});
		expect(r.find('.error').textContent).toBe('caught: chunk failed');
		r.unmount();
	});

	it('rejects with a helpful error when the module has no component', async () => {
		const d = deferred<any>();
		const L = lazy(() => d.promise);
		const r = mount(LazyHost, { comp: L });

		await act(() => {
			d.resolve({ default: 42 });
		});
		expect(r.find('.error').textContent).toContain('caught: lazy: expected');
		r.unmount();
	});

	it('accepts a bare component function (no { default } wrapper)', async () => {
		const d = deferred<any>();
		const L = lazy(() => d.promise);
		const r = mount(LazyHost, { comp: L, name: 'bare' });

		await act(() => {
			d.resolve(Greeting);
		});
		expect(r.find('.loaded').textContent).toBe('hello bare');
		r.unmount();
	});

	it('the loaded component keeps hook state across parent re-renders (no remount)', async () => {
		const d = deferred<{ default: any }>();
		const L = lazy(() => d.promise);
		const r = mount(LazyUpdateHost, { comp: L });
		expect(r.find('.fallback').textContent).toBe('loading');

		await act(() => {
			d.resolve({ default: Counter });
		});
		expect(r.find('.counter').textContent).toBe('n:0 p:0');

		r.click('.counter');
		expect(r.find('.counter').textContent).toBe('n:1 p:0');

		// A parent re-render updates the prop through the (stable) lazy wrapper —
		// the loaded component must patch in place, keeping its useState.
		r.click('#bump');
		expect(r.find('.counter').textContent).toBe('n:1 p:1');
		r.unmount();
	});
});

// ---------------------------------------------------------------------------
// SSR — lazy under renderToString (sync pass → fallback) and prerender
// (await-everything → loaded content).
// ---------------------------------------------------------------------------

const FIXTURES = join(process.cwd(), 'packages/octane/tests/_fixtures');

function evalServer(source: string, file: string): Record<string, any> {
	let { code } = compile(source, file, { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export function (\w+)/g, '__exports.$1 = function $1');
	return new Function('__rt', '__exports', code + '\nreturn __exports;')(Server, {});
}

const m = evalServer(readFileSync(join(FIXTURES, 'lazy.tsrx'), 'utf8'), 'lazy.tsrx');

describe('lazy — SSR', () => {
	it('renderToString renders the @pending fallback for a still-loading lazy', async () => {
		const L = Server.lazy(() => new Promise(() => {}));
		const r = await Server.renderToString(m.LazyHost, { comp: L, name: 'ada' });
		expect(r.html).toContain('loading');
		expect(r.html).not.toContain('hello');
	});

	it('prerender awaits the module and renders the loaded component', async () => {
		const L = Server.lazy(() => Promise.resolve({ default: m.Greeting }));
		const r = await prerender(m.LazyHost, { comp: L, name: 'ada' });
		expect(r.html).toContain('hello ada');
		expect(r.html).not.toContain('loading');
	});

	it('renderToString renders synchronously once the module is already loaded', async () => {
		const L = Server.lazy(() => Promise.resolve({ default: m.Greeting }));
		await prerender(m.LazyHost, { comp: L, name: 'warm' }); // load + settle the payload
		const r = await Server.renderToString(m.LazyHost, { comp: L, name: 'ada' });
		expect(r.html).toContain('hello ada');
		expect(r.html).not.toContain('loading');
	});

	it('prerender routes a rejected load to @catch', async () => {
		const L = Server.lazy(() => Promise.reject(new Error('chunk failed')));
		const r = await prerender(m.LazyHost, { comp: L });
		expect(r.html).toContain('caught: chunk failed');
	});
});
