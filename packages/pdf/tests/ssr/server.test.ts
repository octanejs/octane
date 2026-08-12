import { renderToReadableStream, renderToString } from 'octane/server';
import { describe, expect, it } from 'vitest';

import { ServerDocumentFixture, ServerNoDataFixture } from './server-fixture.tsrx';

describe('@octanejs/pdf server contract', () => {
	// @parity-case adapted:pdf-ssr-loading
	it('renders deterministic loading markup without evaluating browser APIs', () => {
		expect('window' in globalThis).toBe(false);
		expect('document' in globalThis).toBe(false);
		expect('Worker' in globalThis).toBe(false);

		const first = renderToString(ServerDocumentFixture).html;
		const second = renderToString(ServerDocumentFixture).html;
		expect(second).toBe(first);
		expect(first).toContain('react-pdf__Document');
		expect(first).toContain('react-pdf__message--loading');
		expect(first).toContain('Loading PDF…');
		expect(first).not.toContain('canvas');
	});

	// @parity-case adapted:pdf-ssr-no-data
	it('preserves the upstream no-data shell and composed class', () => {
		const { html } = renderToString(ServerNoDataFixture);
		expect(html).toContain('react-pdf__Document custom-document');
		expect(html).toContain('react-pdf__message--no-data');
		expect(html).toContain('Choose a PDF');
	});

	// @parity-case adapted:pdf-ssr-streaming
	it('streams the same browser-safe loading shell', async () => {
		const stream = await renderToReadableStream(ServerDocumentFixture);
		const html = await new Response(stream).text();
		expect(html).toContain('react-pdf__Document');
		expect(html).toContain('react-pdf__message--loading');
		expect(html).toContain('Loading PDF…');
		expect(html).not.toContain('canvas');
	});
});
