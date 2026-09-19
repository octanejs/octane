import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, createRoot, flushSync, hydrateRoot, type Root } from 'octane';
import { condition, initializeHydrationEventCapture, interaction, load } from 'octane/hydration';
import { renderToString } from 'octane/server';
import { flushEffects } from '../_helpers.js';
import { loadServerFixture } from '../_server-fixture.js';
import * as client from './_fixtures/deferred-template-children.tsrx';

const server = loadServerFixture<typeof client>(
	'packages/octane/tests/hydration/_fixtures/deferred-template-children.tsrx',
);

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((complete) => {
		resolve = complete;
	});
	return { promise, resolve };
}

describe('deferred template children', () => {
	let host: HTMLElement;
	let root: Root | undefined;
	beforeEach(() => {
		host = document.createElement('div');
		document.body.append(host);
	});
	afterEach(() => {
		root?.unmount();
		host.remove();
		flushEffects();
	});

	it('replays early interaction while preserving drafts, IDs, identity and cleanup', async () => {
		const onClick = vi.fn(),
			onEffect = vi.fn(),
			onHydrated = vi.fn(),
			onInput = vi.fn();
		const props = { when: interaction(), label: 'first', onClick, onEffect, onHydrated, onInput };
		host.innerHTML = renderToString(server.TemplateBoundary, {
			...props,
			onEffect: undefined,
		}).html;
		const editor = host.querySelector('#template-editor')!;
		const input = host.querySelector<HTMLInputElement>('#template-draft')!;
		const button = host.querySelector<HTMLButtonElement>('#template-action')!;
		const sibling = host.querySelector('#template-sibling')!.textContent;
		const id = editor.getAttribute('data-runtime-id');
		input.value = 'typed before hydration';
		input.focus();
		input.setSelectionRange(3, 8);
		initializeHydrationEventCapture(document);
		button.click();
		root = hydrateRoot(host, client.TemplateBoundary, props);
		await act(() => {});
		expect(host.querySelector('#template-editor')).toBe(editor);
		expect(host.querySelector('#template-action')).toBe(button);
		expect(host.querySelector('#template-draft')).toBe(input);
		expect(input.value).toBe('typed before hydration');
		expect(document.activeElement).toBe(input);
		expect([input.selectionStart, input.selectionEnd]).toEqual([3, 8]);
		expect(onClick).toHaveBeenCalledExactlyOnceWith(id);
		expect(onHydrated).toHaveBeenCalledOnce();
		expect(button.textContent).toBe('first:1');
		expect(host.querySelector('#template-sibling')!.textContent).toBe(sibling);
		flushSync(() => root!.render(client.TemplateBoundary, { ...props, label: 'updated' }));
		expect(button.textContent).toBe('updated:1');
		input.dispatchEvent(new Event('input', { bubbles: true }));
		expect(onInput).toHaveBeenCalledOnce();
		root.unmount();
		root = undefined;
		expect(onEffect.mock.calls).toEqual([['mount'], ['cleanup']]);
		expect(host.childNodes.length).toBe(0);
	});

	it('keeps suspended server content and resumes the same native input', async () => {
		const gate = deferred(),
			onHydrated = vi.fn();
		host.innerHTML = renderToString(server.TemplateBoundary, {
			when: condition(false),
			label: 'server',
		}).html;
		const input = host.querySelector<HTMLInputElement>('#template-draft')!;
		input.value = 'parked draft';
		root = hydrateRoot(host, client.TemplateBoundary, {
			when: load(),
			pending: gate.promise,
			label: 'server',
			onHydrated,
		});
		await act(() => {});
		expect(host.querySelector('#template-draft')).toBe(input);
		expect(onHydrated).not.toHaveBeenCalled();
		await act(() => gate.resolve());
		expect(host.querySelector('#template-draft')).toBe(input);
		expect(input.value).toBe('parked draft');
		expect(onHydrated).toHaveBeenCalledOnce();
	});

	it('owns an empty pending arm without exposing the enclosing fallback', async () => {
		const gate = deferred();
		root = createRoot(host);
		root.render(client.ClientPendingBoundary, {
			when: load(),
			pending: gate.promise,
			label: 'ready',
		});
		await act(() => {});
		expect(host.querySelector('#outer-pending')).toBeNull();
		expect(host.querySelector('#template-editor')).toBeNull();
		await act(() => gate.resolve());
		expect(host.querySelector('#template-action')!.textContent).toBe('ready:0');
	});

	it('retires a pending activation before its wakeable settles', async () => {
		const gate = deferred(),
			onEffect = vi.fn();
		root = createRoot(host);
		root.render(client.ClientPendingBoundary, {
			when: load(),
			pending: gate.promise,
			label: 'retired',
			onEffect,
		});
		await act(() => {});
		root.unmount();
		root = undefined;
		await act(() => gate.resolve());
		expect(host.childNodes.length).toBe(0);
		expect(onEffect).not.toHaveBeenCalled();
	});

	for (const spread of [false, true]) {
		it(`renders ${spread ? 'spread' : 'explicit'} fallback output and then the ready child`, async () => {
			const gate = deferred();
			root = createRoot(host);
			const fallback = createElement('p', { id: 'authored-pending', children: 'Authored pending' });
			root.render(spread ? client.SpreadBoundary : client.ExplicitFallbackBoundary, {
				when: load(),
				pending: gate.promise,
				label: 'ready',
				fallback,
				boundary: { when: load(), fallback },
			});
			await act(() => {});
			expect(host.querySelector('#authored-pending')!.textContent).toBe('Authored pending');
			await act(() => gate.resolve());
			expect(host.querySelector('#authored-pending')).toBeNull();
			expect(host.querySelector('#template-action')!.textContent).toBe('ready:0');
		});
	}

	it('preserves descriptor children and shadowed value-returning component output', async () => {
		root = createRoot(host);
		root.render(client.DescriptorBoundary, {
			when: load(),
			children: createElement('article', { children: 'descriptor' }),
		});
		await act(() => {});
		expect(host.querySelector('article')!.textContent).toBe('descriptor');
		flushSync(() => root!.render(client.ShadowBoundary, { Hydrate: () => 'shadowed' }));
		expect(host.textContent).toBe('shadowed');
	});

	it('activates a compiler-generated split child and updates its latest captures', async () => {
		const onHydrated = vi.fn();
		host.innerHTML = renderToString(server.SplitBoundary, {
			when: condition(false),
			label: 'server',
		}).html;
		const input = host.querySelector<HTMLInputElement>('#template-draft')!;
		input.value = 'split draft';
		root = hydrateRoot(host, client.SplitBoundary, { when: load(), label: 'server', onHydrated });
		await vi.waitFor(
			async () => {
				await act(() => {});
				expect(onHydrated).toHaveBeenCalledOnce();
			},
			{ timeout: 4000 },
		);
		expect(host.querySelector('#template-draft')).toBe(input);
		expect(input.value).toBe('split draft');
		flushSync(() => root!.render(client.SplitBoundary, { when: load(), label: 'updated' }));
		expect(host.querySelector('#template-action')!.textContent).toBe('updated:0');
	});
});
