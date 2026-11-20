import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { createElement, createRoot, flushSync, hydrateRoot } from '../src/index.js';
import * as Server from 'octane/server';
import { loadCompiledFixtureSource } from './_server-fixture.js';
import { act } from './_helpers.js';

const source = readFileSync('packages/octane/tests/_fixtures/private-context.tsrx', 'utf8');
const compileOptions = { hmr: false, dev: false, autoMemo: true };

function container() {
	const host = document.createElement('div');
	document.body.appendChild(host);
	return host;
}

afterEach(() => document.body.replaceChildren());

function client(options: Record<string, unknown> = {}) {
	return loadCompiledFixtureSource(source, {
		id: 'private-context.tsrx',
		mode: 'client',
		compileOptions: { ...compileOptions, ...options },
	});
}

describe('private Context providers', () => {
	for (const dev of [false, true]) {
		for (const autoMemo of [false, true]) {
			it(`retains state and controls while values change (dev=${dev}, memo=${autoMemo})`, () => {
				const module = client({ dev, autoMemo });
				const host = container();
				const root = createRoot(host);
				try {
					root.render(module.App, { value: 'first' });
					const button = host.querySelector('button')!;
					const input = host.querySelector('input')!;
					const label = host.querySelector('.value')!;
					input.value = 'typed';
					flushSync(() => button.click());
					expect(button.textContent).toBe('1');
					for (const value of ['second', 'third', 'second']) {
						flushSync(() => root.render(module.App, { value }));
						expect(label.textContent).toBe(value);
						expect(label.getAttribute('title')).toBe(value);
						expect(host.querySelector('button')).toBe(button);
						expect(host.querySelector('input')).toBe(input);
						expect(button.textContent).toBe('1');
						expect(input.value).toBe('typed');
					}
				} finally {
					root.unmount();
				}
				expect(host.childNodes.length).toBe(0);
				expect(module.readCleanups()).toBe(1);
			});
		}

		it(`keeps defaults and nearest providers distinct (dev=${dev})`, () => {
			const module = client({ dev });
			const host = container();
			const root = createRoot(host);
			try {
				root.render(module.Nested, { outer: 'outer', inner: 'inner' });
				const labels = Array.from(host.querySelectorAll('.value'));
				expect(labels.map((label) => label.textContent)).toEqual([
					'default',
					'outer',
					'inner',
					'outer',
				]);
				flushSync(() => root.render(module.Nested, { outer: 'next', inner: 'local' }));
				expect(Array.from(host.querySelectorAll('.value'))).toEqual(labels);
				expect(labels.map((label) => label.textContent)).toEqual([
					'default',
					'next',
					'local',
					'next',
				]);
			} finally {
				root.unmount();
			}
			expect(module.readCleanups()).toBe(4);
		});

		it(`recovers after an unhandled render error (dev=${dev})`, () => {
			const module = client({ dev });
			const host = container();
			const root = createRoot(host);
			try {
				root.render(module.App, { value: 'accepted' });
				const label = host.querySelector('.value')!;
				const input = host.querySelector('input')!;
				input.value = 'typed';
				expect(() =>
					flushSync(() => root.render(module.App, { value: 'rejected', fail: true })),
				).toThrow('abandoned provider');
				expect(label.textContent).toBe('accepted');
				flushSync(() => root.render(module.App, { value: 'accepted' }));
				expect(host.querySelector('.value')!.textContent).toBe('accepted');
			} finally {
				root.unmount();
			}
		});

		it(`holds provider state until a later sibling is ready (dev=${dev})`, async () => {
			const module = client({ dev });
			const host = container();
			const root = createRoot(host);
			let resolve!: () => void;
			const promise = new Promise<void>((done) => {
				resolve = done;
			});
			let ready = false;
			try {
				root.render(module.Held, { value: 'first', read: () => 'ready' });
				const label = host.querySelector('.value')!;
				const input = host.querySelector('input')!;
				const button = host.querySelector('button')!;
				input.value = 'held draft';
				flushSync(() => button.click());
				flushSync(() =>
					root.render(module.Held, {
						value: 'second',
						read() {
							if (!ready) throw promise;
							return 'resolved';
						},
					}),
				);
				expect(label.textContent).toBe('first');
				expect(button.textContent).toBe('1');
				ready = true;
				await act(async () => {
					resolve();
					await promise;
				});
				expect(host.querySelector('.value')).toBe(label);
				expect(label.textContent).toBe('second');
				expect(host.querySelector('input')).toBe(input);
				expect(input.value).toBe('held draft');
				expect(host.querySelector('button')).toBe(button);
				expect(button.textContent).toBe('1');
				expect(host.querySelector('p')!.textContent).toBe('resolved');
			} finally {
				ready = true;
				resolve();
				root.unmount();
			}
		});
	}

	it('adopts server controls and keeps their provider live', () => {
		const module = client();
		const server = loadCompiledFixtureSource(source, {
			id: 'private-context.tsrx',
			mode: 'server',
			compileOptions,
		});
		const host = container();
		host.innerHTML = Server.renderToString(server.App, { value: 'server' }).html;
		const input = host.querySelector('input')!;
		const button = host.querySelector('button')!;
		const label = host.querySelector('.value')!;
		input.value = 'typed';
		const root = hydrateRoot(host, module.App, { value: 'server' });
		try {
			flushSync(() => button.click());
			flushSync(() => root.render(module.App, { value: 'client' }));
			expect(host.querySelector('input')).toBe(input);
			expect(host.querySelector('button')).toBe(button);
			expect(host.querySelector('.value')).toBe(label);
			expect(input.value).toBe('typed');
			expect(button.textContent).toBe('1');
			expect(label.textContent).toBe('client');
		} finally {
			root.unmount();
		}
		expect(host.childNodes.length).toBe(0);
	});

	it('supports Strong compilation with native state updates', () => {
		const module = client({ strong: true });
		const host = container();
		const root = createRoot(host);
		try {
			root.render(module.App, { value: 'first' });
			const button = host.querySelector('button')!;
			flushSync(() => button.click());
			flushSync(() => root.render(module.App, { value: 'second' }));
			expect(host.querySelector('button')).toBe(button);
			expect(button.textContent).toBe('1');
			expect(host.querySelector('.value')!.textContent).toBe('second');
		} finally {
			root.unmount();
		}
	});

	it.each([
		'children={props.children} value={props.value}',
		'{...props}',
		'__proto__={props.proto} value={props.value}',
	])('renders descriptor children passed through %s', (attributes) => {
		const module = loadCompiledFixtureSource(
			`import {createContext,useContext} from 'octane';
const Theme=createContext('default');
export function App(props) @{ <Theme ${attributes} /> }
export function Reader() @{ <span>{useContext(Theme) as string}</span> }`,
			{ id: 'opaque-context-children.tsrx', mode: 'client', compileOptions },
		);
		const host = container();
		const root = createRoot(host);
		try {
			root.render(module.App, {
				value: 'first',
				children: createElement(module.Reader, null),
				proto: { children: createElement(module.Reader, null) },
			});
			expect(host.textContent).toBe('first');
			flushSync(() =>
				root.render(module.App, {
					value: 'second',
					children: 'ordinary',
					proto: { children: 'ordinary' },
				}),
			);
			expect(host.textContent).toBe('ordinary');
		} finally {
			root.unmount();
		}
	});

	it('renders function-valued holes inside a compiled provider body', () => {
		const module = loadCompiledFixtureSource(
			`import {createContext,createElement,useContext} from 'octane';
const Theme=createContext('default');
export function Reader() @{ <span>{useContext(Theme) as string}</span> }
export function App(props) @{ <Theme value={props.value}>{props.dynamic ? () => createElement(Reader,null) : 'ordinary'}</Theme> }`,
			{ id: 'private-context-hole.tsrx', mode: 'client', compileOptions },
		);
		const host = container();
		const root = createRoot(host);
		try {
			root.render(module.App, { value: 'provided', dynamic: true });
			expect(host.textContent).toBe('provided');
			flushSync(() => root.render(module.App, { value: 'next', dynamic: false }));
			expect(host.textContent).toBe('ordinary');
			flushSync(() => root.render(module.App, { value: 'last', dynamic: true }));
			expect(host.textContent).toBe('last');
		} finally {
			root.unmount();
		}
	});

	it('keeps opaque model handles live after scalar provider values', async () => {
		// The untyped fixture receives handles from a lazily loaded engine.
		const module = client({ opaqueSignalHandles: true });
		const host = container();
		const root = createRoot(host);
		root.render(module.App, { value: 'ordinary' });
		const { createScope } = await import('octane/signals');
		const scope = createScope({ scopeKey: 'private-context-model' });
		const value = scope.signal$('value', 'first');
		try {
			const label = host.querySelector('.value')!;
			const input = host.querySelector('input')!;
			input.value = 'typed';
			flushSync(() => root.render(module.App, { value }));
			expect(label.textContent).toBe('first');
			expect(label.getAttribute('title')).toBe('first');
			flushSync(() => value.set('second'));
			expect(host.querySelector('.value')).toBe(label);
			expect(label.textContent).toBe('second');
			expect(label.getAttribute('title')).toBe('second');
			expect(host.querySelector('input')).toBe(input);
			expect(input.value).toBe('typed');
			root.unmount();
			value.set('disposed');
			expect(label.textContent).toBe('second');
			expect(host.childNodes.length).toBe(0);
		} finally {
			root.unmount();
			scope.dispose();
		}
	});

	// Children of a descriptorChildren component, and the returned-JSX form of a
	// directly called `@{ … }` function, reach the provider as element
	// descriptors in every compile mode.
	const descriptorPrelude = `import {Activity,createContext,descriptorChildren,memo,Suspense,useContext,ViewTransition} from 'octane';
const Message=createContext('default');
const Frame=descriptorChildren(FrameBody);
function FrameBody(props) @{ <div>{props.children}</div> }
function Plain(props) @{ <section>{props.children}</section> }
const Box=memo(function Box(props) @{ <section>{props.children}</section> });
function Value() @{ <span class="value">{useContext(Message) as string}</span> }
`;
	const provider = '<Message value={props.v}><Value /></Message>';
	const descriptorProviders: Record<string, string> = {
		'a descriptorChildren child': `export function App(props) @{ <Frame>${provider}</Frame> }`,
		'a host element under descriptorChildren': `export function App(props) @{ <Frame><p>${provider}</p></Frame> }`,
		'a fragment under descriptorChildren': `export function App(props) @{ <Frame><>${provider}</></Frame> }`,
		'a render-only block under descriptorChildren': `export function App(props) @{ <Frame>@{ ${provider} }</Frame> }`,
		'a setup block under descriptorChildren': `export function App(props) @{ <Frame>@{ const v = props.v; <Message value={v}><Value /></Message> }</Frame> }`,
		'a component under descriptorChildren': `export function App(props) @{ <Frame><Plain>${provider}</Plain></Frame> }`,
		'a memo component under descriptorChildren': `export function App(props) @{ <Frame><Box>${provider}</Box></Frame> }`,
		'Suspense under descriptorChildren': `export function App(props) @{ <Frame><Suspense fallback={<i>wait</i>}>${provider}</Suspense></Frame> }`,
		'ViewTransition under descriptorChildren': `export function App(props) @{ <Frame><ViewTransition>${provider}</ViewTransition></Frame> }`,
		'Activity under descriptorChildren': `export function App(props) @{ <Frame><Activity mode="visible">${provider}</Activity></Frame> }`,
		'an @if arm under descriptorChildren': `export function App(props) @{ <Frame>@if (props.v) { ${provider} }</Frame> }`,
		'an @for arm under descriptorChildren': `export function App(props) @{ <Frame>@for (const v of [props.v]; key v) { <Message value={v}><Value /></Message> }</Frame> }`,
		'a directly called @{} function': `function Helper(props) @{ ${provider} }
export function App(props) @{ <div>{Helper(props)}</div> }`,
		'a directly called arrow component': `const Helper = (props) => @{ ${provider} };
export function App(props) @{ <div>{Helper(props)}</div> }`,
		'a directly called nested @{} function': `export function App(props) @{
	function helper(v) @{ <Message value={v}><Value /></Message> }
	<div>{helper(props.v)}</div>
}`,
		'an @{} function passed to a call': `function wrap(component) { return component; }
const Wrapped = wrap((props) => @{ ${provider} });
export function App(props) @{ <div><Wrapped v={props.v} /></div> }`,
		'an @{} callback mapped by a non-array': `export function App(props) @{ <div>{({ map: (render) => [render(props.v)] }).map((v) => @{ <Message value={v}><Value /></Message> })}</div> }`,
	};
	for (const dev of [false, true]) {
		it.each(Object.entries(descriptorProviders))(
			`provides through %s (dev=${dev})`,
			async (name, app) => {
				const module = loadCompiledFixtureSource(descriptorPrelude + app, {
					id: 'descriptor-provider.tsrx',
					mode: 'client',
					compileOptions: { ...compileOptions, dev },
				});
				const host = container();
				const root = createRoot(host);
				try {
					await act(async () => root.render(module.App, { v: 'first' }));
					expect(host.querySelector('.value')?.textContent, name).toBe('first');
					await act(async () => root.render(module.App, { v: 'second' }));
					expect(host.querySelector('.value')?.textContent, name).toBe('second');
				} finally {
					root.unmount();
				}
				expect(host.childNodes.length).toBe(0);
			},
		);
	}

	it('hydrates a provider under descriptorChildren and keeps it live', () => {
		const app = descriptorPrelude + descriptorProviders['a descriptorChildren child'];
		const module = loadCompiledFixtureSource(app, {
			id: 'descriptor-provider.tsrx',
			mode: 'client',
			compileOptions,
		});
		const server = loadCompiledFixtureSource(app, {
			id: 'descriptor-provider.tsrx',
			mode: 'server',
			compileOptions,
		});
		const host = container();
		host.innerHTML = Server.renderToString(server.App, { v: 'server' }).html;
		const label = host.querySelector('.value')!;
		expect(label.textContent).toBe('server');
		const root = hydrateRoot(host, module.App, { v: 'server' });
		try {
			flushSync(() => root.render(module.App, { v: 'client' }));
			expect(host.querySelector('.value')).toBe(label);
			expect(label.textContent).toBe('client');
		} finally {
			root.unmount();
		}
		expect(host.childNodes.length).toBe(0);
	});

	it.each([
		'export function exposed() { return Theme; }',
		'export const holder = {Theme};',
		'export const alias = Theme;',
		'export const defaultValue = Theme.defaultValue;',
	])('preserves escaped descriptor contexts: %s', (escape) => {
		const module = loadCompiledFixtureSource(
			`import {createContext,useContext} from 'octane';
const Theme=createContext('default'); ${escape}
export function context() {return Theme;}
export function Reader() @{ <span>{useContext(Theme) as string}</span> }`,
			{ id: 'escaped-context.tsrx', mode: 'client', compileOptions },
		);
		const host = container();
		const root = createRoot(host);
		try {
			root.render(module.context(), {
				value: 'provided',
				children: createElement(module.Reader, null),
			});
			expect(host.textContent).toBe('provided');
			flushSync(() =>
				root.render(module.context(), { value: 'text', children: ['array', ' children'] }),
			);
			expect(host.textContent).toBe('array children');
		} finally {
			root.unmount();
		}
	});
	// Directive arms render template output, so a provider there takes the
	// compiled provider path exactly as one directly in the template does.
	const armsSource = `import {createContext,useContext,useState} from 'octane';
const Theme=createContext('default');
function Value(props) @{
	const [count, update] = useState(0);
	<p class={props.arm}><span class="value">{useContext(Theme) as string}</span><button onClick={() => update(count + 1)}>{String(count) as string}</button></p>
}
export function App(props) @{
	<main>
		@if (props.on) {
			<Theme value={props.v + ':if'}><Value arm="if" /></Theme>
		} @else if (props.items.length === 0) {
			<Theme value={props.v + ':elseif'}><Value arm="elseif" /></Theme>
		} @else {
			<Theme value={props.v + ':else'}><Value arm="else" /></Theme>
		}
		@for (const item of props.items; key item) {
			<Theme value={props.v + ':' + item}><Value arm={'for-' + item} /></Theme>
		} @empty {
			<Theme value={props.v + ':empty'}><Value arm="empty" /></Theme>
		}
		@switch (props.on) {
			@case true: {
				<Theme value={props.v + ':case'}><Value arm="case" /></Theme>
			}
			@default: {
				<Theme value={props.v + ':default'}><Value arm="default" /></Theme>
			}
		}
		@try {
			<Theme value={props.v + ':try'}><Value arm="try" /></Theme>
		} @catch (error) {
			<Theme value={props.v + ':catch'}><Value arm="catch" /></Theme>
		}
	</main>
}`;
	const armValues = (host: HTMLElement) =>
		Array.from(
			host.querySelectorAll('p'),
			(p) => `${p.className}=${p.querySelector('.value')!.textContent}`,
		);

	for (const options of [{ dev: false }, { dev: true }, { strong: true }]) {
		it(`provides through every directive arm (${JSON.stringify(options)})`, () => {
			const module = loadCompiledFixtureSource(armsSource, {
				id: 'private-context-arms.tsrx',
				mode: 'client',
				compileOptions: { ...compileOptions, ...options },
			});
			const host = container();
			const root = createRoot(host);
			try {
				root.render(module.App, { v: 'a', on: true, items: ['x', 'y'] });
				expect(armValues(host)).toEqual([
					'if=a:if',
					'for-x=a:x',
					'for-y=a:y',
					'case=a:case',
					'try=a:try',
				]);
				const kept = host.querySelector('.for-y button') as HTMLButtonElement;
				flushSync(() => kept.click());
				flushSync(() => root.render(module.App, { v: 'b', on: true, items: ['y', 'x'] }));
				expect(armValues(host)).toEqual([
					'if=b:if',
					'for-y=b:y',
					'for-x=b:x',
					'case=b:case',
					'try=b:try',
				]);
				expect(host.querySelector('.for-y button')).toBe(kept);
				expect(kept.textContent).toBe('1');
				flushSync(() => root.render(module.App, { v: 'c', on: false, items: [] }));
				expect(armValues(host)).toEqual([
					'elseif=c:elseif',
					'empty=c:empty',
					'default=c:default',
					'try=c:try',
				]);
				flushSync(() => root.render(module.App, { v: 'd', on: false, items: ['z'] }));
				expect(armValues(host)).toEqual([
					'else=d:else',
					'for-z=d:z',
					'default=d:default',
					'try=d:try',
				]);
			} finally {
				root.unmount();
			}
			expect(host.childNodes.length).toBe(0);
		});
	}

	it('hydrates providers in directive arms and keeps them live', () => {
		const props = { v: 'server', on: true, items: ['x'] };
		const module = loadCompiledFixtureSource(armsSource, {
			id: 'private-context-arms.tsrx',
			mode: 'client',
			compileOptions,
		});
		const server = loadCompiledFixtureSource(armsSource, {
			id: 'private-context-arms.tsrx',
			mode: 'server',
			compileOptions,
		});
		const host = container();
		host.innerHTML = Server.renderToString(server.App, props).html;
		const labels = Array.from(host.querySelectorAll('.value'));
		const root = hydrateRoot(host, module.App, props);
		try {
			flushSync(() => root.render(module.App, { ...props, v: 'client' }));
			expect(Array.from(host.querySelectorAll('.value'))).toEqual(labels);
			expect(armValues(host)).toEqual([
				'if=client:if',
				'for-x=client:x',
				'case=client:case',
				'try=client:try',
			]);
		} finally {
			root.unmount();
		}
		expect(host.childNodes.length).toBe(0);
	});
});
