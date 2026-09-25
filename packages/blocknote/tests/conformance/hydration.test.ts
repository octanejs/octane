import { BlockNoteEditor } from '@blocknote/core';
import { flushSync, hydrateRoot } from 'octane';
import { describe, expect, it, vi } from 'vitest';

import { flushEffects } from '../../../octane/tests/_helpers';
import { renderHydrationFixture } from '../../../octane/tests/_hydration-ssr';
import { SsrViewFixture } from '../_fixtures/view.tsrx';

describe('BlockNoteView hydration', () => {
	it('adopts the server theme before applying the client color preference', async () => {
		const editor = BlockNoteEditor.create();
		vi.stubGlobal('matchMedia', undefined);
		const container = document.createElement('div');
		let root: ReturnType<typeof hydrateRoot> | undefined;
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const { html } = await renderHydrationFixture(
				'blocknote',
				'packages/blocknote/tests/_fixtures/view.tsrx',
				'SsrViewFixture',
				{ editor },
			);
			container.innerHTML = html;
			document.body.appendChild(container);
			const wrapper = container.querySelector('.bn-root');
			const editorHost = container.querySelector('[data-blocknote-editor]');
			const child = container.querySelector('[data-server-child]');
			expect(wrapper?.getAttribute('data-color-scheme')).toBe('light');

			vi.stubGlobal('matchMedia', () => ({
				matches: true,
				addEventListener() {},
				removeEventListener() {},
			}));
			root = hydrateRoot(container, SsrViewFixture, { editor });
			flushSync(() => {});
			expect(errors).not.toHaveBeenCalled();
			expect(container.querySelector('.bn-root')).toBe(wrapper);
			expect(wrapper?.matches('.light')).toBe(true);
			expect(wrapper?.getAttribute('data-color-scheme')).toBe('light');
			expect(container.querySelector('[data-server-child]')).toBe(child);

			flushEffects();
			flushSync(() => {});
			expect(wrapper?.matches('.dark')).toBe(true);
			expect(wrapper?.getAttribute('data-color-scheme')).toBe('dark');
			expect(editor.domElement).toBe(editorHost);
			expect(errors).not.toHaveBeenCalled();
		} finally {
			root?.unmount();
			container.remove();
			errors.mockRestore();
			vi.unstubAllGlobals();
		}
		expect(editor.domElement).toBeUndefined();
	});
});
