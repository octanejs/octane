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
		const module = client();
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
});
