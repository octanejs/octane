import type { BlockNoteEditor } from '@blocknote/core';
import { renderToString } from 'octane/server';
import { describe, expect, it, vi } from 'vitest';

import { SsrViewFixture } from '../_fixtures/view.tsrx';

describe('@octanejs/blocknote server rendering', () => {
	it('renders the view shell without mounting or reading the DOM', () => {
		const editor = {
			mount: vi.fn(),
			unmount: vi.fn(),
		} as unknown as BlockNoteEditor;

		const { html } = renderToString(SsrViewFixture, { editor, theme: 'dark' });

		expect(html).toContain('class="bn-container bn-root dark server-view"');
		expect(html).toContain('data-color-scheme="dark"');
		expect(html).toContain('data-blocknote-editor=""');
		expect(html).toContain('data-server-child="">server</span>');
		expect(editor.mount).not.toHaveBeenCalled();
		expect(editor.unmount).not.toHaveBeenCalled();
	});
});
