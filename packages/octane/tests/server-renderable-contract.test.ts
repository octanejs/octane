import { describe, expect, it, vi } from 'vitest';
import * as Server from 'octane/server';
import * as Static from 'octane/static';
import { flushSync, hydrateRoot } from 'octane';
import * as Client from './_fixtures/server-renderable-contract.tsrx';
import { loadServerFixture } from './_server-fixture.js';
import {
	collectPipeableStream,
	collectReadableStream,
	createPipeableCollector,
} from './_server-stream.js';

const fixture = loadServerFixture(
	'packages/octane/tests/_fixtures/server-renderable-contract.tsrx',
	{
		compileOptions: { inlineHookMemo: false },
	},
);
const hostile = 'a<b&"<img src=x onerror=alert(1)>';

function parsed(html: string): HTMLDivElement {
	const container = document.createElement('div');
	container.innerHTML = html;
	return container;
}

describe('server renderable values', () => {
	it.each(['value', 'defaultValue'])('omits non-serializable input %s values', (prop) => {
		for (const value of [() => 'handler', Symbol('value')]) {
			const node = parsed(
				Server.renderToStaticMarkup(Server.createElement('input', { [prop]: value })).html,
			).firstElementChild!;
			expect(node.hasAttribute('value')).toBe(false);
		}
	});
	it('diagnoses use inside memo factories without changing the value or leaking diagnostic scope', () => {
		const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
		const context = Server.createContext('value');
		try {
			const Read = () => Server.useMemo(() => Server.use(context), null);
			expect(Server.renderToStaticMarkup(Read).html).toBe('value');
			if (process.env.NODE_ENV !== 'production')
				expect(diagnostic).toHaveBeenCalledExactlyOnceWith(
					expect.stringContaining('Do not call use() inside a useMemo() factory.'),
				);
			else expect(diagnostic).not.toHaveBeenCalled();
			diagnostic.mockClear();
			expect(Server.renderToStaticMarkup(() => Server.use(context)).html).toBe('value');
			expect(diagnostic).not.toHaveBeenCalled();
		} finally {
			diagnostic.mockRestore();
		}
	});
	it.each([false, true])(
		'fails a piped destination after a shell error (late pipe: %s)',
		async (late) => {
			const error = new Error('shell failed');
			const onError = vi.fn();
			const onShellError = vi.fn();
			const destination = { write: vi.fn(), end: vi.fn(), destroy: vi.fn() };
			const stream = Server.renderToPipeableStream(
				() => {
					throw error;
				},
				{},
				{ onError, onShellError },
			);
			if (late) await Promise.resolve();
			stream.pipe(destination);
			await Promise.resolve();
			expect(destination.write).not.toHaveBeenCalled();
			expect(destination.end).not.toHaveBeenCalled();
			expect(destination.destroy).toHaveBeenCalledExactlyOnceWith(error);
			expect(onError).toHaveBeenCalledExactlyOnceWith(error);
			expect(onShellError).toHaveBeenCalledExactlyOnceWith(error);
		},
	);
	it('exposes the idle form status outside a server form action', () => {
		const ReadStatus = () => JSON.stringify(Server.useFormStatus());
		expect(JSON.parse(Server.renderToStaticMarkup(ReadStatus).html)).toEqual({
			pending: false,
			data: null,
			method: null,
			action: null,
		});
	});
	it('escapes HOC string returns even when every runtime component descriptor was hoisted', async () => {
		for (const inner of [
			Server.Suspense,
			Server.createContext('value'),
			Server.markChildrenBlock(() => ''),
		]) {
			const Wrapper = () => hostile;
			for (const key of Reflect.ownKeys(inner)) {
				if (key === 'length' || key === 'name' || key === 'prototype') continue;
				Object.defineProperty(Wrapper, key, Object.getOwnPropertyDescriptor(inner, key)!);
			}
			for (const { html } of [
				Server.renderToString(Wrapper),
				Server.renderToStaticMarkup(Wrapper),
				await Static.prerender(Wrapper),
				await collectPipeableStream(Wrapper),
				await collectReadableStream(Wrapper),
			]) {
				const node = parsed(html);
				expect(node.textContent).toBe(hostile);
				expect(node.querySelector('img')).toBeNull();
			}
		}
	});
	it.each([false, true])(
		'keeps authored text returns distinct from template HTML in one component (text: %s)',
		async (text) => {
			const value = '<img src=x onerror=alert(1)> & text';
			const props = { value, text };
			for (const { html } of [
				Server.renderToString(fixture.MixedTextReturn, props),
				Server.renderToStaticMarkup(fixture.MixedTextReturn, props),
				await Static.prerender(fixture.MixedTextReturn, props),
				await collectPipeableStream(fixture.MixedTextReturn, props),
				await collectReadableStream(fixture.MixedTextReturn, props),
			]) {
				const node = parsed(html);
				expect(node.querySelector('img')).toBeNull();
				expect(node.textContent).toBe(value);
				expect(node.querySelector('strong') !== null).toBe(!text);
			}
		},
	);
	it.each([false, true])(
		'preserves compiled output forwarded by an ordinary wrapper (descriptor: %s)',
		async (descriptor) => {
			const Wrapper = (props: { value: string }, scope: unknown) => {
				const first = fixture.MixedTextReturn({ value: props.value, text: false }, scope);
				if (!descriptor) return first;
				const second = fixture.MixedTextReturn({ value: 'second', text: false }, scope);
				return Server.createElement('div', null, [first, second]);
			};
			for (const { html } of [
				Server.renderToString(Wrapper, { value: hostile }),
				Server.renderToStaticMarkup(Wrapper, { value: hostile }),
				await Static.prerender(Wrapper, { value: hostile }),
				await collectPipeableStream(Wrapper, { value: hostile }),
				await collectReadableStream(Wrapper, { value: hostile }),
			]) {
				const node = parsed(html);
				expect([...node.querySelectorAll('strong')].map((element) => element.textContent)).toEqual(
					descriptor ? [hostile, 'second'] : [hostile],
				);
				expect(node.querySelector('img')).toBeNull();
			}
		},
	);
	it('exposes memo metadata without mutating the wrapped component', () => {
		const Named = (props: { text: string }) => props.text;
		const Memo = Server.memo(Named);
		expect(Memo.type).toBe(Named);
		expect(Memo.displayName).toBe('Named');
		expect(Object.keys(Memo)).toEqual([]);
		expect(Object.hasOwn(Named, 'type')).toBe(false);
		expect(Server.renderToStaticMarkup(Memo, { text: hostile }).html).toBe(
			'a&lt;b&amp;"&lt;img src=x onerror=alert(1)&gt;',
		);
		Memo.displayName = 'Wrapped';
		expect(Memo.displayName).toBe('Wrapped');
	});
	it('reads lazy names without starting the loader or resolving module accessors', async () => {
		const Named = () => 'loaded';
		const getter = vi.fn(() => Named);
		const loader = vi.fn(() =>
			Promise.resolve({
				get default() {
					return getter();
				},
			}),
		);
		const Lazy = Server.lazy(loader);
		expect(Lazy.displayName).toBe('Lazy');
		expect(loader).not.toHaveBeenCalled();
		expect(getter).not.toHaveBeenCalled();
		expect((await Static.prerender(Lazy)).html).toBe('loaded');
		expect(Lazy.displayName).toBe('Named');
		Lazy.displayName = 'Wrapped';
		expect(Lazy.displayName).toBe('Wrapped');
		expect(loader).toHaveBeenCalledOnce();
	});
	it.each(['renderToString', 'renderToStaticMarkup'] as const)(
		'%s escapes component strings and preserves compiled markup',
		(api) => {
			for (const component of [fixture.TextReturn, fixture.TextNested, fixture.DynamicHostText]) {
				const node = parsed(Server[api](component, { value: hostile }).html);
				expect(node.textContent).toBe(hostile);
				expect(node.querySelector('img')).toBeNull();
			}
			expect(
				parsed(Server[api](fixture.TextNested, { value: hostile }).html).querySelector('section'),
			).not.toBeNull();
		},
	);
	it('escapes component strings in prerender and both streaming transports', async () => {
		const outputs = await Promise.all([
			Static.prerender(fixture.TextNested, { value: hostile }),
			collectPipeableStream(fixture.TextNested, { value: hostile }),
			collectReadableStream(fixture.TextNested, { value: hostile }),
		]);
		for (const { html } of outputs) {
			const node = parsed(html);
			expect(node.textContent).toBe(hostile);
			expect(node.querySelector('section')).not.toBeNull();
			expect(node.querySelector('img')).toBeNull();
		}
	});
	it('hydrates escaped component text without replacing surrounding server DOM', () => {
		const container = parsed(Server.renderToString(fixture.TextNested, { value: hostile }).html);
		const section = container.querySelector('section');
		const onRecoverableError = vi.fn();
		const root = hydrateRoot(
			container,
			Client.TextNested,
			{ value: hostile },
			{ onRecoverableError },
		);
		flushSync(() => {});
		expect(container.textContent).toBe(hostile);
		expect(container.querySelector('section')).toBe(section);
		expect(container.querySelector('img')).toBeNull();
		expect(onRecoverableError).not.toHaveBeenCalled();
		root.unmount();
	});
	it('preserves raw CSS text and protects split closing style tokens', () => {
		const css = '.a > .b::after { content: "<&" }';
		const html = Server.renderToStaticMarkup(() => Server.createElement('style', null, css)).html;
		expect(parsed(html).querySelector('style')?.textContent).toBe(css);
		const guarded = Server.renderToStaticMarkup(() =>
			Server.createElement('style', null, ['a', '</sty', 'le><img src=x>']),
		).html;
		expect(parsed(guarded).querySelector('img')).toBeNull();
	});
	it.each(['pre', 'textarea', 'listing'])(
		'preserves leading newlines in %s descriptor children',
		(tag) => {
			const html = Server.renderToStaticMarkup(() =>
				Server.createElement(tag, null, '\nfirst'),
			).html;
			expect(parsed(html).querySelector(tag)?.textContent).toBe('\nfirst');
		},
	);
	it('preserves the first newline of an untyped template hole', () => {
		expect(
			parsed(Server.renderToString(fixture.PreHole, { value: '\nfirst' }).html).textContent,
		).toBe('\nfirst');
	});
	it('preserves leading newlines before siblings in static markup', () => {
		expect(
			parsed(Server.renderToStaticMarkup(fixture.PreHoleWithSibling, { value: '\nfirst' }).html)
				.textContent,
		).toBe('\nfirstend');
	});
	it('passes memo dependencies to factories consistently with the client', () => {
		expect(
			parsed(Server.renderToString(fixture.MemoArguments, { value: 'dependency' }).html)
				.textContent,
		).toBe('dependency');
	});
	it('accepts descriptor, primitive, array and empty roots', async () => {
		for (const root of [Server.createElement('b', null, hostile), hostile, [hostile], null]) {
			for (const render of [Server.renderToString, Server.renderToStaticMarkup, Static.prerender]) {
				const result = await render(root as any);
				expect(parsed(result.html).textContent).toBe(root === null ? '' : hostile);
				expect(parsed(result.html).querySelector('img')).toBeNull();
			}
		}
	});
	it('uses second-argument options for element roots in every transport', async () => {
		const WithId = () => Server.createElement('b', { id: Server.useId() }, 'id');
		const root = Server.createElement(WithId, null);
		const options = { identifierPrefix: 'root-options-' };
		const collector = createPipeableCollector();
		Server.renderToPipeableStream(root, options).pipe(collector.destination);
		const readable = await Server.renderToReadableStream(root, options);
		const outputs = [
			Server.renderToString(root, options),
			Server.renderToStaticMarkup(root, options),
			await Static.prerender(root, options),
			{ html: await collector.ended },
			{ html: await new Response(readable).text() },
		];
		for (const { html } of outputs)
			expect(parsed(html).querySelector('b')?.id).toContain('root-options-');
	});
	it.each(['renderToString', 'renderToStaticMarkup'] as const)(
		'%s recovers Suspense errors to the fallback and reports them',
		(api) => {
			const onError = vi.fn();
			const node = parsed(Server[api](fixture.SuspenseFailure, {}, { onError }).html);
			expect(node.textContent).toBe('retry on clienttail');
			expect(onError).toHaveBeenCalledOnce();
			expect(onError.mock.calls[0][0]).toEqual(new Error('server child failed'));
		},
	);
	it('retries a buffered errored Suspense boundary during hydration and adopts its siblings', () => {
		const container = parsed(
			Server.renderToString(fixture.RecoverableSuspense, { fail: true }).html,
		);
		const main = container.querySelector('main');
		const aside = container.querySelector('aside');
		expect(container.textContent).toBe('retry on clienttail');
		const root = hydrateRoot(container, Client.RecoverableSuspense, { fail: false });
		flushSync(() => {});
		expect(container.textContent).toBe('client readytail');
		expect(container.querySelector('main')).toBe(main);
		expect(container.querySelector('aside')).toBe(aside);
		root.unmount();
	});
	it.each(['renderToString', 'renderToStaticMarkup'] as const)(
		'%s rejects a root suspended without a boundary',
		(api) => {
			const onError = vi.fn();
			expect(() =>
				Server[api](fixture.BarePending, { promise: new Promise(() => {}) }, { onError }),
			).toThrow();
			expect(onError).toHaveBeenCalledOnce();
		},
	);
	it('awaits Promise children of host descriptors', async () => {
		const result = await Static.prerender(fixture.PromiseDescriptor, {
			promise: Promise.resolve('ready'),
		});
		expect(parsed(result.html).querySelector('div')?.textContent).toBe('ready');
	});
	it('folds metadata into an implicit head in full documents', () => {
		const html = Server.renderToString(fixture.DocumentMetadata).html;
		expect(html.indexOf('<html')).toBeLessThan(html.indexOf('<title'));
		expect(html).toContain('<head>');
		expect(
			new DOMParser().parseFromString(html, 'text/html').head.querySelector('title')?.textContent,
		).toBe('Document title');
	});
});
