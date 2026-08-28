import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import {
	Children,
	cloneElement,
	Fragment,
	flushSync,
	hydrateRoot,
	isValidElement,
	type ElementDescriptor,
	type Root,
} from 'octane';
import * as ServerRuntime from 'octane/server';
import { createScope, query } from 'octane/signals';
import { prerender } from 'octane/static';
import { act, mount } from './_helpers.js';
import { loadServerFixture } from './_server-fixture.js';
import { deferred } from './_server-stream.js';
import * as client from './_fixtures/signals-deferred-values.tsrx';

const server = loadServerFixture<typeof client>(
	resolve(__dirname, '_fixtures/signals-deferred-values.tsrx'),
	{ compileOptions: { nativeReads: true } },
);

describe('native reads in deferred JSX values', () => {
	it('keeps a hookless function callable outside render with ordinary data dependencies', async () => {
		const props = { a: 'one', b: 'two', c: 'three', d: 'four', e: 'five' };
		const view = client.FiveInputs(props);
		expect(isValidElement(view)).toBe(true);
		expect((view as { props: { title: string } }).props.title).toBe('one,two,three,four,five');
		const rendered = mount(client.DeferredHost, { view, label: 'direct' });
		try {
			expect(rendered.find('.five-inputs').textContent).toBe('one,two,three,four,five');
			const output = await prerender(server.DeferredHost, {
				view: server.FiveInputs(props),
				label: 'server',
			});
			expect(output.html).toContain('title="one,two,three,four,five"');
			expect(output.html).toContain('>one,two,three,four,five</p>');
		} finally {
			rendered.unmount();
		}
	});

	it('refreshes a shared descriptor after external inspection and unchanged parent props', () => {
		const scope = createScope({ scopeKey: 'native-deferred-client' });
		const count$ = scope.signal$('count', 1);
		const view = client.createDeferredView$(count$);
		expect(isValidElement(view)).toBe(true);
		expect((view as { props: { title: string } }).props.title).toBe('1');
		count$.set(2);
		const rendered = mount(client.DeferredHost, { view, label: 'before' });
		try {
			const host = rendered.find('.deferred-value');
			expect(host.textContent).toBe('2');
			expect(host.getAttribute('title')).toBe('2');
			rendered.update(client.DeferredHost, { view, label: 'after' });
			flushSync(() => count$.set(3));
			expect(rendered.find('.label').textContent).toBe('after');
			expect(rendered.find('.deferred-value')).toBe(host);
			expect(host.textContent).toBe('3');
			expect(host.getAttribute('title')).toBe('3');
		} finally {
			rendered.unmount();
			scope.dispose();
		}
	});

	it('tracks setup reads in an arrow component that returns JSX', () => {
		const scope = createScope({ scopeKey: 'native-arrow-client' });
		const count$ = scope.signal$('count', 1);
		const rendered = mount(client.ArrowReader, { count$ });
		try {
			flushSync(() => count$.set(5));
			expect(rendered.find('.arrow-value').textContent).toBe('5');
		} finally {
			rendered.unmount();
			scope.dispose();
		}
	});

	it('serializes reads made by a deferred server descriptor', async () => {
		const scope = createScope({ scopeKey: 'native-deferred-server' });
		const count$ = scope.signal$('count', 6);
		try {
			const view = server.createDeferredView$(count$);
			const output = await prerender(server.DeferredHost, { view, label: 'server' });
			expect(output.html).toContain('title="6"');
			expect(output.html).toContain('>6</p>');
			expect(output.signals?.scopes).toEqual([scope.serialize()]);
		} finally {
			scope.dispose();
		}
	});

	it.each(['private', 'default'] as const)(
		'keeps a %s factory result inspectable and cloneable on both renderers',
		async (kind) => {
			const scope = createScope({ scopeKey: `native-factory-${kind}` });
			const count$ = scope.signal$('count', 1);
			let rendered: ReturnType<typeof mount> | undefined;
			try {
				const original =
					kind === 'private' ? client.makePrivateDescriptor$(count$) : client.default(count$);
				const serverOriginal =
					kind === 'private' ? server.makePrivateDescriptor$(count$) : server.default(count$);
				for (const [view, runtime] of [
					[original, { Children, isValidElement }],
					[serverOriginal, ServerRuntime],
				] as const) {
					expect(runtime.isValidElement(view)).toBe(true);
					const inspected = runtime.Children.only(view) as ElementDescriptor<{
						title: string;
						children: string;
					}>;
					expect(inspected.type).toBe('p');
					expect(inspected.props.title).toBe('1');
					expect(inspected.props.children).toBe('1');
				}
				const copy = cloneElement(original as ElementDescriptor, {
					title: 'copied',
					'data-copy': 'yes',
				});
				const serverCopy = ServerRuntime.cloneElement(serverOriginal as ElementDescriptor, {
					title: 'copied',
					'data-copy': 'yes',
				});
				count$.set(2);
				rendered = mount(client.DeferredPair, { original, copy });
				const originalHost = rendered.find('.original .factory-value');
				const copiedHost = rendered.find('.copy .factory-value');
				expect(originalHost.textContent).toBe('2');
				expect(originalHost.getAttribute('title')).toBe('2');
				expect(copiedHost.textContent).toBe('2');
				expect(copiedHost.getAttribute('title')).toBe('copied');
				expect(copiedHost.getAttribute('data-copy')).toBe('yes');
				const output = await prerender(server.DeferredPair, {
					original: serverOriginal,
					copy: serverCopy,
				});
				const markup = document.createElement('div');
				markup.innerHTML = output.html;
				expect(markup.querySelector('.original .factory-value')?.textContent).toBe('2');
				expect(markup.querySelector('.copy .factory-value')?.getAttribute('title')).toBe('copied');
				expect(markup.querySelector('.copy .factory-value')?.textContent).toBe('2');
				expect(output.signals?.scopes).toEqual([scope.serialize()]);
				flushSync(() => count$.set(3));
				expect(rendered.find('.original .factory-value')).toBe(originalHost);
				expect(rendered.find('.copy .factory-value')).toBe(copiedHost);
				expect(originalHost.textContent).toBe('3');
				expect(copiedHost.textContent).toBe('3');
				expect(copiedHost.getAttribute('title')).toBe('copied');
			} finally {
				rendered?.unmount();
				scope.dispose();
			}
		},
	);

	it('inspects a factory result in the caller scope and renders it in its represented provider', () => {
		const scope = createScope({ scopeKey: 'native-factory-provider' });
		const count$ = scope.signal$('count', 1);
		let rendered: ReturnType<typeof mount> | undefined;
		try {
			rendered = mount(client.InspectAndProvide, { count$ });
			const host = rendered.find('.contextual-value');
			expect(rendered.find('[data-inspected]').getAttribute('data-inspected')).toBe('outer:1');
			expect(host.textContent).toBe('inner:1');
			expect(host.getAttribute('title')).toBe('inner:1');
			flushSync(() => count$.set(2));
			expect(rendered.find('.contextual-value')).toBe(host);
			expect(rendered.find('[data-inspected]').getAttribute('data-inspected')).toBe('outer:2');
			expect(host.textContent).toBe('inner:2');
			expect(host.getAttribute('title')).toBe('inner:2');
			const output = ServerRuntime.renderToString(server.InspectAndProvide, { count$ });
			const markup = document.createElement('div');
			markup.innerHTML = output.html;
			expect(markup.querySelector('[data-inspected]')?.getAttribute('data-inspected')).toBe(
				'outer:2',
			);
			expect(markup.querySelector('.contextual-value')?.textContent).toBe('inner:2');
			expect(markup.querySelector('.contextual-value')?.getAttribute('title')).toBe('inner:2');
		} finally {
			rendered?.unmount();
			scope.dispose();
		}
	});

	it('defers a strict resource read until its stored Suspense boundary renders', async () => {
		const scope = createScope({ scopeKey: 'native-factory-suspense' });
		const pending = deferred<string>();
		const load = query('native-factory-suspense-query', () => pending.promise);
		const value$ = scope.asyncSignal$('value', () => load(undefined));
		let rendered: ReturnType<typeof mount> | undefined;
		try {
			const view = client.makePendingView(value$);
			const serverView = server.makePendingView(value$);
			expect(isValidElement(view)).toBe(true);
			expect(ServerRuntime.isValidElement(serverView)).toBe(true);
			rendered = mount(client.DeferredHost, { view, label: 'sibling' });
			expect(rendered.find('.label').textContent).toBe('sibling');
			expect(rendered.find('.deferred-pending').textContent).toBe('waiting');
			const shell = ServerRuntime.renderToString(server.DeferredHost, {
				view: serverView,
				label: 'sibling',
			});
			expect(shell.html).toContain('class="deferred-pending"');
			await act(() => pending.resolve('ready'));
			expect(rendered.container.querySelector('.deferred-pending')).toBeNull();
			expect(rendered.find('.deferred-resource').textContent).toBe('ready');
			expect(rendered.find('.deferred-resource').getAttribute('title')).toBe('ready');
			const output = await prerender(server.DeferredHost, { view: serverView, label: 'sibling' });
			expect(output.html).toContain('title="ready"');
			expect(output.html).toContain('>ready</p>');
			expect(output.signals?.scopes).toEqual([scope.serialize()]);
		} finally {
			rendered?.unmount();
			scope.dispose();
		}
	});

	it('hydrates a stored descriptor from the presented value and keeps its host through live updates', () => {
		const scope = createScope({ scopeKey: 'native-factory-hydration' });
		const count$ = scope.signal$('count', 1);
		const container = document.createElement('div');
		document.body.appendChild(container);
		let root: Root | undefined;
		try {
			const view = client.createDeferredView$(count$);
			const output = ServerRuntime.renderToString(server.DeferredHost, {
				view: server.createDeferredView$(count$),
				label: 'presented',
			});
			container.innerHTML = output.html;
			const host = container.querySelector('.deferred-value');
			expect(host?.textContent).toBe('1');
			count$.set(2);
			flushSync(() => {
				root = hydrateRoot(container, client.DeferredHost, { view, label: 'presented' });
				expect(host?.textContent).toBe('1');
				expect(count$.get()).toBe(2);
			});
			expect(container.querySelector('.deferred-value')).toBe(host);
			expect(host?.textContent).toBe('2');
			expect(host?.getAttribute('title')).toBe('2');
			flushSync(() => count$.set(3));
			expect(container.querySelector('.deferred-value')).toBe(host);
			expect(host?.textContent).toBe('3');
			expect(host?.getAttribute('title')).toBe('3');
		} finally {
			root?.unmount();
			container.remove();
			scope.dispose();
		}
	});

	it('collects scoped styles when stored JSX renders without leaking them into unrelated server output', () => {
		const scope = createScope({ scopeKey: 'native-factory-style' });
		const count$ = scope.signal$('count', 1);
		let rendered: ReturnType<typeof mount> | undefined;
		try {
			const props = { count$ };
			const direct = ServerRuntime.renderToString(server.StyledDeferredView, props);
			expect(direct.css).toContain('rgb(19, 23, 29)');
			const view = server.StyledDeferredView(props);
			const stored = ServerRuntime.renderToString(server.DeferredHost, { view, label: 'styled' });
			expect(stored.css).toContain('rgb(19, 23, 29)');
			const unrelated = ServerRuntime.renderToString(server.DeferredHost, {
				view: null,
				label: 'plain',
			});
			expect(unrelated.css).not.toContain('rgb(19, 23, 29)');
			rendered = mount(client.DeferredHost, {
				view: client.StyledDeferredView(props),
				label: 'styled',
			});
			const host = rendered.find('.stored-style');
			expect(getComputedStyle(host).color).toBe('rgb(19, 23, 29)');
			flushSync(() => count$.set(2));
			expect(rendered.find('.stored-style')).toBe(host);
			expect(host.textContent).toBe('2');
		} finally {
			rendered?.unmount();
			scope.dispose();
		}
	});

	it('keeps styled static fragments inspectable and hydrates their existing hosts', () => {
		const view = client.StaticStyledFragment();
		const serverView = server.StaticStyledFragment();
		for (const [value, runtime] of [
			[view, { Children, Fragment, isValidElement }],
			[serverView, ServerRuntime],
		] as const) {
			expect(Array.isArray(value)).toBe(false);
			expect(runtime.isValidElement(value)).toBe(true);
			const descriptor = runtime.Children.only(value) as ElementDescriptor;
			expect(descriptor.type).toBe(runtime.Fragment);
		}
		expect(Array.isArray(client.PlainStaticFragment())).toBe(true);
		expect(Array.isArray(server.PlainStaticFragment())).toBe(true);
		const output = ServerRuntime.renderToString(server.DeferredHost, {
			view: serverView,
			label: 'static',
		});
		expect(output.css).toContain('rgb(31, 37, 41)');
		const container = document.createElement('div');
		document.body.appendChild(container);
		let root: Root | undefined;
		try {
			container.innerHTML = output.html;
			const host = container.querySelector('.stored-static-style');
			expect(host?.textContent).toBe('static style');
			flushSync(() => {
				root = hydrateRoot(container, client.DeferredHost, { view, label: 'static' });
			});
			expect(container.querySelector('.stored-static-style')).toBe(host);
			expect(getComputedStyle(host!).color).toBe('rgb(31, 37, 41)');
			flushSync(() => root!.render(client.DeferredHost, { view, label: 'updated' }));
			expect(container.querySelector('.stored-static-style')).toBe(host);
			expect(container.querySelector('.label')?.textContent).toBe('updated');
		} finally {
			root?.unmount();
			container.remove();
		}
	});

	it('keeps empty styled fragments inspectable and their global CSS local to the server render', () => {
		const view = client.EmptyGlobalStyledFragment();
		const serverView = server.EmptyGlobalStyledFragment();
		for (const [value, runtime] of [
			[view, { Children, Fragment, isValidElement }],
			[serverView, ServerRuntime],
		] as const) {
			expect(Array.isArray(value)).toBe(false);
			expect(runtime.isValidElement(value)).toBe(true);
			const descriptor = runtime.Children.only(value) as ElementDescriptor;
			expect(descriptor.type).toBe(runtime.Fragment);
		}
		const unrelatedBefore = ServerRuntime.renderToString(server.DeferredHost, {
			view: null,
			label: 'plain',
		});
		expect(unrelatedBefore.css).not.toContain('rgb(43, 47, 53)');
		const output = ServerRuntime.renderToString(server.GlobalStyleHost, { view: serverView });
		expect(output.css).toContain('rgb(43, 47, 53)');
		const unrelatedAfter = ServerRuntime.renderToString(server.DeferredHost, {
			view: null,
			label: 'plain',
		});
		expect(unrelatedAfter.css).not.toContain('rgb(43, 47, 53)');
		const container = document.createElement('div');
		document.body.appendChild(container);
		let root: Root | undefined;
		try {
			container.innerHTML = output.html;
			const host = container.querySelector('.global-style-target');
			expect(host?.textContent).toBe('global target');
			flushSync(() => {
				root = hydrateRoot(container, client.GlobalStyleHost, { view });
			});
			expect(container.querySelector('.global-style-target')).toBe(host);
			expect(host?.textContent).toBe('global target');
			expect(getComputedStyle(host!).color).toBe('rgb(43, 47, 53)');
		} finally {
			root?.unmount();
			container.remove();
		}
	});

	it('keeps returned component metadata in the document head and separate server head output', () => {
		const scope = createScope({ scopeKey: 'native-returned-head' });
		const title$ = scope.signal$('title', 'before');
		let rendered: ReturnType<typeof mount> | undefined;
		try {
			rendered = mount(client.ReturnedHead, { title$ });
			const body = rendered.find('.deferred-head-value');
			expect(document.head.querySelector('title[data-deferred-native-head]')?.textContent).toBe(
				'before',
			);
			expect(
				document.head.querySelector('meta[name="deferred-native-head"]')?.getAttribute('content'),
			).toBe('before');
			expect(rendered.container.querySelector('title, meta')).toBeNull();
			flushSync(() => title$.set('after'));
			expect(rendered.find('.deferred-head-value')).toBe(body);
			expect(body.textContent).toBe('after');
			expect(document.head.querySelector('title[data-deferred-native-head]')?.textContent).toBe(
				'after',
			);
			expect(
				document.head.querySelector('meta[name="deferred-native-head"]')?.getAttribute('content'),
			).toBe('after');
			const output = ServerRuntime.renderToString(
				server.ReturnedHead,
				{ title$ },
				{ headChannel: 'separate' },
			);
			const head = document.createElement('div');
			head.innerHTML = output.head ?? '';
			expect(head.querySelector('title')?.textContent).toBe('after');
			expect(head.querySelector('meta[name="deferred-native-head"]')?.getAttribute('content')).toBe(
				'after',
			);
			expect(output.html).not.toContain('<title');
			expect(output.html).not.toContain('<meta');
			expect(output.html).toContain('>after</p>');
		} finally {
			rendered?.unmount();
			scope.dispose();
		}
	});

	it('defers stored metadata until its renderer collects the current head and body values', () => {
		const scope = createScope({ scopeKey: 'native-stored-head' });
		const title$ = scope.signal$('title', 'created');
		const container = document.createElement('div');
		document.body.appendChild(container);
		const headNodes: ChildNode[] = [];
		let root: Root | undefined;
		try {
			const view = client.ReturnedHead({ title$ });
			const serverView = server.ReturnedHead({ title$ });
			title$.set('presented');
			const output = ServerRuntime.renderToString(
				server.DeferredHost,
				{ view: serverView, label: 'head' },
				{ headChannel: 'separate' },
			);
			const head = document.createElement('div');
			head.innerHTML = output.head ?? '';
			expect(head.querySelector('title')?.textContent).toBe('presented');
			expect(head.querySelector('meta[name="deferred-native-head"]')?.getAttribute('content')).toBe(
				'presented',
			);
			expect(output.html).not.toContain('<title');
			expect(output.html).not.toContain('<meta');
			expect(output.html).toContain('>presented</p>');
			headNodes.push(...head.childNodes);
			document.head.append(...headNodes);
			container.innerHTML = output.html;
			const body = container.querySelector('.deferred-head-value');
			expect(body?.textContent).toBe('presented');
			title$.set('live');
			flushSync(() => {
				root = hydrateRoot(container, client.DeferredHost, { view, label: 'head' });
				expect(body?.textContent).toBe('presented');
				expect(title$.get()).toBe('live');
			});
			expect(container.querySelector('.deferred-head-value')).toBe(body);
			expect(body?.textContent).toBe('live');
			expect(document.head.querySelector('title[data-deferred-native-head]')?.textContent).toBe(
				'live',
			);
			expect(
				document.head.querySelector('meta[name="deferred-native-head"]')?.getAttribute('content'),
			).toBe('live');
			expect(container.querySelector('title, meta')).toBeNull();
			flushSync(() => title$.set('updated'));
			expect(container.querySelector('.deferred-head-value')).toBe(body);
			expect(body?.textContent).toBe('updated');
			expect(document.head.querySelector('title[data-deferred-native-head]')?.textContent).toBe(
				'updated',
			);
		} finally {
			root?.unmount();
			container.remove();
			for (const node of headNodes) node.remove();
			scope.dispose();
		}
	});
});
