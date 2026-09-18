import { describe, expect, it } from 'vitest';
import { getGlobalApi, init } from '@octanejs/grab';

describe('server-side import surface', () => {
	it('imports without a DOM and returns the noop API from init()', () => {
		expect(typeof window).toBe('undefined');
		const api = init();
		expect(api.isActive()).toBe(false);
		expect(api.isEnabled()).toBe(false);
		expect(api.getToolbarState()).toBeNull();
		expect(() => api.activate()).not.toThrow();
		expect(() => api.deactivate()).not.toThrow();
		expect(() => api.dispose()).not.toThrow();
	});

	it('does not auto-init or register a global API without window', async () => {
		const mod = await import('@octanejs/grab');
		expect(mod.getGlobalApi()).toBeNull();
		expect(getGlobalApi()).toBeNull();
	});
});
