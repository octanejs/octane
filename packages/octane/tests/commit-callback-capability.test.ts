import { afterEach, describe, expect, it, vi } from 'vitest';

// Effects, refs, Effect Events, external stores, controlled selects, Suspense
// hides and explicit signal owners each install the commit and dispatch work
// they need, so an application without them ships none of it. Each case loads
// a fresh runtime, where its feature is the first one that runtime sees, so no
// earlier case can have installed that work for it.
const containers: HTMLElement[] = [];
afterEach(() => {
	for (const container of containers.splice(0)) container.remove();
});

async function freshRuntime() {
	vi.resetModules();
	const runtime = await import('../src/index.js');
	const { loadCompiledFixtureSource } = await import('./_server-fixture.js');
	const compile = (id: string, source: string) =>
		loadCompiledFixtureSource(source, {
			id,
			mode: 'client',
			compileOptions: { dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod', hmr: false },
		});
	const container = document.createElement('div');
	document.body.append(container);
	containers.push(container);
	return { runtime, compile, container, root: runtime.createRoot(container) };
}

describe('commit callbacks in a fresh runtime', () => {
	it('runs a layout effect against committed DOM and its update in the same flush', async () => {
		const { runtime, compile, container, root } = await freshRuntime();
		const { App } = compile(
			'commit-layout.tsx',
			`import { useLayoutEffect, useState } from 'octane';
			export function App(props: { log: string[] }) {
				const [width, setWidth] = useState(0);
				useLayoutEffect(() => {
					props.log.push('layout ' + document.getElementById('box')!.textContent);
					setWidth(1);
					return () => props.log.push('cleanup');
				}, []);
				return <p id="box">{String(width)}</p>;
			}`,
		);
		const log: string[] = [];
		runtime.flushSync(() => root.render(App, { log }));
		expect(container.textContent).toBe('1');
		expect(log).toEqual(['layout 0']);
		root.unmount();
		expect(log).toEqual(['layout 0', 'cleanup']);
	});

	it('runs an insertion effect and its cleanup', async () => {
		const { runtime, compile, root } = await freshRuntime();
		const { App } = compile(
			'commit-insertion.tsx',
			`import { useInsertionEffect } from 'octane';
			export function App(props: { log: string[] }) {
				useInsertionEffect(() => {
					props.log.push('insert');
					return () => props.log.push('remove');
				}, []);
				return <p>insertion</p>;
			}`,
		);
		const log: string[] = [];
		runtime.flushSync(() => root.render(App, { log }));
		expect(log).toEqual(['insert']);
		root.unmount();
		expect(log).toEqual(['insert', 'remove']);
	});

	it('runs a passive effect after commit and its cleanup after unmount', async () => {
		const { runtime, compile, root } = await freshRuntime();
		const { App } = compile(
			'commit-passive.tsx',
			`import { useEffect } from 'octane';
			export function App(props: { log: string[] }) {
				useEffect(() => {
					props.log.push('effect ' + document.getElementById('passive')!.textContent);
					return () => props.log.push('cleanup');
				}, []);
				return <p id="passive">passive</p>;
			}`,
		);
		const log: string[] = [];
		await runtime.act(() => root.render(App, { log }));
		expect(log).toEqual(['effect passive']);
		await runtime.act(() => root.unmount());
		expect(log).toEqual(['effect passive', 'cleanup']);
	});

	it('attaches a compiled callback ref at commit and detaches it on unmount', async () => {
		const { runtime, compile, root } = await freshRuntime();
		const { App } = compile(
			'commit-callback-ref.tsx',
			`export function App(props: { log: unknown[] }) {
				return <input ref={(el: HTMLInputElement | null) => props.log.push(el?.isConnected ?? null)} />;
			}`,
		);
		const log: unknown[] = [];
		runtime.flushSync(() => root.render(App, { log }));
		expect(log).toEqual([true]);
		root.unmount();
		expect(log).toEqual([true, null]);
	});

	it('attaches an object ref of a created element and clears it on unmount', async () => {
		const { runtime, container, root } = await freshRuntime();
		const ref: { current: HTMLInputElement | null } = { current: null };
		runtime.flushSync(() => root.render(runtime.createElement('input', { ref })));
		expect(ref.current).toBe(container.querySelector('input'));
		root.unmount();
		expect(ref.current).toBeNull();
	});

	it('publishes the latest committed Effect Event body', async () => {
		const { runtime, compile, container, root } = await freshRuntime();
		const { App } = compile(
			'commit-effect-event.tsx',
			`import { useEffectEvent } from 'octane';
			export function App(props: { label: string; log: string[] }) {
				const report = useEffectEvent(() => props.log.push(props.label));
				return <button onClick={() => report()}>report</button>;
			}`,
		);
		const log: string[] = [];
		runtime.flushSync(() => root.render(App, { label: 'first', log }));
		runtime.flushSync(() => root.render(App, { label: 'second', log }));
		container.querySelector('button')!.click();
		expect(log).toEqual(['second']);
		root.unmount();
	});

	it('reconciles an external store and unsubscribes on unmount', async () => {
		const { runtime, compile, container, root } = await freshRuntime();
		const { App } = compile(
			'commit-store.tsx',
			`import { useSyncExternalStore } from 'octane';
			export function App(props: { store: { get(): string; subscribe(cb: () => void): () => void } }) {
				return <p>{useSyncExternalStore(props.store.subscribe, props.store.get) as string}</p>;
			}`,
		);
		let value = 'a';
		const listeners = new Set<() => void>();
		const store = {
			get: () => value,
			subscribe(listener: () => void) {
				listeners.add(listener);
				return () => listeners.delete(listener);
			},
		};
		await runtime.act(() => root.render(App, { store }));
		expect(container.textContent).toBe('a');
		await runtime.act(() => {
			value = 'b';
			for (const listener of listeners) listener();
		});
		expect(container.textContent).toBe('b');
		await runtime.act(() => root.unmount());
		expect(listeners.size).toBe(0);
	});

	it('keeps checking an external store for tearing after a hidden Activity reveals it', async () => {
		const { runtime, compile, container, root } = await freshRuntime();
		const { App } = compile(
			'commit-hidden-store.tsx',
			`import { Activity, useLayoutEffect, useSyncExternalStore } from 'octane';
			type Store = { get(): string; subscribe(cb: () => void): () => void };
			function Reader(props: { store: Store }) {
				return <p>{useSyncExternalStore(props.store.subscribe, props.store.get) as string}</p>;
			}
			function Mutator(props: { mutate(): void }) {
				useLayoutEffect(() => props.mutate());
				return null;
			}
			export function App(props: { mode: 'visible' | 'hidden'; store: Store; mutate(): void }) {
				return (
					<Activity mode={props.mode}>
						<Reader store={props.store} />
						<Mutator mutate={props.mutate} />
					</Activity>
				);
			}`,
		);
		let value = 'a';
		const store = { get: () => value, subscribe: () => () => {} };
		const mutate = () => {};
		// Hidden content registers no effects, so its store check is the first
		// commit-phase work this runtime sees.
		await runtime.act(() => root.render(App, { mode: 'hidden', store, mutate }));
		await runtime.act(() => root.render(App, { mode: 'visible', store, mutate }));
		expect(container.textContent).toBe('a');
		// The store moves before this render and again, silently, during its
		// commit: the post-layout consistency check must render the latest value.
		value = 'b';
		await runtime.act(() =>
			root.render(App, {
				mode: 'visible',
				store,
				mutate: () => {
					value = 'c';
				},
			}),
		);
		expect(container.textContent).toBe('c');
		await runtime.act(() => root.unmount());
	});

	it('selects a controlled select value from the options its render built', async () => {
		const { runtime, compile, container, root } = await freshRuntime();
		const { App } = compile(
			'commit-select.tsx',
			`export function App(props: { value: string; options: string[] }) {
				return (
					<select value={props.value} onChange={() => {}}>
						{props.options.map((option) => <option key={option} value={option}>{option}</option>)}
					</select>
				);
			}`,
		);
		runtime.flushSync(() => root.render(App, { value: 'b', options: ['a', 'b'] }));
		const select = container.querySelector('select')!;
		expect(select.value).toBe('b');
		runtime.flushSync(() => root.render(App, { value: 'c', options: ['a', 'b', 'c'] }));
		expect(select.value).toBe('c');
		root.unmount();
	});

	it('hides committed content when it suspends again', async () => {
		const { runtime, compile, container, root } = await freshRuntime();
		const { App } = compile(
			'commit-suspense-hide.tsx',
			`import { Suspense, use } from 'octane';
			function Content(props: { value: Promise<string> | string }) {
				const value = props.value;
				return <p id="content">{typeof value === 'string' ? value : use(value)}</p>;
			}
			export function App(props: { value: Promise<string> | string }) {
				return (
					<Suspense fallback={<span id="fallback">loading</span>}>
						<Content value={props.value} />
					</Suspense>
				);
			}`,
		);
		await runtime.act(() => root.render(App, { value: 'ready' }));
		const content = container.querySelector<HTMLElement>('#content')!;
		expect(content.textContent).toBe('ready');
		await runtime.act(() => root.render(App, { value: new Promise<string>(() => {}) }));
		expect(container.querySelector('#fallback')?.textContent).toBe('loading');
		expect(content.style.display).toBe('none');
		root.unmount();
	});

	it('hides and reveals an Activity, preserving its DOM', async () => {
		const { runtime, compile, container, root } = await freshRuntime();
		const { App } = compile(
			'commit-activity.tsx',
			`import { Activity } from 'octane';
			export function App(props: { mode: 'visible' | 'hidden' }) {
				return <Activity mode={props.mode}><p id="kept">kept</p></Activity>;
			}`,
		);
		runtime.flushSync(() => root.render(App, { mode: 'visible' }));
		const kept = container.querySelector<HTMLElement>('#kept')!;
		runtime.flushSync(() => root.render(App, { mode: 'hidden' }));
		expect(kept.style.display).toBe('none');
		runtime.flushSync(() => root.render(App, { mode: 'visible' }));
		expect(container.querySelector('#kept')).toBe(kept);
		expect(kept.style.display).toBe('');
		root.unmount();
	});

	it.each([false, true])(
		'runs a native handler in the explicit owner it was rendered in (carrier=%s)',
		async (carrier) => {
			const { runtime, compile, container, root } = await freshRuntime();
			const signals = await import('../src/signals/index.js');
			const { App } = compile(
				'commit-explicit-owner.tsx',
				`export function App(props: { invoke(): void }) {
					return <button onClick={() => props.invoke()}>owned</button>;
				}`,
			);
			// A host carrier enters owners on its own, without runWithSignalOwner.
			let current: unknown = null;
			const run = <T>(owner: unknown, callback: () => T): T => {
				const previous = current;
				current = owner;
				try {
					return callback();
				} finally {
					current = previous;
				}
			};
			const restore = carrier
				? signals.installSignalOwnerEnvironment({
						current: () => current as never,
						run,
						capture: (owner) => (callback) => run(owner, callback),
					})
				: undefined;
			try {
				const owner = signals.createScope({ scopeKey: 'explicit-handler-owner' });
				const seen: unknown[] = [];
				(carrier ? run : signals.runWithSignalOwner)(owner, () =>
					runtime.flushSync(() =>
						root.render(App, { invoke: () => seen.push(signals.currentSignalOwner()) }),
					),
				);
				container.querySelector('button')!.click();
				expect(seen).toEqual([owner]);
				root.unmount();
			} finally {
				restore?.();
			}
		},
	);
});
