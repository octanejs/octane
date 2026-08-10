import { describe, expect, it } from 'vitest';
import { renderToString } from 'octane/server';
import { ServerDiffEditor, ServerEditor } from './_fixtures/server.tsrx';

describe('@octanejs/monaco-editor — server rendering', () => {
	it('emits the loading shell and does not create an editor host attribute', () => {
		const { html } = renderToString(ServerEditor);
		expect(html).toContain('<h1>Editor page</h1>');
		expect(html).toContain('Loading...');
		expect(html).toContain('<section');
		expect(html).not.toContain('data-monaco-ready');
	});

	it('renders DiffEditor loading shell without throwing', () => {
		expect(() => renderToString(ServerDiffEditor)).not.toThrow();
		const { html } = renderToString(ServerDiffEditor);
		expect(html).toContain('Loading...');
	});
});
