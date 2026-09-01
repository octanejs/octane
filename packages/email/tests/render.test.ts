import { describe, expect, it } from 'vitest';
import { render } from '../src/index.ts';
import { NoHeadEmail, WelcomeEmail } from './_fixtures/email.tsrx';

describe('@octanejs/email', () => {
	it('renders an email-safe static document through the public API', async () => {
		const html = await render(WelcomeEmail, { name: 'Ada' });
		expect(html.startsWith('<!DOCTYPE html PUBLIC')).toBe(true);
		expect(html).toContain('<html dir="ltr" lang="en"><head>');
		expect(html).toContain('content="text/html; charset=UTF-8"');
		expect(html).toContain('Hello, Ada');
		expect(html).toContain('role="presentation"');
		expect(html).toContain('background-color:#000');
		const fontStyle = html.indexOf('@font-face');
		expect(fontStyle).toBeGreaterThan(html.indexOf('<head>'));
		expect(fontStyle).toBeLessThan(html.indexOf('</head>'));
		expect(html).toContain('<!--[if mso]><i style="mso-font-width:500%;mso-text-raise:18px"');
		expect(html).toContain('mso-text-raise:9px');
		expect(html).toContain('mso-font-width:500%" hidden>&#8202;&#8202;&#8203;');
		expect(html).not.toContain('data-octane');
	});

	it('supports readable output without changing document content', async () => {
		const html = await render(WelcomeEmail, { name: 'Grace' }, { pretty: true });
		expect(html).toContain('>\n<');
		expect(html).toContain('Hello, Grace');
	});

	it('creates a document head for collected styles when Head is omitted', async () => {
		const html = await render(NoHeadEmail);
		const style = html.indexOf('<style data-octane=');
		expect(style).toBeGreaterThan(html.indexOf('<head>'));
		expect(style).toBeLessThan(html.indexOf('</head>'));
		expect(html).toContain('Styled without Head');
	});
});
