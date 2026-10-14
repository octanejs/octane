import { describe, expect, it } from 'vitest';
import { createElement, flushSync, hydrateRoot, lazy, useContext } from 'octane';
import { renderToString } from 'octane/server';
import { act, mount } from './_helpers.js';
import { loadServerFixture } from './_server-fixture.js';
import * as client from './_fixtures/compiled-boundaries.tsrx';

const server = loadServerFixture<typeof client>(
	'packages/octane/tests/_fixtures/compiled-boundaries.tsrx',
);

describe('checked compiled boundaries', () => {
	it.each([false, true])(
		'updates, replaces and releases compiled routes (hydrate=%s)',
		(hydrate) => {
			const events: string[] = [];
			const props = {
				component: client.Screen,
				id: 'one',
				label: 'screen',
				tone: 'light',
				log: (value: string) => events.push(value),
			};
			const host = document.createElement('div');
			document.body.append(host);
			if (hydrate)
				host.innerHTML = renderToString(server.Shell, { ...props, component: server.Screen }).html;
			const original = host.querySelector('input');
			if (original) original.value = 'draft';
			const view = hydrate ? null : mount(client.Shell, props);
			const container = view?.container ?? host;
			const root = hydrate ? hydrateRoot(host, client.Shell, props) : view!.root;
			try {
				const input = container.querySelector('input')!;
				const button = container.querySelector('button')!;
				if (hydrate) expect(input).toBe(original);
				input.value = 'draft';
				flushSync(() => button.click());
				expect(button.textContent).toBe('screen:light:1');
				flushSync(() => root.render(client.Shell, { ...props, label: 'updated', tone: 'dark' }));
				expect(container.querySelector('input')).toBe(input);
				expect(input.value).toBe('draft');
				expect(button.textContent).toBe('updated:dark:1');
				flushSync(() => root.render(client.Shell, { ...props, id: 'two' }));
				expect(container.querySelector('input')).not.toBe(input);
				expect(container.querySelector('button')!.textContent).toBe('screen:light:0');
				flushSync(() => root.render(client.Shell, { ...props, component: client.Other }));
				expect(container.querySelector('aside')!.textContent).toBe('screen:light');
				expect(container.querySelector('footer')!.textContent).toBe('tail');
				expect(events).toEqual(['mount', 'cleanup', 'mount', 'cleanup']);
			} finally {
				if (view) view.unmount();
				else root.unmount();
				host.remove();
			}
		},
	);

	it.each([
		['host tag', 'article'],
		['string return', () => 'wrong'],
		['null return', () => null],
		['descriptor return', () => createElement('article', null, 'wrong')],
	])('contains a %s in the enclosing error boundary', (_, component) => {
		// Exercise inputs received from untyped route data too.
		// @ts-expect-error a host tag is intentionally not a compiled component
		const view = mount(client.CatchShell, { component });
		try {
			expect(view.container.querySelector('[role=alert]')?.textContent).toMatch(/CompiledOutlet/);
			expect(view.container.querySelector('article')).toBeNull();
		} finally {
			view.unmount();
		}
		const html = renderToString(server.CatchShell, { component }).html;
		expect(html).toContain('CompiledOutlet');
		expect(html).not.toContain('<article');
	});

	it('keeps ordinary dynamic components and context descriptor children', () => {
		const Returned = () => createElement('b', null, useContext(client.Ordinary));
		const view = mount(client.OrdinaryShell, { component: Returned });
		try {
			expect(view.container.querySelector('b')!.textContent).toBe('provided');
		} finally {
			view.unmount();
		}
	});

	it('allows an ordinary returned descriptor nested inside a compiled outlet and after it', () => {
		const props = { component: () => createElement('b', null, 'ordinary') };
		const host = document.createElement('div');
		host.innerHTML = renderToString(server.MixedOutletShell, props).html;
		expect(host.querySelector('section b')?.textContent).toBe('ordinary');
		expect(host.querySelectorAll('b')).toHaveLength(2);
		const view = mount(client.MixedOutletShell, props);
		try {
			expect(view.container.querySelector('section b')?.textContent).toBe('ordinary');
			expect(view.container.querySelectorAll('b')).toHaveLength(2);
		} finally {
			view.unmount();
		}
	});

	it('renders a shadowing component with the normal returned-value contract', () => {
		const replacement = () => createElement('b', null, 'returned by a different component');
		const view = mount(client.Shadowed, { replacement });
		try {
			expect(view.container.querySelector('b')!.textContent).toBe(
				'returned by a different component',
			);
		} finally {
			view.unmount();
		}
	});

	it('rejects descriptor children of a compiled-only provider on client and server', () => {
		const props = { children: createElement('b', null, 'descriptor') };
		expect(() => mount(client.CheckedProvider, props)).toThrow(/CompiledContext/);
		expect(() => renderToString(server.CheckedProvider, props)).toThrow(/CompiledContext/);
	});

	it('reveals a resolved compiled route and cannot remount after its owner unmounts', async () => {
		let resolve!: (component: typeof client.Other) => void;
		const resource = new Promise<typeof client.Other>((done) => (resolve = done));
		const props = { component: lazy(() => resource), label: 'route' };
		const visible = mount(client.PendingShell, props);
		const gone = mount(client.PendingShell, props);
		expect(visible.container.querySelector('[role=status]')!.textContent).toBe('loading');
		gone.unmount();
		try {
			await act(async () => resolve(client.Other));
			expect(visible.container.querySelector('aside')!.textContent).toBe('route:ready');
			expect(visible.container.querySelector('[role=status]')).toBeNull();
			expect(gone.container.childNodes.length).toBe(0);
		} finally {
			visible.unmount();
		}
	});
});
