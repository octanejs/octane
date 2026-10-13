import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'octane/server';
import { SERVER_HTML } from '../server-html';
import { ServerDocument, ServerFeatureDocument } from '../_fixtures/server-document.tsrx';

describe('@octanejs/streamdown server rendering', () => {
	it('renders complete Markdown and math without browser globals', () => {
		const { html } = renderToString(ServerDocument, {
			content: '# Server\n\nA **complete** document.\n\n$$x^2$$',
		});
		expect(html).toContain('<h1');
		expect(html).toContain('>Server</');
		expect(html).toContain('data-streamdown="strong"');
		expect(html).toContain('complete');
		expect(html).toContain('class="katex"');
		expect(html).not.toContain('[object Object]');
	});

	it('materializes the same server document used by the hydration test', () => {
		const { html } = renderToString(ServerDocument, { content: '# Hydrate\n\nStable.' });
		if (process.env.STREAMDOWN_CAPTURE_SERVER_HTML)
			writeFileSync(process.env.STREAMDOWN_CAPTURE_SERVER_HTML, html);
		expect(html).toBe(SERVER_HTML);
	});

	it('renders streaming Markdown through custom HAST components and code blocks', () => {
		const { html } = renderToString(ServerFeatureDocument, {
			content: [
				'# Server feature',
				'',
				'```ts',
				'const answer = 42;',
				'```',
				'',
				'| Runtime | Ready |',
				'| --- | --- |',
				'| Octane | yes |',
			].join('\n'),
			mode: 'streaming',
		});

		expect(html).toContain('data-testid="server-heading"');
		expect(html).toContain('data-server-hast-node="h1"');
		expect(html).toContain('Server feature');
		expect(html).toContain('data-streamdown="code-block"');
		expect(html).toContain('const answer = 42;');
		expect(html).toContain('data-streamdown="table-wrapper"');
		expect(html).toContain('Octane');
		expect(html).not.toContain('[object Object]');
	});
});
