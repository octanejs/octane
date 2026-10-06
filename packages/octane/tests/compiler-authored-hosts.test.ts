import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'octane/server';
import { flushSync, hydrateRoot } from '../src/index.js';
import { act, mount } from './_helpers.js';
import { loadCompiledFixtureSource } from './_server-fixture.js';

const mode = process.env.OCTANE_TEST_COMPILE_MODE === 'prod' ? 'prod' : 'dev';
function fixture(source: string, server = false) {
	return loadCompiledFixtureSource(source, {
		id: 'compiler-authored-hosts.tsrx',
		mode: server ? 'server' : 'client',
		compileOptions: { dev: mode === 'dev', hmr: false },
	});
}

describe('authored host JSX', () => {
	it.each(['direct', 'spread', 'descriptor'])(
		'only suppresses hydration differences for literal true through %s props',
		async (kind) => {
			const attr =
				kind === 'spread'
					? '{...{suppressHydrationWarning: suppress}}'
					: 'suppressHydrationWarning={suppress}';
			const source =
				kind === 'descriptor'
					? `import {createElement} from 'octane'; export function App({value, suppress}) { return createElement('p', {suppressHydrationWarning: suppress}, value); }`
					: `export function App({value, suppress}) @{ <p ${attr}>{value as string}</p> }`;
			const { App } = fixture(source);
			const server = fixture(source, true).App;
			for (const suppress of [undefined, null, false, true]) {
				const container = document.createElement('div');
				container.innerHTML = renderToString(server, { value: 'server', suppress }).html;
				document.body.append(container);
				const original = container.querySelector('p');
				const recovered: unknown[] = [];
				const root = hydrateRoot(
					container,
					App,
					{ value: 'client', suppress },
					{ onRecoverableError: (error) => recovered.push(error) },
				);
				try {
					flushSync(() => {});
					await Promise.resolve();
					if (suppress === true) {
						// The parent's suppressHydrationWarning keeps the server text.
						expect(container.querySelector('p')).toBe(original);
						expect(container.textContent).toBe('server');
						expect(recovered).toHaveLength(0);
					} else {
						// A text mismatch with no boundary client-renders the root, once.
						expect(container.querySelector('p')).not.toBe(original);
						expect(original!.isConnected).toBe(false);
						expect(container.textContent).toBe('client');
						expect(recovered).toHaveLength(1);
					}
				} finally {
					root.unmount();
					container.remove();
				}
			}
		},
	);

	it('limits hydration suppression to the authored element', async () => {
		const source = `export function App({value}) @{ <section suppressHydrationWarning><p>{value as string}</p></section> }`;
		const container = document.createElement('div');
		container.innerHTML = renderToString(fixture(source, true).App, { value: 'server' }).html;
		document.body.append(container);
		const recovered: unknown[] = [];
		const root = hydrateRoot(
			container,
			fixture(source).App,
			{ value: 'client' },
			{ onRecoverableError: (error) => recovered.push(error) },
		);
		try {
			flushSync(() => {});
			expect(container.textContent).toBe('client');
			await Promise.resolve();
			expect(recovered).toHaveLength(1);
		} finally {
			root.unmount();
			container.remove();
		}
	});

	it('keeps conditional JSX at its sibling position on mount and reinsertion', () => {
		const source = `function Row({label}) @{ <li>{label as string}</li> }
			export function App({show}) @{ <ul><li>first</li>{show ? <Row label="middle"/> : null}<li>last</li></ul> }`;
		const { App } = fixture(source);
		const r = mount(App, { show: true });
		try {
			expect(r.findAll('li').map((n) => n.textContent)).toEqual(['first', 'middle', 'last']);
			r.update(App, { show: false });
			expect(r.findAll('li').map((n) => n.textContent)).toEqual(['first', 'last']);
			r.update(App, { show: true });
			expect(r.findAll('li').map((n) => n.textContent)).toEqual(['first', 'middle', 'last']);
		} finally {
			r.unmount();
		}
	});

	it('applies JSX whitespace and entity rules consistently to text and quoted attributes', () => {
		const source = `export function App({a, b}) @{ <div title="a&quot;b"><p>{a as string} {b as string}</p><p><b>x</b> <i>y</i></p><section>\n  hello\n  world &amp; &#x1f680; &nbsp;\n</section><pre>\n  preserved\n</pre></div> }`;
		const client = fixture(source);
		const server = fixture(source, true);
		const r = mount(client.App, { a: 'A', b: 'B' });
		try {
			expect(r.find('div').getAttribute('title')).toBe('a"b');
			expect(r.findAll('p').map((n) => n.textContent)).toEqual(['A B', 'x y']);
			expect(r.find('section').textContent).toBe('hello world & 🚀 \u00a0');
			expect(r.find('pre').textContent).toBe('preserved');
			const { html } = renderToString(server.App, { a: 'A', b: 'B' });
			const parsed = document.createElement('div');
			parsed.innerHTML = html;
			expect(parsed.textContent).toBe(r.container.textContent);
			expect(parsed.querySelector('div')?.getAttribute('title')).toBe('a"b');
		} finally {
			r.unmount();
		}
	});

	it('remounts a keyed host when its key changes and retains it for a stable key', () => {
		const { App } = fixture(
			`export function App({reset}) @{ <div><input key={reset} defaultValue="seed"/><span>tail</span></div> }`,
		);
		const r = mount(App, { reset: 1 });
		try {
			const input = r.find('input') as HTMLInputElement;
			input.value = 'edited';
			r.update(App, { reset: 1 });
			expect(r.find('input')).toBe(input);
			expect((r.find('input') as HTMLInputElement).value).toBe('edited');
			r.update(App, { reset: 2 });
			expect(r.find('input')).not.toBe(input);
			expect((r.find('input') as HTMLInputElement).value).toBe('seed');
			expect(r.container.textContent).toBe('tail');
		} finally {
			r.unmount();
		}
	});

	it('hydrates keyed hosts and conditional siblings by adopting existing nodes', () => {
		const source = `export function App({reset, show}) @{ <main><input key={reset} defaultValue="seed"/>{show ? <i>middle</i> : null}<span>tail</span></main> }`;
		const client = fixture(source);
		const server = fixture(source, true);
		const container = document.createElement('div');
		container.innerHTML = renderToString(server.App, { reset: 1, show: true }).html;
		document.body.appendChild(container);
		const input = container.querySelector('input')!;
		const tail = container.querySelector('span');
		input.value = 'typed';
		const warnings = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = hydrateRoot(container, client.App, { reset: 1, show: true });
		try {
			flushSync(() => {});
			expect(container.querySelector('input')).toBe(input);
			expect(container.querySelector('span')).toBe(tail);
			expect(input.value).toBe('typed');
			expect(container.textContent).toBe('middletail');
			expect(warnings).not.toHaveBeenCalled();
			flushSync(() => root.render(client.App, { reset: 2, show: false }));
			expect(container.querySelector('input')).not.toBe(input);
			expect(container.querySelector('span')).toBe(tail);
			expect(container.textContent).toBe('tail');
		} finally {
			root.unmount();
			container.remove();
			warnings.mockRestore();
		}
	});

	it.each([
		'[<b key="a">A</b>, <i key="b">B</i>]',
		'show ? <b>A</b> : <i>B</i>',
		'show && <b>A</b>',
	])('compiles portal expression children: %s', (body) => {
		const { App } = fixture(
			`import { createPortal } from 'octane'; export function App({target, show}) @{ <main>{createPortal(${body}, target)}<span>tail</span></main> }`,
		);
		const target = document.createElement('div');
		document.body.appendChild(target);
		const r = mount(App, { target, show: true });
		try {
			expect(target.textContent).toBe(body.startsWith('[') ? 'AB' : 'A');
			expect(r.container.textContent).toBe('tail');
			r.update(App, { target, show: false });
			expect(target.textContent).toBe(body.startsWith('[') ? 'AB' : body.includes('?') ? 'B' : '');
		} finally {
			r.unmount();
			target.remove();
		}
	});

	it('renders style markup supplied through an ordinary host prop', () => {
		const source = `export function App({css}) @{ <div><style dangerouslySetInnerHTML={{__html: css}}/><span>text</span></div> }`;
		const { App } = fixture(source);
		const r = mount(App, { css: '.x { color: red; }' });
		try {
			expect(r.find('style').textContent).toBe('.x { color: red; }');
			r.update(App, { css: '.x { color: blue; }' });
			expect(r.find('style').textContent).toBe('.x { color: blue; }');
			expect(
				renderToString(fixture(source, true).App, { css: '.x { color: red; }' }).html,
			).toContain('<style>.x { color: red; }</style>');
		} finally {
			r.unmount();
		}
	});

	it.each([
		'<p><div data-value={value}>inside</div></p>',
		'<select><div data-value={value}>inside</div></select>',
		'<a><a data-value={value}>inside</a></a>',
		'<div><tr data-value={value}><td>inside</td></tr></div>',
		'<table><tr data-value={value}><td>inside</td></tr></table>',
	])('retains authored DOM and live bindings through parser-sensitive nesting: %s', (body) => {
		const { App } = fixture(`export function App({value}) @{ ${body} }`);
		const warning = vi.spyOn(console, 'error').mockImplementation(() => {});
		const r = mount(App, { value: 'one' });
		try {
			expect(r.container.textContent).toBe('inside');
			const child = r.find('[data-value]');
			expect(child.getAttribute('data-value')).toBe('one');
			r.update(App, { value: 'two' });
			expect(r.find('[data-value]')).toBe(child);
			expect(child.getAttribute('data-value')).toBe('two');
		} finally {
			r.unmount();
			warning.mockRestore();
		}
	});

	it('sets static media boolean properties on mount', () => {
		const { App } = fixture('export function App() @{ <video muted/> }');
		const r = mount(App);
		try {
			expect((r.find('video') as HTMLVideoElement).muted).toBe(true);
		} finally {
			r.unmount();
		}
	});

	it('omits nonnumeric literals for integer-valued HTML attributes', () => {
		const source = `export function App() @{ <><ol start="invalid"><li>item</li></ol><table><tbody><tr><td rowSpan="invalid">cell</td></tr></tbody></table></> }`;
		const { App } = fixture(source);
		const r = mount(App);
		try {
			expect(r.find('ol').hasAttribute('start')).toBe(false);
			expect(r.find('td').hasAttribute('rowspan')).toBe(false);
			const parsed = document.createElement('div');
			parsed.innerHTML = renderToString(fixture(source, true).App).html;
			expect(parsed.querySelector('ol')?.hasAttribute('start')).toBe(false);
			expect(parsed.querySelector('td')?.hasAttribute('rowspan')).toBe(false);
		} finally {
			r.unmount();
		}
	});

	it('renders a stylesheet without precedence at its authored position', () => {
		const source =
			'export function App() @{ <main><span>before</span><link rel="stylesheet" href="audit-local.css"/><span>after</span></main> }';
		const { App } = fixture(source);
		const r = mount(App);
		try {
			expect(Array.from(r.find('main').children).map((n) => n.tagName)).toEqual([
				'SPAN',
				'LINK',
				'SPAN',
			]);
			const parsed = document.createElement('div');
			parsed.innerHTML = renderToString(fixture(source, true).App).html;
			expect(parsed.querySelector('main > link')?.getAttribute('href')).toBe('audit-local.css');
		} finally {
			r.unmount();
		}
	});
	it('warms independent use calls under an imported JSX Suspense boundary', () => {
		const calls: string[] = [];
		const pending = new Promise(() => {});
		const source = `import { use, Suspense as Boundary } from 'octane';
			import { load } from 'audit-loader';
			function First() @{ const value = use(load('first')); <p>{value as string}</p> }
			function Second() @{ const value = use(load('second')); <p>{value as string}</p> }
			export function App() @{ <Boundary fallback={<p>loading</p>}><First/><Second/></Boundary> }`;
		const { App } = loadCompiledFixtureSource(source, {
			id: 'compiler-warm-boundary.tsrx',
			mode: 'client',
			compileOptions: { dev: mode === 'dev', hmr: false },
			runtimeModules: {
				'audit-loader': {
					load: (name: string) => {
						calls.push(name);
						return pending;
					},
				},
			},
		});
		const r = mount(App);
		try {
			expect(new Set(calls)).toEqual(new Set(['first', 'second']));
			expect(r.container.textContent).toBe('loading');
		} finally {
			r.unmount();
		}
	});

	it('supports memo-wrapped named template functions', () => {
		const source = `import { memo } from 'octane';
			export const App = memo(function View({value}) @{ <p>{value as string}</p> });`;
		const { App } = fixture(source);
		const r = mount(App, { value: 'one' });
		try {
			expect(r.container.textContent).toBe('one');
			r.update(App, { value: 'two' });
			expect(r.container.textContent).toBe('two');
			expect(renderToString(fixture(source, true).App, { value: 'one' }).html).toContain('one');
		} finally {
			r.unmount();
		}
	});

	it('ignores textContent and innerText props on authored host elements', () => {
		const source = `export function App() @{ <div textContent="replacement" innerText="replacement"><span>kept</span></div> }`;
		const { App } = fixture(source);
		const r = mount(App);
		try {
			expect(r.container.innerHTML).toBe('<div><span>kept</span></div>');
			expect(renderToString(fixture(source, true).App).html).toBe('<div><span>kept</span></div>');
		} finally {
			r.unmount();
		}
	});

	it('starts sibling lazy imports together under JSX Suspense', () => {
		const calls: string[] = [];
		const source = `import { lazy, Suspense } from 'octane'; import { load } from 'audit-loader';
			const First = lazy(() => load('first'));
			const Second = lazy(() => load('second'));
			export function App() @{ <Suspense fallback={<p>loading</p>}><First/><Second/></Suspense> }`;
		const { App } = loadCompiledFixtureSource(source, {
			id: 'compiler-lazy-boundary.tsrx',
			mode: 'client',
			compileOptions: { dev: mode === 'dev', hmr: false },
			runtimeModules: {
				'audit-loader': {
					load: (name: string) => {
						calls.push(name);
						return new Promise(() => {});
					},
				},
			},
		});
		const r = mount(App);
		try {
			expect(new Set(calls)).toEqual(new Set(['first', 'second']));
			expect(r.container.textContent).toBe('loading');
		} finally {
			r.unmount();
		}
	});

	it('keeps independent state for useFormState aliases without a permalink', async () => {
		const source = `import { useFormState } from 'octane';
			export function App({capture}) @{
				const [a, sendA] = useFormState((value, suffix) => value + suffix, 'a');
				const [b, sendB] = useFormState((value, suffix) => value + suffix, 'b');
				capture(sendA, sendB);
				<p>{a + b as string}</p>
			}`;
		const { App } = fixture(source);
		let first!: (value: string) => void;
		let second!: (value: string) => void;
		const r = mount(App, {
			capture: (a: typeof first, b: typeof second) => {
				first = a;
				second = b;
			},
		});
		try {
			expect(r.container.textContent).toBe('ab');
			await act(() => first('!'));
			expect(r.container.textContent).toBe('a!b');
			await act(() => second('?'));
			expect(r.container.textContent).toBe('a!b?');
		} finally {
			r.unmount();
		}
	});

	it('does not copy speculative fetch behavior onto a wrapper when statics are hoisted', () => {
		const calls: string[] = [];
		const pending = new Promise(() => {});
		const source = `import { use, Suspense } from 'octane';
			import { load, hoist } from 'audit-loader';
			function Inner() @{ const value = use(load('inner')); <p>{value as string}</p> }
			function Wait() @{ const value = use(load('wait')); <p>{value as string}</p> }
			const Wrapped = hoist(function Wrapper() { return <p>wrapper</p>; }, Inner);
			export function App() @{ <Suspense fallback={<p>loading</p>}><Wait/><Wrapped/></Suspense> }`;
		const { App } = loadCompiledFixtureSource(source, {
			id: 'compiler-hoisted-warm.tsrx',
			mode: 'client',
			compileOptions: { dev: mode === 'dev', hmr: false },
			runtimeModules: {
				'audit-loader': {
					load: (name: string) => {
						calls.push(name);
						return pending;
					},
					hoist: (wrapper: Function, inner: Function) => {
						for (const key of Reflect.ownKeys(inner)) {
							if (
								typeof key === 'string' &&
								['name', 'length', 'prototype', 'caller', 'arguments'].includes(key)
							)
								continue;
							Object.defineProperty(wrapper, key, Object.getOwnPropertyDescriptor(inner, key)!);
						}
						return wrapper;
					},
				},
			},
		});
		const r = mount(App);
		try {
			expect(calls).toContain('wait');
			expect(calls).not.toContain('inner');
			expect(r.container.textContent).toBe('loading');
		} finally {
			r.unmount();
		}
	});

	it('supports template render functions inside ordinary try statements', () => {
		const source = `export function App({value}) @{ let result;
			try { result = () => @{ <p>{value as string}</p> }; } catch { result = null; }
			<div>{result}</div> }`;
		const { App } = fixture(source);
		const r = mount(App, { value: 'one' });
		try {
			expect(r.container.textContent).toBe('one');
			r.update(App, { value: 'two' });
			expect(r.container.textContent).toBe('two');
		} finally {
			r.unmount();
		}
	});

	it('mounts and updates noscript element children', () => {
		const source = `export function App({value}) @{ <div><noscript><b>{value as string}</b></noscript><span>tail</span></div> }`;
		const { App } = fixture(source);
		const r = mount(App, { value: 'one' });
		try {
			expect(r.find('noscript').firstElementChild?.tagName).toBe('B');
			expect(r.find('noscript').textContent).toBe('one');
			r.update(App, { value: 'two' });
			expect(r.find('noscript').textContent).toBe('two');
			expect(r.find('span').textContent).toBe('tail');
		} finally {
			r.unmount();
		}
	});

	it('compiles authored document structure and places metadata inside its head', () => {
		const source = `export function App() @{ <html lang="en"><head><title>Document title</title><meta name="description" content="description"/></head><body><main>body</main></body></html> }`;
		const { App } = fixture(source);
		const r = mount(App);
		try {
			expect(r.find('html').getAttribute('lang')).toBe('en');
			expect(r.find('body main').textContent).toBe('body');
			const html = renderToString(fixture(source, true).App).html;
			expect(html).toContain('<head>');
			expect(html.indexOf('<html')).toBeLessThan(html.indexOf('<head>'));
			expect(html.indexOf('<head>')).toBeLessThan(html.indexOf('<title>'));
			expect(html.indexOf('</title>')).toBeLessThan(html.indexOf('</head>'));
		} finally {
			r.unmount();
		}
	});
});

