import { renderToString } from 'octane/server';
import { describe, expect, it } from 'vitest';

import { AriaServerFixture } from './_fixtures/server.tsx';

describe('@octanejs/aria server rendering', () => {
	it('renders stable label relationships and reads the server snapshot without a DOM', () => {
		expect(typeof document).toBe('undefined');
		const { html, css } = renderToString(AriaServerFixture, { locale: 'en-GB' });

		expect(html).toContain('id="aria-server"');
		expect(html).toContain('data-locale="en-GB"');
		expect(html).toContain('data-direction="ltr"');
		expect(html).toContain('id="aria-hydration-label"');
		expect(html).toContain('aria-labelledby="aria-hydration-label"');
		expect(html).toContain('id="aria-render-phase">server</output>');
		expect(css).toBe('');
	});

	it('derives the server-rendered text direction from an injected RTL locale', () => {
		const { html } = renderToString(AriaServerFixture, { locale: 'ar-AE' });

		expect(html).toContain('data-locale="ar-AE"');
		expect(html).toContain('data-direction="rtl"');
		expect(html).toContain('aria-labelledby="aria-hydration-label"');
	});
});
