import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'octane';
import { toast } from '@octanejs/sonner';
import { drainPassiveEffects } from 'octane';
import { mount } from '../../octane/tests/_helpers';
import { DefaultToasterFixture, ToasterFixture } from './_fixtures/sonner-app.tsrx';

async function settle(): Promise<void> {
	drainPassiveEffects();
	flushSync(() => {});
	await new Promise((resolve) => setTimeout(resolve, 0));
	drainPassiveEffects();
	flushSync(() => {});
}

afterEach(async () => {
	toast.dismiss();
	await new Promise((resolve) => setTimeout(resolve, 220));
	await settle();
});

describe('@octanejs/shadcn — Toaster (sonner wrapper)', () => {
	// @parity-case adapted:shadcn-sonner-theme
	it('renders a toast with the cn-toast class, custom success icon, and theme/style wiring', async () => {
		vi.stubGlobal(
			'matchMedia',
			vi.fn(() => ({
				matches: true,
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
				addListener: vi.fn(),
				removeListener: vi.fn(),
			})),
		);
		const defaultMount = mount(DefaultToasterFixture);
		await settle();
		toast.info('Default theme', { id: 'shadcn-default-theme', duration: Infinity });
		await settle();
		const defaultToaster = document.querySelector('[data-sonner-toaster]') as HTMLElement;
		expect(defaultToaster).not.toBeNull();
		// A system-default toaster follows the simulated dark OS preference.
		expect(defaultToaster.getAttribute('data-sonner-theme')).toBe('dark');
		toast.dismiss('shadcn-default-theme');
		defaultMount.unmount();
		await settle();
		vi.unstubAllGlobals();

		const { container, unmount } = mount(ToasterFixture);
		await settle();

		toast.success('Saved', { id: 'shadcn-toast', duration: Infinity });
		await settle();

		const toastEl = document.querySelector('[data-sonner-toast]') as HTMLElement;
		expect(toastEl).not.toBeNull();
		expect(toastEl.className).toContain('cn-toast');
		expect(toastEl.textContent).toContain('Saved');
		// The wrapper's lucide success icon replaces sonner's built-in asset.
		expect(toastEl.querySelector('svg.lucide-circle-check')).not.toBeNull();

		const toaster = document.querySelector('[data-sonner-toaster]') as HTMLElement;
		expect(toaster.getAttribute('data-sonner-theme')).toBe('dark');
		expect(toaster.className).toContain('toaster');
		expect(toaster.style.getPropertyValue('--normal-bg')).toBe('var(--popover)');

		unmount();
		void container;
	});
});
