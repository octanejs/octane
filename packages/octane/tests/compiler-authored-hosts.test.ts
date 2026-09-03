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
					expect(container.querySelector('p')).toBe(original);
					expect(container.textContent).toBe(suppress === true ? 'server' : 'client');
					await Promise.resolve();
					expect(recovered.length > 0).toBe(suppress !== true);
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
			expect(recovered.length).toBeGreaterThan(0);
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
