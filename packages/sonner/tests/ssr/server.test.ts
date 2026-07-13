import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'octane/server';
import { toast } from '@octanejs/sonner';
import { ServerToaster } from './_fixtures/server.tsrx';

describe('@octanejs/sonner — server rendering', () => {
	it('renders the accessible empty host without reading browser globals', () => {
		const { html } = renderToString(ServerToaster);
		expect(html).toContain('<h1>Toast host</h1>');
		expect(html).toContain('aria-label="Notifications alt+T"');
		expect(html).toContain('aria-live="polite"');
		expect(html).not.toContain('data-sonner-toaster');
	});

	it('dismisses a targeted toast without requestAnimationFrame', () => {
		vi.stubGlobal('requestAnimationFrame', undefined);
		try {
			const id = toast('Server toast', { id: 'server-dismiss' });
			expect(() => toast.dismiss(id)).not.toThrow();
			expect(toast.getToasts().some((item) => item.id === id)).toBe(false);
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