describe('explicit keys in @for rows', () => {
	// A virtualizer-style row: the child is an opaque render call, so nothing
	// about the row's content can be proven stable at compile time.
	function opaqueRowSource(header: string, rootKey: string) {
		return `export function App(props) @{ <section>
			@for (const row of props.rows${header}) {
				<div${rootKey} class="row" data-index={row.index}>{props.render(row)}</div>
			}
			<span>tail</span>
		</section> }`;
	}
	const opaqueRowSpellings = [
		['header key', '; key row.index', ''],
		['root key attribute', '', ' key={row.index}'],
		['root key attribute over a header key', '; key row.slot', ' key={row.index}'],
	] as const;
	// `slot` changes on every render, so only `index` can preserve a row.
	let slotRender = 0;
	function opaqueRows(indexes: number[]) {
		slotRender++;
		return indexes.map((index) => ({ index, slot: `${slotRender}:${index}` }));
	}
	const render = (row: { index: number }) => `Row ${row.index}`;
	function sectionChildren(container: Element) {
		return [...container.querySelector('section')!.children].map((child) =>
			child.classList.contains('row') ? `${child.textContent}` : child.tagName.toLowerCase(),
		);
	}

	it.each(opaqueRowSpellings)(
		'moves, removes, and inserts opaque rows by their %s',
		(_, header, rootKey) => {
			const { App } = fixture(opaqueRowSource(header, rootKey));
			const r = mount(App, { rows: opaqueRows([0, 1, 2, 3, 4]), render });
			try {
				const rows = r.findAll('.row');
				const tail = r.find('span');
				expect(sectionChildren(r.container)).toEqual([
					'Row 0',
					'Row 1',
					'Row 2',
					'Row 3',
					'Row 4',
					'span',
				]);

				r.update(App, { rows: opaqueRows([3, 1, 0, 4]), render });
				expect(sectionChildren(r.container)).toEqual(['Row 3', 'Row 1', 'Row 0', 'Row 4', 'span']);
				expect(r.findAll('.row')).toEqual([rows[3], rows[1], rows[0], rows[4]]);
				expect(rows[2].isConnected).toBe(false);

				r.update(App, { rows: opaqueRows([5, 3, 1]), render });
				expect(sectionChildren(r.container)).toEqual(['Row 5', 'Row 3', 'Row 1', 'span']);
				expect(r.findAll('.row').slice(1)).toEqual([rows[3], rows[1]]);
				expect(rows[0].isConnected || rows[4].isConnected).toBe(false);
				expect(r.find('span')).toBe(tail);
			} finally {
				r.unmount();
			}
		},
	);

	it.each(opaqueRowSpellings)(
		'adopts server-rendered opaque rows and keeps them by their %s',
		(_, header, rootKey) => {
			const source = opaqueRowSource(header, rootKey);
			const { App } = fixture(source);
			const props = { rows: opaqueRows([0, 1, 2]), render };
			const container = document.createElement('div');
			container.innerHTML = renderToString(fixture(source, true).App, props).html;
			document.body.append(container);
			const rows = [...container.querySelectorAll('.row')];
			const tail = container.querySelector('span');
			const recovered: unknown[] = [];
			const root = hydrateRoot(container, App, props, {
				onRecoverableError: (error) => recovered.push(error),
			});
			try {
				flushSync(() => {});
				expect([...container.querySelectorAll('.row')]).toEqual(rows);
				flushSync(() => root.render(App, { rows: opaqueRows([2, 0, 3]), render }));
				expect(sectionChildren(container)).toEqual(['Row 2', 'Row 0', 'Row 3', 'span']);
				expect([...container.querySelectorAll('.row')].slice(0, 2)).toEqual([rows[2], rows[0]]);
				expect(rows[1].isConnected).toBe(false);
				expect(container.querySelector('span')).toBe(tail);
				expect(recovered).toEqual([]);
			} finally {
				root.unmount();
				container.remove();
			}
		},
	);

	// A root key names the row exactly as the header key does, so the reconciler
	// reads it once per reconcile. An input a row mutates while rendering takes
	// effect whenever the next read happens, identically for either spelling.
	it.each([
		[
			'a key input changed by another row',
			(key: { header: string; root: string }) => `import { keyState } from '@test/key-state';
				export function App({items}) @{ <section>
					@for (const item of items${key.header}) {
						<input${key.root} data-id={item.id} data-touch={keyState.touch(item)} defaultValue="seed"/>
					}
					<span>tail</span>
				</section> }`,
			'keyState.version + ":" + item.id',
		],
		[
			'a key input changed by its own row',
			(key: { header: string; root: string }) => `import { keyState } from '@test/key-state';
				export function App({items}) @{ <section>
					@for (const item of items${key.header}) {
						<input data-mutated={item.key = item.id + keyState.reset}${key.root} data-id={item.id} defaultValue="seed"/>
					}
					<span>tail</span>
				</section> }`,
			'item.key',
		],
	])('reads %s the same way through either key spelling', (_, source, keyExpression) => {
		function trace(key: { header: string; root: string }) {
			const keyState = {
				version: 0,
				reset: 0,
				active: false,
				touch(item: { id: string }) {
					if (this.active && item.id === 'a') this.version++;
					return this.version;
				},
			};
			const { App } = loadCompiledFixtureSource(source(key), {
				id: 'compiler-authored-hosts.tsrx',
				mode: 'client',
				compileOptions: { dev: mode === 'dev', hmr: false },
				runtimeModules: { '@test/key-state': { keyState } },
			});
			const items = ['a', 'b', 'c'].map((id) => ({ id, key: id + '0' }));
			const r = mount(App, { items });
			const steps: string[][] = [];
			try {
				const originals = new Set(r.findAll('input'));
				for (const input of originals) (input as HTMLInputElement).value = 'typed';
				const record = () =>
					steps.push(
						(r.findAll('input') as HTMLInputElement[]).map(
							(input) =>
								`${input.dataset.id}:${originals.has(input) ? 'kept' : 'new'}:${input.value}`,
						),
					);
				keyState.active = true;
				keyState.reset = 1;
				r.update(App, { items: items.toReversed() });
				record();
				r.update(App, { items: items.toReversed() });
				record();
				r.update(App, { items });
				record();
				expect(r.find('section')!.lastElementChild!.tagName).toBe('SPAN');
			} finally {
				r.unmount();
			}
			return steps;
		}
		const headerTrace = trace({ header: `; key ${keyExpression}`, root: '' });
		expect(trace({ header: '', root: ` key={${keyExpression}}` })).toEqual(headerTrace);
		// Every step still renders each item exactly once, in order.
		expect(headerTrace.map((step) => step.map((entry) => entry[0]).join(''))).toEqual([
			'cba',
			'cba',
			'abc',
		]);
	});

	function inputSource(header: string) {
		return `export function App({items, onPick}) @{ <section>
			@for (const item of items${header}) {
				<input key={item.reset} data-id={item.id} defaultValue={item.label} onClick={() => onPick(item.id)}/>
			}
			<span>tail</span>
		</section> }`;
	}

	it('refreshes imported mutable row keys when the items and props retain their identity', () => {
		const keyState = { reset: 0 };
		const { App } = loadCompiledFixtureSource(
			`import { keyState } from '@test/key-state';
			export function App({items}) @{ <section>
				@for (const item of items; key item.id) {
					<input key={keyState.reset + ':' + item.id} defaultValue={item.label}/>
				}
			</section> }`,
			{
				id: 'compiler-authored-hosts.tsrx',
				mode: 'client',
				compileOptions: { dev: mode === 'dev', hmr: false },
				runtimeModules: { '@test/key-state': { keyState } },
			},
		);
		const props = { items: [{ id: 'a', label: 'Alpha' }] };
		const r = mount(App, props);
		try {
			const input = r.find('input') as HTMLInputElement;
			input.value = 'typed Alpha';
			r.update(App, props);
			expect(r.find('input')).toBe(input);
			expect(input.value).toBe('typed Alpha');
			keyState.reset = 1;
			r.update(App, props);
			const replacement = r.find('input') as HTMLInputElement;
			expect(replacement).not.toBe(input);
			expect(input.isConnected).toBe(false);
			expect(replacement.value).toBe('Alpha');
			r.update(App, props);
			expect(r.find('input')).toBe(replacement);
		} finally {
			r.unmount();
		}
	});

	it('refreshes captured row keys for an unchanged items array and releases each callback ref once', () => {
		const { App } = fixture(`export function App({items, reset, onRef}) @{ <section>
			@for (const item of items; key item.id) {
				<input key={reset + ':' + item.id} ref={onRef} data-id={item.id} defaultValue={item.label}/>
			}
		</section> }`);
		const items = [
			{ id: 'a', label: 'Alpha' },
			{ id: 'b', label: 'Beta' },
		];
		const attached: HTMLInputElement[] = [];
		const cleaned: HTMLInputElement[] = [];
		const onRef = (input: HTMLInputElement | null) => {
			if (input === null) return;
			expect(input.isConnected).toBe(true);
			attached.push(input);
			return () => cleaned.push(input);
		};
		const r = mount(App, { items, reset: 0, onRef });
		try {
			const inputs = r.findAll('input') as HTMLInputElement[];
			inputs[0].value = 'typed Alpha';
			inputs[1].value = 'typed Beta';
			expect(new Set(attached)).toEqual(new Set(inputs));
			expect(attached).toHaveLength(2);
			r.update(App, { items, reset: 0, onRef });
			expect(r.findAll('input')).toEqual(inputs);
			r.update(App, { items: items.toReversed(), reset: 0, onRef });
			expect(r.findAll('input')).toEqual(inputs.toReversed());
			r.update(App, { items, reset: 0, onRef });
			expect(r.findAll('input')).toEqual(inputs);
			expect(inputs.map((input) => input.value)).toEqual(['typed Alpha', 'typed Beta']);
			expect(attached).toHaveLength(2);
			expect(cleaned).toEqual([]);

			// Reusing the exact iterable must still observe the parent's new key capture.
			r.update(App, { items, reset: 1, onRef });
			const replacements = r.findAll('input') as HTMLInputElement[];
			for (let index = 0; index < replacements.length; index++) {
				expect(replacements[index]).not.toBe(inputs[index]);
				expect(inputs[index].isConnected).toBe(false);
			}
			expect(replacements.map((input) => input.value)).toEqual(['Alpha', 'Beta']);
			expect(attached).toHaveLength(4);
			expect(cleaned).toHaveLength(2);
			expect(new Set(cleaned)).toEqual(new Set(inputs));
			r.update(App, { items, reset: 1, onRef });
			expect(r.findAll('input')).toEqual(replacements);
			expect(attached).toHaveLength(4);
			expect(cleaned).toHaveLength(2);
		} finally {
			r.unmount();
		}
		expect(cleaned).toHaveLength(4);
		expect(new Set(cleaned)).toEqual(new Set(attached));
		expect(cleaned.every((input) => !input.isConnected)).toBe(true);
	});

	it.each(['', '; key item.id'])(
		'retains edited input rows and resets only changed explicit keys with header %s',
		(header) => {
			const { App } = fixture(inputSource(header));
			const items = [
				{ id: 'a', reset: 'a:0', label: 'Alpha' },
				{ id: 'b', reset: 'b:0', label: 'Beta' },
			];
			const onPick = vi.fn();
			const r = mount(App, { items, onPick });
			try {
				const inputs = r.findAll('input') as HTMLInputElement[];
				const tail = r.find('span');
				inputs[0].value = 'typed Alpha';
				inputs[1].value = 'typed Beta';
				r.update(App, { items: items.toReversed(), onPick });
				expect(r.findAll('input')).toEqual(inputs.toReversed());
				expect(inputs.map((input) => input.value)).toEqual(['typed Alpha', 'typed Beta']);

				const changed = [{ ...items[1], label: 'Updated Beta' }, items[0]];
				r.update(App, { items: changed, onPick });
				expect(r.findAll('input')).toEqual(inputs.toReversed());
				expect(inputs[1].value).toBe('typed Beta');

				r.update(App, { items: [{ ...changed[0], reset: 'b:1' }, changed[1]], onPick });
				const replacement = r.find('input[data-id="b"]') as HTMLInputElement;
				expect(replacement).not.toBe(inputs[1]);
				expect(inputs[1].isConnected).toBe(false);
				expect(replacement.value).toBe('Updated Beta');
				expect(r.find('input[data-id="a"]')).toBe(inputs[0]);
				expect(inputs[0].value).toBe('typed Alpha');
				expect(r.find('span')).toBe(tail);
				r.click('input[data-id="b"]');
				expect(onPick).toHaveBeenCalledExactlyOnceWith('b');
			} finally {
				r.unmount();
			}
		},
	);

	it.each(['', '; key item.id'])(
		'adopts edited server input rows and preserves explicit key replacement with header %s',
		(header) => {
			const source = inputSource(header);
			const { App } = fixture(source);
			const server = fixture(source, true);
			const items = [
				{ id: 'a', reset: 'a:0', label: 'Alpha' },
				{ id: 'b', reset: 'b:0', label: 'Beta' },
			];
			const onPick = vi.fn();
			const container = document.createElement('div');
			container.innerHTML = renderToString(server.App, { items, onPick }).html;
			document.body.append(container);
			const inputs = [...container.querySelectorAll('input')];
			const tail = container.querySelector('span');
			inputs[0].value = 'typed Alpha';
			inputs[1].value = 'typed Beta';
			const recovered: unknown[] = [];
			const root = hydrateRoot(
				container,
				App,
				{ items, onPick },
				{
					onRecoverableError: (error) => recovered.push(error),
				},
			);
			try {
				flushSync(() => {});
				expect([...container.querySelectorAll('input')]).toEqual(inputs);
				expect(inputs.map((input) => input.value)).toEqual(['typed Alpha', 'typed Beta']);
				flushSync(() => root.render(App, { items: items.toReversed(), onPick }));
				expect([...container.querySelectorAll('input')]).toEqual(inputs.toReversed());
				flushSync(() =>
					root.render(App, {
						items: [{ ...items[1], reset: 'b:1', label: 'Updated Beta' }, items[0]],
						onPick,
					}),
				);
				const replacement = container.querySelector<HTMLInputElement>('input[data-id="b"]')!;
				expect(replacement).not.toBe(inputs[1]);
				expect(inputs[1].isConnected).toBe(false);
				expect(replacement.value).toBe('Updated Beta');
				expect(container.querySelector('input[data-id="a"]')).toBe(inputs[0]);
				expect(inputs[0].value).toBe('typed Alpha');
				expect(container.querySelector('span')).toBe(tail);
				flushSync(() => replacement.click());
				expect(onPick).toHaveBeenCalledExactlyOnceWith('b');
				expect(recovered).toEqual([]);
			} finally {
				root.unmount();
				container.remove();
			}
		},
	);

	// A setup statement beside the root leaves the server wrapping each row in
	// its own range while the client adopts the component's; both must agree.
	function componentSource(header: string, setup: boolean) {
		return `import { useState } from 'octane';
			function Row({item}) @{ const [count, setCount] = useState(0);
				<button data-id={item.id} onClick={() => setCount(count + 1)}>{item.label + ':' + count}</button>
			}
			export function App({items}) @{ <section>
				@for (const item of items${header}) {
					${setup ? 'const shown = item;' : ''}
					<Row key={item.id + ':' + item.version} item={${setup ? 'shown' : 'item'}}/>
				}
				<span>tail</span>
			</section> }`;
	}

	it.each([
		['mount', '', false],
		['mount', '; key item.id', false],
		['mount', '', true],
		['hydrate', '', false],
		['hydrate', '; key item.id', false],
		['hydrate', '', true],
		['hydrate', '; key item.id', true],
	] as const)(
		'keeps component root state by its key through reorder, key changes, and removal after %s with header %j (setup statement %s)',
		(kind, header, setup) => {
			const source = componentSource(header, setup);
			const { App } = fixture(source);
			const items = [
				{ id: 'a', version: 0, label: 'Alpha' },
				{ id: 'b', version: 0, label: 'Beta' },
			];
			const r = kind === 'mount' ? mount(App, { items }) : null;
			const container = r?.container ?? document.createElement('div');
			if (kind === 'hydrate') {
				document.body.append(container);
				container.innerHTML = renderToString(fixture(source, true).App, { items }).html;
			}
			const adopted = [...container.querySelectorAll('button')];
			const recovered: unknown[] = [];
			const root =
				kind === 'hydrate'
					? hydrateRoot(
							container,
							App,
							{ items },
							{
								onRecoverableError: (error) => recovered.push(error),
							},
						)
					: null;
			const update = (next: typeof items) => {
				if (r) r.update(App, { items: next });
				else flushSync(() => root!.render(App, { items: next }));
			};
			try {
				flushSync(() => {});
				const buttons = [...container.querySelectorAll('button')];
				const tail = container.querySelector('span');
				if (kind === 'hydrate') expect(buttons).toEqual(adopted);
				flushSync(() => buttons[1].click());
				expect(buttons[1].textContent).toBe('Beta:1');
				update(items.toReversed());
				expect([...container.querySelectorAll('button')]).toEqual(buttons.toReversed());
				expect(buttons[1].textContent).toBe('Beta:1');
				update([{ ...items[1], version: 1 }, items[0]]);
				const replacement = container.querySelector<HTMLButtonElement>('button[data-id="b"]')!;
				expect(replacement).not.toBe(buttons[1]);
				expect(buttons[1].isConnected).toBe(false);
				expect(replacement.textContent).toBe('Beta:0');
				expect(container.querySelector('button[data-id="a"]')).toBe(buttons[0]);
				expect(container.querySelector('span')).toBe(tail);
				flushSync(() => replacement.click());
				expect(replacement.textContent).toBe('Beta:1');
				update([{ ...items[1], version: 1 }]);
				expect(buttons[0].isConnected).toBe(false);
				expect([...container.querySelector('section')!.children]).toEqual([replacement, tail]);
				expect(replacement.textContent).toBe('Beta:1');
				expect(recovered).toEqual([]);
			} finally {
				r?.unmount();
				root?.unmount();
				container.remove();
			}
		},
	);
});
