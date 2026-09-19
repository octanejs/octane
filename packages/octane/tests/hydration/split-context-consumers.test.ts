import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, createRoot, flushSync, hydrateRoot } from 'octane';
import { condition, load } from 'octane/hydration';
import { renderToString } from 'octane/server';
import { loadServerFixture } from '../_server-fixture.js';
import * as client from './_fixtures/private-split-context.tsrx';
import * as opaque from './_fixtures/opaque-split-context.tsrx';

const server = loadServerFixture<typeof client>(
	'packages/octane/tests/hydration/_fixtures/private-split-context.tsrx',
);
let host: HTMLElement;
let root: ReturnType<typeof createRoot> | undefined;

function container() {
	host = document.createElement('div');
	document.body.append(host);
	return host;
}

afterEach(() => {
	root?.unmount();
	root = undefined;
	host?.remove();
});

describe('Context providers across split hydration', () => {
	it('keeps nested and sibling capture values isolated across independent query loads', async () => {
		root = createRoot(container());
		await act(() => root!.render(client.Nested, { when: load(), value: 'outer' }));
		await vi.waitFor(() =>
			expect(
				[...host.querySelectorAll('.split-context-eager')].map((node) => node.textContent),
			).toEqual(['outer', 'inner', 'outer', 'sibling']),
		);
		await act(() => root!.render(client.Nested, { when: load(), value: 'updated' }));
		await vi.waitFor(() =>
			expect(
				[...host.querySelectorAll('.split-context-eager')].map((node) => node.textContent),
			).toEqual(['updated', 'inner', 'updated', 'sibling']),
		);
		root.unmount();
		expect(host.childNodes.length).toBe(0);
	});
	it('retains one shared Context identity, nearest values and native component state', async () => {
		const onEffect = vi.fn();
		const props = { when: load(), value: 'first', onEffect };
		root = createRoot(container());
		await act(() => root!.render(client.App, props));
		await vi.waitFor(() => expect(host.querySelector('#split-context-value')).not.toBeNull());
		const value = host.querySelector('#split-context-value')!;
		const input = host.querySelector<HTMLInputElement>('#split-context-draft')!;
		const button = host.querySelector<HTMLButtonElement>('#split-context-action')!;
		expect(
			[...host.querySelectorAll('.split-context-eager')].map((node) => node.textContent),
		).toEqual(['default', 'outer']);
		expect(value.textContent).toBe('first');
		input.value = 'typed';
		await act(() => button.click());
		await act(() => root!.render(client.App, { ...props, value: 'second', outer: 'changed' }));
		expect(host.querySelector('#split-context-value')).toBe(value);
		expect(value.textContent).toBe('second');
		expect(value.getAttribute('title')).toBe('second');
		expect(host.querySelector('#split-context-action')).toBe(button);
		expect(button.textContent).toBe('1');
		expect(host.querySelector('#split-context-draft')).toBe(input);
		expect(input.value).toBe('typed');
		expect(
			[...host.querySelectorAll('.split-context-eager')].map((node) => node.textContent),
		).toEqual(['default', 'changed']);
		root.unmount();
		expect(host.childNodes.length).toBe(0);
		expect(onEffect.mock.calls).toEqual([['mount'], ['cleanup']]);
	});

	it('adopts server UI and activates using the latest provider value', async () => {
		const onEffect = vi.fn(),
			onHydrated = vi.fn();
		const props = { when: condition(false), value: 'server', onEffect, onHydrated };
		container().innerHTML = renderToString(server.App, props).html;
		const editor = host.querySelector('#split-context-editor')!;
		const value = host.querySelector('#split-context-value')!;
		const input = host.querySelector<HTMLInputElement>('#split-context-draft')!;
		const id = editor.getAttribute('data-runtime-id');
		input.value = 'draft before activation';
		input.focus();
		input.setSelectionRange(2, 7);
		root = hydrateRoot(host, client.App, props);
		await act(() => {});
		expect(onEffect).not.toHaveBeenCalled();
		expect(value.textContent).toBe('server');
		await act(() => root!.render(client.App, { ...props, when: load(), value: 'latest' }));
		await vi.waitFor(() => expect(onHydrated).toHaveBeenCalledOnce());
		expect(host.querySelector('#split-context-editor')).toBe(editor);
		expect(editor.getAttribute('data-runtime-id')).toBe(id);
		expect(host.querySelector('#split-context-value')).toBe(value);
		expect(value.textContent).toBe('latest');
		expect(host.querySelector('#split-context-draft')).toBe(input);
		expect(input.value).toBe('draft before activation');
		expect(document.activeElement).toBe(input);
		expect([input.selectionStart, input.selectionEnd]).toEqual([2, 7]);
		root.unmount();
		expect(onEffect.mock.calls).toEqual([['mount'], ['cleanup']]);
		expect(host.childNodes.length).toBe(0);
	});

	it('retries suspended split content with the current provider and retires obsolete work', async () => {
		let release!: () => void;
		const pending = new Promise<void>((done) => {
			release = done;
		});
		const onEffect = vi.fn(),
			onPending = vi.fn();
		root = createRoot(container());
		await act(() =>
			root!.render(client.Pending, { when: load(), value: 'old', pending, onEffect, onPending }),
		);
		await vi.waitFor(() => expect(onPending).toHaveBeenCalled());
		expect(host.querySelector('#split-context-editor')).toBeNull();
		await act(() =>
			root!.render(client.Pending, { when: load(), value: 'latest', pending, onEffect }),
		);
		await act(() => release());
		await vi.waitFor(() => expect(host.querySelector('#split-context-value')).not.toBeNull());
		expect(host.querySelector('#split-context-value')!.textContent).toBe('latest');
		root.unmount();
		expect(onEffect.mock.calls).toEqual([['mount'], ['cleanup']]);
		let retire!: () => void;
		const obsolete = new Promise<void>((done) => {
			retire = done;
		});
		onPending.mockClear();
		root = createRoot(host);
		await act(() =>
			root!.render(client.Pending, {
				when: load(),
				value: 'retired',
				pending: obsolete,
				onEffect,
				onPending,
			}),
		);
		await vi.waitFor(() => expect(onPending).toHaveBeenCalled());
		root.unmount();
		await act(() => retire());
		expect(host.childNodes.length).toBe(0);
		expect(onEffect.mock.calls).toEqual([['mount'], ['cleanup']]);
	});

	it('accepts opaque handles after the model engine loads and stops subscriptions on unmount', async () => {
		root = createRoot(container());
		await act(() => root!.render(client.App, { when: load(), value: 'plain' }));
		await vi.waitFor(() => expect(host.querySelector('#split-context-value')).not.toBeNull());
		expect(host.querySelector('#split-context-value')!.textContent).toBe('plain');
		const { createScope } = await import('octane/signals');
		const scope = createScope({ scopeKey: 'split-context-late-model' });
		const value = scope.signal$('value', 'first');
		try {
			await act(() => root!.render(client.App, { when: load(), value }));
			await vi.waitFor(() =>
				expect(host.querySelector('#split-context-value')?.textContent).toBe('first'),
			);
			const span = host.querySelector('#split-context-value')!;
			const input = host.querySelector<HTMLInputElement>('#split-context-draft')!;
			input.value = 'typed';
			expect(span.textContent).toBe('first');
			flushSync(() => value.set('second'));
			expect(span.textContent).toBe('second');
			expect(span.getAttribute('title')).toBe('second');
			expect(host.querySelector('#split-context-value')).toBe(span);
			expect(host.querySelector('#split-context-draft')).toBe(input);
			expect(input.value).toBe('typed');
			root.unmount();
			flushSync(() => value.set('retired'));
			expect(span.textContent).toBe('second');
			expect(host.childNodes.length).toBe(0);
		} finally {
			root?.unmount();
			scope.dispose();
		}
	});

	it('preserves exported provider descriptor children and later ordinary returned output', async () => {
		root = createRoot(container());
		await act(() =>
			root!.render(opaque.App, {
				when: load(),
				value: 'provided',
				children: createElement(opaque.Reader, null),
			}),
		);
		await vi.waitFor(() => expect(host.textContent).toBe('provided'));
		expect(host.textContent).toBe('provided');
		await act(() =>
			root!.render(opaque.App, { when: load(), value: 'unused', children: ['ordinary', ' text'] }),
		);
		expect(host.textContent).toBe('ordinary text');
		flushSync(() =>
			root!.render(opaque.Theme, { value: 'root', children: createElement(opaque.Reader, null) }),
		);
		expect(host.textContent).toBe('root');
		flushSync(() => root!.render(opaque.Theme, { children: 'returned' }));
		expect(host.textContent).toBe('returned');
		root.unmount();
		expect(host.childNodes.length).toBe(0);
	});
});
