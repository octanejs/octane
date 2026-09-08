import { describe, it, expect } from 'vitest';
import {
	hmr,
	HMR,
	useState,
	flushSync,
	hydrateRoot,
	type ComponentBody,
	type Scope,
} from '../src/index.js';
import { mount } from './_helpers';

/**
 * Runtime tests for the `hmr(...)` wrapper. The focused unit cases use direct
 * component bodies; the structural regressions evaluate real compiler output.
 * Direct wrapper cases call `Foo[HMR].update(NewFoo)` manually; module-lifecycle
 * cases run the emitted handoff and the bundler's current accept callback.
 *
 * The component bodies here use the same `(props, scope, extra)` signature
 * the octane compiler emits. They follow the standard
 * "clear-range-then-insert" pattern that compiled bodies use on re-render.
 */

function clearBlockRange(scope: Scope): void {
	const block = scope.block;
	// Root blocks have null markers and own the whole parentNode; non-root
	// blocks own just the inclusive range between markers.
	if (!block.startMarker || !block.endMarker) {
		while (block.parentNode.firstChild) {
			block.parentNode.removeChild(block.parentNode.firstChild);
		}
		return;
	}
	let n: Node | null = block.startMarker.nextSibling;
	while (n && n !== block.endMarker) {
		const next: Node | null = n.nextSibling;
		block.parentNode.removeChild(n);
		n = next;
	}
}

interface TestHotContext {
	data?: Record<string, unknown>;
	dispose(callback: (data: Record<string, unknown>) => void): void;
	accept(callback?: (module: Record<string, ComponentBody<any>> | undefined) => void): void;
	invalidate(): void;
}

