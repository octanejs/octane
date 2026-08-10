import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'octane';
import { toast } from '@octanejs/sonner';
import { showCustom, ToasterApp } from '../_fixtures/app.tsrx';
import { cleanupToasters, mountApp, settle, unmountApp, waitFor } from '../_helpers';

afterEach(async function () {
	await cleanupToasters();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('@octanejs/sonner — Toaster', function () {
	it('supports native action/cancel semantics and custom Octane elements', async function () {
		const root = mountApp(ToasterApp);
		await settle();
		let actionTarget: EventTarget | null = null;
		let cancelEvent: MouseEvent | null = null;
		let cancelTarget: EventTarget | null = null;
		const action = vi.fn(function (event: MouseEvent) {
			actionTarget = event.currentTarget;
			event.preventDefault();
		});
		toast('Action toast', {
			id: 'action',
			duration: Infinity,
			action: { label: 'Keep', onClick: action },
			cancel: {
				label: 'Cancel',
				onClick: function (event) {
					cancelEvent = event;
					cancelTarget = event.currentTarget;
				},
			},
		});
		await settle();

		flushSync(function () {
			(root.container.querySelector('[data-action]') as HTMLButtonElement).click();
		});
		await settle();
		expect(action).toHaveBeenCalledTimes(1);
		expect(action.mock.calls[0][0]).toBeInstanceOf(MouseEvent);
		expect(actionTarget).toBeInstanceOf(HTMLButtonElement);
		expect(root.container.querySelector('[data-sonner-toast]')).not.toBeNull();

		flushSync(function () {
			(root.container.querySelector('[data-cancel]') as HTMLButtonElement).click();
		});
		expect(cancelEvent).toBeInstanceOf(MouseEvent);
		expect(cancelTarget).toBeInstanceOf(HTMLButtonElement);
		await waitFor(function () {
			return root.container.querySelector('[data-sonner-toast]') === null;
		});
		expect(root.container.querySelector('[data-sonner-toast]')).toBeNull();

		showCustom('custom');
		await settle();
		expect(root.container.querySelector('[data-testid="custom-content"]')?.textContent).toContain(
			'Custom content',
		);
		expect(
			root.container
				.querySelector('[data-testid="custom-content"]')
				?.closest('[data-sonner-toast]')
				?.getAttribute('data-styled'),
		).toBe('false');
		unmountApp(root);
	});

	it('accepts the Toaster host ref as an ordinary prop', async function () {
		let host: HTMLElement | null = null;
		const root = mountApp(ToasterApp, {
			ref: function (node: HTMLElement | null) {
				host = node;
			},
		});
		await settle();
		toast('Ref contract', { id: 'ref-contract', duration: Infinity });
		await settle();
		expect(host).toBeInstanceOf(HTMLElement);
		expect(host?.tagName).toBe('SECTION');
		expect(host?.getAttribute('aria-live')).toBe('polite');
		unmountApp(root);
	});
});
