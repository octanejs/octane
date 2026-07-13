import { describe, expect, it, vi } from 'vitest';
import { drainPassiveEffects, flushSync, hydrateRoot } from 'octane';
import { Toaster, toast } from '@octanejs/sonner';

const SERVER_HTML =
	'<section aria-label="Notifications alt+T" tabindex="-1" aria-live="polite" ' +
	'aria-relevant="additions text" aria-atomic="false"><!--[--><!--[--><!--[-->' +
	'<!--]--><!--]--><!--]--></section>';

async function settle(): Promise<void> {
	drainPassiveEffects();
	flushSync(() => {});
	await new Promise((resolve) => setTimeout(resolve, 0));
	drainPassiveEffects();
	flushSync(() => {});
}

describe('@octanejs/sonner — hydration', () => {
	it('adopts the server host and can show the first client toast', async () => {
		const container = document.createElement('div');
		container.innerHTML = SERVER_HTML;
		document.body.appendChild(container);
		const serverSection = container.querySelector('section');
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});

		const root = hydrateRoot(container, Toaster, {
			theme: 'light',
			position: 'top-center',
		});
		await settle();
		expect(container.querySelector('section')).toBe(serverSection);
		expect(error).not.toHaveBeenCalled();

		toast.success('Hydrated toast', {
			id: 'hydrated-toast',
			duration: Infinity,
		});
		await settle();
		expect(container.querySelector('[data-sonner-toaster]')).not.toBeNull();
		expect(container.querySelector('[data-sonner-toast]')?.textContent).toContain('Hydrated toast');
		expect(container.querySelector('section')).toBe(serverSection);

		root.unmount();
		error.mockRestore();
		container.remove();
	});
});