async function compileHmrComponent(
	source: string,
	exportName = 'App',
	filename = '/src/App.tsrx',
	modules: Record<string, Record<string, unknown>> = {},
	options: { hmr?: 'vite' | 'webpack'; hot?: TestHotContext } = {},
): Promise<ComponentBody<any>> {
	const [{ compile }, runtime, internalRuntime] = await Promise.all([
		import('octane/compiler'),
		import('../src/index.js'),
		import('octane/internal/client'),
	]);
	const code = compile(source, filename, { hmr: options.hmr ?? 'webpack' }).code;
	const transformed =
		code
			.replace(
				/^import\s*\{([^}]*)\}\s*from\s*(['"])octane(\/internal\/client)?\2;/gm,
				(_match: string, imports: string, _quote: string, internal: string | undefined) => {
					const properties = imports
						.split(',')
						.map((specifier) => specifier.trim().replace(/\s+as\s+/, ': '))
						.join(', ');
					return `const { ${properties} } = ${internal ? 'internalRuntime' : 'runtime'};`;
				},
			)
			.replace(
				/^import\s*\{([\s\S]*?)\}\s*from\s*(['"])(\.\.?\/[^'"]+)\2;/gm,
				(_match: string, imports: string, _quote: string, request: string) => {
					const properties = imports
						.split(',')
						.map((specifier) => specifier.trim().replace(/\s+as\s+/, ': '))
						.join(', ');
					return `const { ${properties} } = modules[${JSON.stringify(request)}];`;
				},
			)
			.replace(/\bexport (let|const) /g, '$1 ')
			// Verbatim return-JSX functions emit `function X … export { X };`
			// instead of `export let X = …`; drop the list form the same way.
			.replace(/^export\s*\{[^}]*\};?\s*$/gm, '')
			.replaceAll('import.meta.webpackHot', 'hot')
			.replaceAll('import.meta.hot', 'hot') + `\nreturn ${exportName};`;
	const hot = options.hot ?? {
		data: undefined,
		dispose() {},
		accept() {},
		invalidate() {},
	};
	return Function(
		'runtime',
		'internalRuntime',
		'hot',
		'modules',
		transformed,
	)(runtime, internalRuntime, hot, modules) as ComponentBody<any>;
}

describe('hmr — runtime wrapper', () => {
	it.each([
		{ dialect: 'vite', name: 'App' },
		{ dialect: 'webpack', name: 'App' },
		{ dialect: 'vite', name: 'module' },
		{ dialect: 'vite', name: '_$hmrModule' },
	] as const)(
		'preserves state and live events for $name across consecutive $dialect replacements',
		async ({ dialect, name }) => {
			const data: Record<string, unknown> = {};
			let dispose: Parameters<TestHotContext['dispose']>[0] | undefined;
			let accept: Parameters<TestHotContext['accept']>[0];
			let invalidated = false;
			const load = async (version: number, incompatible = false) => {
				// The previous evaluation's callback receives this update. Vite then
				// keeps only the new evaluation's registration for the next save.
				const previousAccept = accept;
				dispose?.(data);
				dispose = undefined;
				accept = undefined;
				const App = await compileHmrComponent(
					`import { useState } from 'octane';
					 export function ${name}(props) @{
					   const [count, setCount] = useState(0);
					   ${incompatible ? "if (props.empty) return 'empty';" : ''}
					   <main><p>version ${version}</p><button onClick={() => setCount(count + 1)}>{count as string}</button></main>
					 }`,
					name,
					'/src/App.tsrx',
					{},
					{
						hmr: dialect,
						hot: {
							data,
							dispose(callback) {
								dispose = callback;
							},
							accept(callback) {
								accept = callback;
							},
							invalidate() {
								invalidated = true;
							},
						},
					},
				);
				flushSync(() => previousAccept?.({ [name]: App }));
				return App;
			};
			const r = mount(await load(1));
			try {
				r.click('button');
				r.click('button');
				for (const version of [2, 3, 4]) {
					await load(version);
					expect(r.find('p').textContent).toBe(`version ${version}`);
					expect(r.find('button').textContent).toBe(String(version));
					r.click('button');
					expect(r.find('button').textContent).toBe(String(version + 1));
				}
				expect(invalidated).toBe(false);
				if (dialect === 'vite') {
					// Vite supplies no namespace when evaluating an edit fails. Keep the
					// old boundary for recovery, but reload when its export disappears.
					accept?.(undefined);
					expect(invalidated).toBe(false);
					accept?.({});
					expect(invalidated).toBe(true);
					invalidated = false;
				}
				await load(5, true);
				expect(invalidated).toBe(true);
				expect(r.find('p').textContent).toBe('version 4');
				expect(r.find('button').textContent).toBe('5');
			} finally {
				r.unmount();
			}
		},
	);

	it.each(['constructor', '__proto__', 'toString'])(
		'can introduce an exported component named %s during a refresh',
		async (name) => {
			const hot: TestHotContext = {
				data: {},
				dispose() {},
				accept() {},
				invalidate() {
					throw new Error('Adding a component should not invalidate the existing boundary');
				},
			};
			const options = { hmr: 'vite' as const, hot };
			const initial = await compileHmrComponent(
				'export function App() @{ <p>before</p> }',
				'App',
				'/src/App.tsrx',
				{},
				options,
			);
			const r = mount(initial);
			let added: ReturnType<typeof mount> | undefined;
			try {
				const Added = await compileHmrComponent(
					`export function App() @{ <p>after</p> }
					 export function ${name}() @{ <p>added component</p> }`,
					name,
					'/src/App.tsrx',
					{},
					options,
				);
				flushSync(() => {});
				expect(r.find('p').textContent).toBe('after');
				added = mount(Added);
				expect(added.find('p').textContent).toBe('added component');
				await compileHmrComponent(
					`export function App() @{ <p>next revision</p> }
					 export function ${name}() @{ <p>updated addition</p> }`,
					name,
					'/src/App.tsrx',
					{},
					options,
				);
				flushSync(() => {});
				expect(r.find('p').textContent).toBe('next revision');
				expect(added.find('p').textContent).toBe('updated addition');
			} finally {
				added?.unmount();
				r.unmount();
			}
		},
	);

	it('renders the initial component body', () => {
		const Foo = hmr(((_props: any, scope: Scope, _extra: any) => {
			clearBlockRange(scope);
			const root = document.createElement('span');
			root.className = 'leaf';
			root.textContent = 'initial';
			scope.block.parentNode.insertBefore(root, scope.block.endMarker);
		}) as ComponentBody<any>);
		const r = mount(Foo);
		expect(r.find('.leaf').textContent).toBe('initial');
		r.unmount();
	});

	it('exposes the HMR meta via the HMR Symbol', () => {
		const Foo = hmr(((_scope: Scope, _props: any, _extra: any) => {}) as ComponentBody<any>);
		const meta = (Foo as any)[HMR];
		expect(meta).toBeDefined();
		expect(typeof meta.update).toBe('function');
		expect(meta.liveBlocks instanceof Set).toBe(true);
	});

	it('declines a lite-scope handoff so the bundler can reload safely', () => {
		const initialBody = (() => {}) as ComponentBody<any>;
		const Foo = hmr(initialBody);
		const parent = document.createElement('div');
		const anchor = document.createComment('anchor');
		parent.appendChild(anchor);
		const liteScope = {
			block: { parentNode: parent, endMarker: anchor, parentBlock: null },
		} as unknown as Scope;
		Foo({}, liteScope, undefined);

		expect((Foo as any)[HMR].update(hmr((() => {}) as ComponentBody<any>))).toBe(false);
		expect((Foo as any)[HMR].fn).toBe(initialBody);
	});

	it('update() swaps the body of live blocks + re-renders', () => {
		const v1: ComponentBody<any> = ((_props: any, scope: Scope, _extra: any) => {
			clearBlockRange(scope);
			const root = document.createElement('span');
			root.className = 'leaf v1';
			root.textContent = 'A';
			scope.block.parentNode.insertBefore(root, scope.block.endMarker);
		}) as ComponentBody<any>;
		const v2: ComponentBody<any> = ((_props: any, scope: Scope, _extra: any) => {
			clearBlockRange(scope);
			const root = document.createElement('span');
			root.className = 'leaf v2';
			root.textContent = 'B';
			scope.block.parentNode.insertBefore(root, scope.block.endMarker);
		}) as ComponentBody<any>;

		const Foo = hmr(v1);
		const r = mount(Foo);
		expect(r.find('.leaf').textContent).toBe('A');
		expect(r.find('.leaf').classList.contains('v1')).toBe(true);

		// Simulate what `import.meta.hot.accept` does: hand `update` a wrapper
		// built around the new fn. The wrapper unwraps before storing.
		const NewFoo = hmr(v2);
		flushSync(() => {
			(Foo as any)[HMR].update(NewFoo);
		});
		expect(r.find('.leaf').textContent).toBe('B');
		expect(r.find('.leaf').classList.contains('v2')).toBe(true);

		r.unmount();
	});

	it('replaces compiled static output while preserving hook state', async () => {
		const initial = await compileHmrComponent(`
			import { useState } from 'octane';
			export function App(props) @{
				const [count, setCount] = useState(0);
				props.expose(setCount);
				<main><p id="lede">before</p><output>{count as string}</output></main>
			}
		`);
		const updated = await compileHmrComponent(`
			import { useState } from 'octane';
			export function App(props) @{
				const [count, setCount] = useState(0);
				props.expose(setCount);
				<main><p id="lede">after</p><output>{count as string}</output></main>
			}
		`);
		let setCount!: (value: number | ((current: number) => number)) => void;
		const r = mount(initial, { expose: (setter: typeof setCount) => (setCount = setter) });
		flushSync(() => setCount(7));

		flushSync(() => {
			expect((initial as any)[HMR].update(updated)).toBe(true);
		});

		expect(r.find('#lede').textContent).toBe('after');
		expect(r.find('output').textContent).toBe('7');
		r.unmount();
	});

	it('replaces compiled static output after hydration', async () => {
		const initial = await compileHmrComponent(`
			export function App() @{
				<main><p id="lede">before</p></main>
			}
		`);
		const updated = await compileHmrComponent(`
			export function App() @{
				<main><p id="lede">after</p></main>
			}
		`);
		const container = document.createElement('div');
		container.innerHTML = '<main><p id="lede">before</p></main>';
		document.body.appendChild(container);
		const adopted = container.firstElementChild;
		const root = hydrateRoot(container, initial);
		flushSync(() => {});
		expect(container.firstElementChild).toBe(adopted);

		flushSync(() => {
			expect((initial as any)[HMR].update(updated)).toBe(true);
		});

		expect(container.querySelector('#lede')?.textContent).toBe('after');
		root.unmount();
		container.remove();
	});

	it('mounts a component call introduced by a compiled update', async () => {
		const initial = await compileHmrComponent(`
			export function App() @{
				<main><h1>octane</h1></main>
			}
		`);
		const updated = await compileHmrComponent(`
			function Child() @{
				<p id="child">CHILD ONE</p>
			}
			export function App() @{
				<main><h1>octane</h1><Child /></main>
			}
		`);
		const r = mount(initial);

		expect(() => {
			flushSync(() => {
				expect((initial as any)[HMR].update(updated)).toBe(true);
			});
		}).not.toThrow();

		expect(r.find('#child').textContent).toBe('CHILD ONE');
		r.unmount();
	});

	// A component invoked as a plain function (`Row({ … })`) reaches the HMR
	// wrapper without a scope. The wrapper must stay call-transparent — the
	// wrapped module renders — and an edit still refreshes the call site's
	// output through the CALLER's update, exactly as the emitted accept block
	// drives it (callee first, then the caller whose new body closes over the
	// new callee).
	it('renders and refreshes a direct plain-function component call', async () => {
		const v1 = `/** @jsxImportSource octane */
			export function Row(props: { label: string }) {
				if (props.label === '') return <li className="row empty">(empty)</li>;
				return <li className="row">v1:{props.label}</li>;
			}
			export function App(props: { labels: string[] }) {
				return <ul className="rows">{props.labels.map((label) => Row({ label }))}</ul>;
			}
		`;
		const initialRow = await compileHmrComponent(v1, 'Row', '/src/App.tsx');
		const initial = await compileHmrComponent(v1, 'App', '/src/App.tsx');
		const v2 = v1.replace('v1:', 'v2:').replace('(empty)', '(none)');
		const updatedRow = await compileHmrComponent(v2, 'Row', '/src/App.tsx');
		const updated = await compileHmrComponent(v2, 'App', '/src/App.tsx');

		const r = mount(initial, { labels: ['a', ''] });
		expect(r.findAll('.row').map((el) => el.textContent)).toEqual(['v1:a', '(empty)']);

		flushSync(() => {
			// The direct-call-only component has no live blocks of its own; its
			// update must still succeed so the module is not force-reloaded.
			expect((initialRow as any)[HMR].update(updatedRow)).toBe(true);
			expect((initial as any)[HMR].update(updated)).toBe(true);
		});

		expect(r.findAll('.row').map((el) => el.textContent)).toEqual(['v2:a', '(none)']);
		r.unmount();
	});

	it('refreshes a compiled child in place without duplicating its single root', async () => {
		const initialChild = await compileHmrComponent(
			`
				import { useState } from 'octane';
				export function Child(props) @{
					const [count, setCount] = useState(0);
					props.expose(setCount);
					<p class="child">before:{count as string}</p>
				}
			`,
			'Child',
			'/src/Child.tsrx',
		);
		const updatedChild = await compileHmrComponent(
			`
				import { useState } from 'octane';
				export function Child(props) @{
					const [count, setCount] = useState(0);
					props.expose(setCount);
					<p class="child">after:{count as string}</p>
				}
			`,
			'Child',
			'/src/Child.tsrx',
		);
		const App = await compileHmrComponent(
			`
				import { Child } from './Child.tsrx';
				export function App(props) @{
					<main><Child expose={props.expose} /></main>
				}
			`,
			'App',
			'/src/App.tsrx',
			{ './Child.tsrx': { Child: initialChild } },
		);
		let setCount!: (value: number | ((current: number) => number)) => void;
		const r = mount(App, { expose: (setter: typeof setCount) => (setCount = setter) });
		flushSync(() => setCount(3));

		flushSync(() => {
			expect((initialChild as any)[HMR].update(updatedChild)).toBe(true);
		});

		expect(r.findAll('.child')).toHaveLength(1);
		expect(r.find('.child').textContent).toBe('after:3');
		r.unmount();
	});

	it('keeps a refreshed child hidden until its Activity reveals', async () => {
		const initialChild = await compileHmrComponent(
			`
				export function Child() @{
					<p class="child">before</p>
				}
			`,
			'Child',
			'/src/Child.tsrx',
		);
		const updatedChild = await compileHmrComponent(
			`
				export function Child() @{
					<section class="child">after</section>
				}
			`,
			'Child',
			'/src/Child.tsrx',
		);
		const App = await compileHmrComponent(
			`
				import { Activity } from 'octane';
				import { Child } from './Child.tsrx';
				export function App(props) @{
					<Activity mode={props.mode}><Child /></Activity>
				}
			`,
			'App',
			'/src/App.tsrx',
			{ './Child.tsrx': { Child: initialChild } },
		);
		const r = mount(App, { mode: 'hidden' });

		flushSync(() => {
			expect((initialChild as any)[HMR].update(updatedChild)).toBe(true);
		});

		expect(r.findAll('.child')).toHaveLength(1);
		expect(r.find('.child').tagName).toBe('SECTION');
		expect(r.find('.child').textContent).toBe('after');
		expect((r.find('.child') as HTMLElement).style.display).toBe('none');

		r.update(App, { mode: 'visible' });
		expect((r.find('.child') as HTMLElement).style.display).toBe('');
		r.unmount();
	});

	it.each([
		{
			construct: '@if branch',
			setup: `const [value, setValue] = useState(true);`,
			output: `@if (value) { <Child /> } @else { <span id="fallback">fallback</span> }`,
			next: false,
		},
		{
			construct: '@switch branch',
			setup: `const [value, setValue] = useState('child');`,
			output: `
				@switch (value) {
					@case 'child': { <Child /> }
					@default: { <span id="fallback">fallback</span> }
				}
			`,
			next: 'fallback',
		},
		{
			construct: '@for item',
			setup: `const [value, setValue] = useState([{ id: 'child' }]);`,
			output: `
				@for (const item of value; key item.id) { <Child /> }
				@empty { <span id="fallback">fallback</span> }
			`,
			next: [],
		},
	])('falls back to reload when a hot child is the sole root of an $construct', async (test) => {
		const initialChild = await compileHmrComponent(
			`
				export function Child() @{
					<p id="child">before</p>
				}
			`,
			'Child',
			'/src/Child.tsrx',
		);
		const updatedChild = await compileHmrComponent(
			`
				export function Child() @{
					<p id="child">after</p>
				}
			`,
			'Child',
			'/src/Child.tsrx',
		);
		const App = await compileHmrComponent(
			`
				import { useState } from 'octane';
				import { Child } from './Child.tsrx';
				export function App(props) @{
					${test.setup}
					props.expose(setValue);
					<main>
						${test.output}
					</main>
				}
			`,
			'App',
			'/src/App.tsrx',
			{ './Child.tsrx': { Child: initialChild } },
		);
		let setValue!: (value: unknown) => void;
		const r = mount(App, { expose: (setter: typeof setValue) => (setValue = setter) });

		expect((initialChild as any)[HMR].update(updatedChild)).toBe(false);
		expect(r.find('#child').textContent).toBe('before');
		expect(() => flushSync(() => setValue(test.next))).not.toThrow();
		expect(r.find('#fallback').textContent).toBe('fallback');
		expect(r.findAll('#child')).toHaveLength(0);
		r.unmount();
	});

	it('refreshes a compiled child that borrows the root container range', async () => {
		const initialChild = await compileHmrComponent(
			`
				import { useState } from 'octane';
				export function Child(props) @{
					const [count, setCount] = useState(0);
					props.expose(setCount);
					<p>before:{count as string}</p>
				}
			`,
			'Child',
			'/src/Child.tsrx',
		);
		const updatedChild = await compileHmrComponent(
			`
				import { useState } from 'octane';
				export function Child(props) @{
					const [count, setCount] = useState(0);
					props.expose(setCount);
					<section>after:{count as string}</section>
				}
			`,
			'Child',
			'/src/Child.tsrx',
		);
		const App = await compileHmrComponent(
			`
				import { Child } from './Child.tsrx';
				export function App(props) @{
					<Child expose={props.expose} />
				}
			`,
			'App',
			'/src/App.tsrx',
			{ './Child.tsrx': { Child: initialChild } },
		);
		let setCount!: (value: number | ((current: number) => number)) => void;
		const r = mount(App, { expose: (setter: typeof setCount) => (setCount = setter) });
		flushSync(() => setCount(4));
		const [block] = (initialChild as any)[HMR].liveBlocks as Set<Scope['block']>;
		expect(block.startMarker).toBeNull();
		expect(block.endMarker).toBeNull();
		expect(block.exclusiveMarkers).toBe(true);

		flushSync(() => {
			expect((initialChild as any)[HMR].update(updatedChild)).toBe(true);
		});

		expect(r.find('section').textContent).toBe('after:4');
		r.unmount();
	});

	it('publishes edited memo and effect closures during refresh', async () => {
		const initial = await compileHmrComponent(`
			import { useLayoutEffect, useMemo } from 'octane';
			export function App(props) @{
				const label = useMemo(() => 'memo before', []);
				useLayoutEffect(() => {
					props.log('mount before');
					return () => props.log('cleanup before');
				}, []);
				<p>{label as string}</p>
			}
		`);
		const updated = await compileHmrComponent(`
			import { useLayoutEffect, useMemo } from 'octane';
			export function App(props) @{
				const label = useMemo(() => 'memo after', []);
				useLayoutEffect(() => {
					props.log('mount after');
					return () => props.log('cleanup after');
				}, []);
				<p>{label as string}</p>
			}
		`);
		const log: string[] = [];
		const r = mount(initial, { log: (entry: string) => log.push(entry) });
		expect(log.splice(0)).toEqual(['mount before']);

		flushSync(() => {
			expect((initial as any)[HMR].update(updated)).toBe(true);
		});

		expect(r.find('p').textContent).toBe('memo after');
		expect(log.splice(0)).toEqual(['cleanup before', 'mount after']);
		r.unmount();
	});

	it('keeps hook-owned resources active while replacing render-owned output', async () => {
		const initial = await compileHmrComponent(`
			import { useEffectEvent } from 'octane';
			export function App(props) @{
				const record = useEffectEvent(() => props.log('before'));
				<button onClick={record}>before</button>
			}
		`);
		const updated = await compileHmrComponent(`
			import { useEffectEvent } from 'octane';
			export function App(props) @{
				const record = useEffectEvent(() => props.log('after'));
				<button onClick={record}>after</button>
			}
		`);
		const log: string[] = [];
		const r = mount(initial, { log: (entry: string) => log.push(entry) });
		r.click('button');

		flushSync(() => {
			expect((initial as any)[HMR].update(updated)).toBe(true);
		});
		r.click('button');

		expect(r.find('button').textContent).toBe('after');
		expect(log).toEqual(['before', 'after']);
		r.unmount();
	});

	it('detaches outgoing refs before attaching refreshed output', async () => {
		const initial = await compileHmrComponent(`
			export function App(props) @{
				<div ref={props.track}>before</div>
			}
		`);
		const updated = await compileHmrComponent(`
			export function App(props) @{
				<span ref={props.track}>after</span>
			}
		`);
		const seen: Array<string | null> = [];
		const r = mount(initial, {
			track: (node: Element | null) => seen.push(node?.tagName ?? null),
		});
		expect(seen.splice(0)).toEqual(['DIV']);

		flushSync(() => {
			expect((initial as any)[HMR].update(updated)).toBe(true);
		});

		expect(r.find('span').textContent).toBe('after');
		expect(seen.splice(0)).toEqual([null, 'SPAN']);
		r.unmount();
	});

	it('rejects an update whose compiled output ABI is incompatible', () => {
		const v1: ComponentBody<any> = ((_props: any, scope: Scope) => {
			clearBlockRange(scope);
			const root = document.createElement('span');
			root.className = 'leaf';
			root.textContent = 'committed';
			scope.block.parentNode.insertBefore(root, scope.block.endMarker);
		}) as ComponentBody<any>;
		const v2: ComponentBody<any> = ((_props: any, scope: Scope) => {
			clearBlockRange(scope);
			const root = document.createElement('span');
			root.className = 'leaf';
			root.textContent = 'incompatible';
			scope.block.parentNode.insertBefore(root, scope.block.endMarker);
		}) as ComponentBody<any>;
		(v2 as any).__octaneReturnedOutput = true;

		const Foo = hmr(v1);
		const r = mount(Foo);
		let accepted = true;
		flushSync(() => {
			accepted = (Foo as any)[HMR].update(hmr(v2));
		});
		expect(accepted).toBe(false);
		expect((Foo as any)[HMR].fn).toBe(v1);
		expect(r.find('.leaf').textContent).toBe('committed');
		r.unmount();
	});

	it('preserves hook state across update() — stable Symbol.for keys', () => {
		// Both bodies use the SAME hook symbol (simulating the compiler's
		// `Symbol.for('octane:file.tsrx:Foo.useState#0')`-stable emit).
		const HOOK_SYM = Symbol.for('octane:hmr.test.ts:Counter.useState#0');
		const v1: ComponentBody<any> = ((_props: any, scope: Scope, _extra: any) => {
			const [n] = useState(0, HOOK_SYM as any);
			clearBlockRange(scope);
			const root = document.createElement('span');
			root.className = 'leaf';
			root.textContent = 'v1:' + n;
			scope.block.parentNode.insertBefore(root, scope.block.endMarker);
		}) as ComponentBody<any>;
		const v2: ComponentBody<any> = ((_props: any, scope: Scope, _extra: any) => {
			const [n, setN] = useState(0, HOOK_SYM as any);
			clearBlockRange(scope);
			const root = document.createElement('button');
			root.className = 'leaf';
			root.id = 'bump';
			root.textContent = 'v2:' + n;
			root.onclick = () => setN((c: number) => c + 1);
			scope.block.parentNode.insertBefore(root, scope.block.endMarker);
		}) as ComponentBody<any>;

		const Counter = hmr(v1);
		const r = mount(Counter);
		expect(r.find('.leaf').textContent).toBe('v1:0');

		// First push state forward via a "new module" v1' that increments.
		// We achieve that here by swapping to v2 (which uses the same Symbol),
		// bumping via click, then swapping back to v1.
		flushSync(() => {
			(Counter as any)[HMR].update(hmr(v2));
		});
		expect(r.find('.leaf').textContent).toBe('v2:0');
		// Click to bump the state.
		r.click('#bump');
		expect(r.find('.leaf').textContent).toBe('v2:1');

		// Now swap BACK to v1 — the state should still be 1 (NOT reset to 0),
		// proving the hooks Map survived the body swap because both versions
		// used the same Symbol.for() key.
		flushSync(() => {
			(Counter as any)[HMR].update(hmr(v1));
		});
		expect(r.find('.leaf').textContent).toBe('v1:1');

		r.unmount();
	});

	it('refreshes null-guarded output but declines incompatible returned-value edits', async () => {
		const direct = await compileHmrComponent(
			`export function Foo(p) @{ <span>{p.label as string}</span> }`,
			'Foo',
		);
		const mixed = await compileHmrComponent(
			`export function Foo(p) @{ if (p.empty) return null; <span>{p.label as string}</span> }`,
			'Foo',
		);
		const returned = await compileHmrComponent(
			`export function Foo(p) @{ if (p.empty) return 'empty'; <span>{p.label as string}</span> }`,
			'Foo',
		);
		const r = mount(direct, { label: 'before', empty: false });
		try {
			flushSync(() => expect((direct as any)[HMR].update(mixed)).toBe(true));
			expect(r.find('span').textContent).toBe('before');
			r.update(direct, { label: 'hidden', empty: true });
			expect(r.container.textContent).toBe('');
			r.update(direct, { label: 'after', empty: false });
			expect(r.find('span').textContent).toBe('after');
			flushSync(() => expect((direct as any)[HMR].update(returned)).toBe(false));
			expect(r.find('span').textContent).toBe('after');
		} finally {
			r.unmount();
		}
	});

	it('webpack HMR preserves named and default wrapper identity across repeated updates', async () => {
		const { compile } = await import('octane/compiler');
		const runtime = new Proxy(
			{ hmr, HMR },
			{
				get(target, property) {
					return (target as any)[property] ?? (() => undefined);
				},
			},
		);
		const compileVersion = (version: number) =>
			compile(
				`export function Named() @{ <span>{'named ${version}'}</span> }\n` +
					`export default function Default() @{ <b>{'default ${version}'}</b> }\n`,
				'file.tsrx',
				{ hmr: 'webpack' },
			).code;
		const evaluate = (code: string, data: Record<string, any> | undefined) => {
			const transformed =
				code
					.replace(
						/^import\s*\{([\s\S]*?)\}\s*from\s*(['"])octane\2;/m,
						(_match, imports: string) => {
							const properties = imports
								.split(',')
								.map((specifier) => specifier.trim().replace(/\s+as\s+/, ': '))
								.join(', ');
							return `const { ${properties} } = runtime;`;
						},
					)
					.replace(/\bexport let /g, 'let ')
					.replace(/export\s*\{\s*Default\s+as\s+default\s*\};/g, '')
					.replaceAll('import.meta.webpackHot', 'hot') + '\nreturn { Named, default: Default };';
			let dispose: ((value: Record<string, any>) => void) | undefined;
			let accepted = false;
			let invalidated = false;
			const hot = {
				data,
				dispose(callback: (value: Record<string, any>) => void) {
					dispose = callback;
				},
				accept() {
					accepted = true;
				},
				invalidate() {
					invalidated = true;
				},
			};
			const exports = Function('runtime', 'hot', transformed)(runtime, hot) as {
				Named: any;
				default: any;
			};
			const nextData: Record<string, any> = {};
			dispose?.(nextData);
			expect(accepted).toBe(true);
			expect(invalidated).toBe(false);
			return { exports, data: nextData };
		};

		const first = evaluate(compileVersion(1), undefined);
		const firstNamedBody = first.exports.Named[HMR].fn;
		const firstDefaultBody = first.exports.default[HMR].fn;
		const second = evaluate(compileVersion(2), first.data);
		expect(second.exports.Named).toBe(first.exports.Named);
		expect(second.exports.default).toBe(first.exports.default);
		expect(second.exports.Named[HMR].fn).not.toBe(firstNamedBody);
		expect(second.exports.default[HMR].fn).not.toBe(firstDefaultBody);

		const secondNamedBody = second.exports.Named[HMR].fn;
		const secondDefaultBody = second.exports.default[HMR].fn;
		const third = evaluate(compileVersion(3), second.data);
		expect(third.exports.Named).toBe(first.exports.Named);
		expect(third.exports.default).toBe(first.exports.default);
		expect(third.exports.Named[HMR].fn).not.toBe(secondNamedBody);
		expect(third.exports.default[HMR].fn).not.toBe(secondDefaultBody);

		const output = compileVersion(3);
		expect(output).toContain('const _$webpackHot = import.meta.webpackHot;');
		expect(output).toContain('_$webpackHot.dispose');
		expect(output).toContain('_$webpackHot.accept();');
		expect(output).not.toContain('import.meta.webpackHot.data');
		expect(output).not.toContain('import.meta.hot');
	});

	it('wraps plain return-JSX exports for both HMR dialects', async () => {
		const { compile } = await import('octane/compiler');
		const source =
			`export function Named() { return <span>{'named'}</span>; }\n` +
			`export default function Default() { return <b>{'default'}</b>; }\n`;
		const vite = compile(source, 'file.tsx', { hmr: 'vite' }).code;
		expect(vite).toContain('Named = _$hmr(Named);');
		expect(vite).toContain('Default = _$hmr(Default);');
		expect(vite).toContain('import.meta.hot.accept');

		const webpack = compile(source, 'file.tsx', { hmr: 'webpack' }).code;
		expect(webpack).toContain('export { Named };');
		expect(webpack).toContain('export { Default as default };');
		expect(webpack).toContain('_$webpackHot.dispose');
	});

	it('hmr option off → no wrapping, no accept block', async () => {
		const { compile } = await import('octane/compiler');
		const src = "export function Foo() @{ <span>{'hi'}</span> }\n";
		const { code } = compile(src, 'file.tsrx'); // no { hmr: true }
		expect(code).not.toMatch(/hmr\(/);
		expect(code).not.toMatch(/import\.meta\.hot/);
	});

	it('hmr option off → proven render-scope hooks use tiny local numbers', async () => {
		// Only HMR's re-import needs Symbol.for registry identity. Production
		// component bodies run in a fresh Scope, so direct base hooks need only a
		// local integer. The app output carries neither a range reservation nor the
		// module id (an absolute Vite path). Arbitrary helpers and custom-hook
		// boundaries retain runtime-ranged Symbols.
		const { compile } = await import('octane/compiler');
		const src =
			"import { useState } from 'octane';\n" +
			'export function Foo() @{\n' +
			'  const [n, setN] = useState(0);\n' +
			'  <button onClick={() => setN(n + 1)}>{n as string}</button>\n' +
			'}\n';
		const { code } = compile(src, '/abs/path/to/file.tsrx'); // no { hmr: true }
		expect(code).toMatch(/useState\(0, 0\)/);
		expect(code).not.toMatch(/const _h\$\d+ = \d+;/);
		expect(code).not.toContain('_$hookSlots');
		expect(code).not.toMatch(/Symbol\(/);
		expect(code).not.toMatch(/Symbol\.for/);
		expect(code).not.toMatch(/abs\/path/);
	});

	it('slotHooks (plain .ts pass) follows the same gate', async () => {
		const { slotHooks } = await import('../src/compiler/slot-hooks.js');
		const src =
			"import { useState } from 'octane';\n" +
			'export function useCounter() {\n' +
			'  const [n, setN] = useState(0);\n' +
			'  return [n, setN];\n' +
			'}\n';
		const dev = slotHooks(src, '/abs/custom.ts', { hmr: true });
		expect(dev?.code).toMatch(/Symbol\.for\("octane:\/abs\/custom\.ts:useCounter\.useState#0"\)/);
		const prod = slotHooks(src, '/abs/custom.ts');
		expect(prod?.code).toMatch(/_\$hookSlots\(1\)/);
		expect(prod?.code).toMatch(/const _h\$0 = \/\* @__PURE__ \*\/ Symbol\(_hs\$\);/);
		expect(prod?.code).not.toMatch(/Symbol\.for|abs\/custom/);
	});

	it('slots first-class subtemplate hooks once with the callable-helper ABI', async () => {
		const { compile } = await import('octane/compiler');
		const { code } = compile(
			`import { useState } from 'octane';
			 export function App() @{
			   const child = () => @{ const [value] = useState(1); <span>{value as string}</span> };
			   <div>{child}</div>
			 }`,
			'subtemplate-slots.tsrx',
			{ hmr: false },
		);
		const call = code.match(/useState\(1, ([^)]+)\)/);
		expect(call?.[1]).toMatch(/^_h\$\d+$/);
		expect(code).not.toMatch(/useState\(1, _h\$\d+, _h\$\d+\)/);
		expect(code).toMatch(/const _h\$\d+ = \/\* @__PURE__ \*\/ Symbol\(_hs\$(?: \+ \d+)?\);/);
	});

	it('avoids user bindings when naming full-compiler and surgical slot declarations', async () => {
		const { compile } = await import('octane/compiler');
		const source = `import { useState } from 'octane';
			const _hs$ = 'user base';
			const _$hookSlots = 'user helper';
			export function helper() { const _h$0 = 'user site'; return useState(1); }`;
		const full = compile(source, 'slot-names.tsrx', { hmr: false }).code;
		expect(full).toContain('hookSlots as _$hookSlots$');
		expect(full).toContain('const _hs$$ = /* @__PURE__ */ _$hookSlots$(1);');
		expect(full).toMatch(/const _h\$0\$ = \/\* @__PURE__ \*\/ Symbol\(_hs\$\$\);/);
		expect(full).toContain('useStateWithGetter(1, _h$0$)');

		const { slotHooks } = await import('../src/compiler/slot-hooks.js');
		const surgical = slotHooks(source, 'slot-names.ts')!.code;
		expect(surgical).toContain('hookSlots as _$hookSlots$');
		expect(surgical).toContain('const _hs$$ = /* @__PURE__ */ _$hookSlots$(1);');
		expect(surgical).toMatch(/const _h\$0\$ = \/\* @__PURE__ \*\/ Symbol\(_hs\$\$\);/);
		expect(surgical).toContain('useStateWithGetter(1, _h$0$)');
	});

	it('avoids a hookSlots helper collision in client and server component output', async () => {
		const { compile } = await import('octane/compiler');
		const source = `import { useState } from 'octane';
			const _$hookSlots = 'user helper';
			export function App() {
				const state = useState(1);
				return <div>{state[0] as string}</div>;
			}`;
		for (const mode of ['client', 'server'] as const) {
			const code = compile(source, `slot-helper-${mode}.tsrx`, { mode, hmr: false }).code;
			expect(code).toContain('hookSlots as _$hookSlots$');
			expect(code).toContain('/* @__PURE__ */ _$hookSlots$(1)');
		}
	});
});
