import { renderToString } from 'octane/server';
import { describe, expect, it } from 'vitest';

import { PdfShell } from './pdf-shell.tsrx';

describe('react-pdf U1 — SSR-safe shell', () => {
	// @parity-case adapted:react-pdf-feasibility-ssr
	it('renders deterministic loading, error, and page shells without browser globals', () => {
		expect('window' in globalThis).toBe(false);
		expect('document' in globalThis).toBe(false);
		expect('Worker' in globalThis).toBe(false);
		expect('OffscreenCanvas' in globalThis).toBe(false);

		const loading = renderToString(PdfShell).html;
		const error = renderToString(PdfShell, { state: 'error', error: 'Broken PDF' }).html;
		const page = renderToString(PdfShell, { state: 'page', pageNumber: 3 }).html;

		expect(renderToString(PdfShell).html).toBe(loading);
		expect(loading).toContain('data-phase="server"');
		expect(loading).toContain('Loading PDF…');
		expect(error).toContain('react-pdf__message--error');
		expect(error).toContain('Broken PDF');
		expect(page).toContain('data-page-number="3"');
		expect(page).toContain('Loading page…');
	});
});
