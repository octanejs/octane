import { renderToString } from 'octane/server';
import { describe, expect, it } from 'vitest';

import { AriaNumberFieldServerFixture, AriaServerFixture } from './_fixtures/server.tsx';

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

	it('formats and parses controlled number fields on the server without a DOM', () => {
		expect(typeof document).toBe('undefined');
		const { html } = renderToString(AriaNumberFieldServerFixture, {
			locale: 'de-DE',
			value: 1234.5,
			formatOptions: { minimumFractionDigits: 2 },
		});

		expect(html).toContain('id="aria-server-number"');
		expect(html).toContain('data-number="1234.5"');
		expect(html).toContain('>1.234,50</output>');
	});

	it.each([
		['USD', '$12.25', '12.25'],
		['JPY', '¥10', '10'],
		['BHD', 'BHD\u00a012.270', '12.27'],
		['KWD', 'KWD\u00a012.270', '12.27'],
	] as const)(
		'preserves %s minor units when server-rendered rounding increments omit precision',
		(currency, formattedValue, parsedValue) => {
			const { html } = renderToString(AriaNumberFieldServerFixture, {
				locale: 'en-US',
				value: 12.27,
				formatOptions: { style: 'currency', currency, roundingIncrement: 5 },
			});

			expect(html).toContain('data-number="' + parsedValue + '"');
			expect(html).toContain('>' + formattedValue + '</output>');
		},
	);
});
