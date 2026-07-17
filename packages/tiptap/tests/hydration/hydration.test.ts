import type { Editor } from '@tiptap/core';
import { flushSync, hydrateRoot } from 'octane';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DeferredEditor } from '../_fixtures/deferred-editor.tsrx';
import { flushEffects } from '../_helpers';

function settle(): void {
	flushEffects();
	flushSync(() => {});
	flushEffects();
}

afterEach(() => {
	vi.useRealTimers();
});

describe('@octanejs/tiptap hydration', () => {
	it('adopts the deferred server host and mounts a live editor after hydration', () => {
		vi.useFakeTimers();
		const container = document.createElement('div');
		container.innerHTML =
			'<main id="deferred-editor"><output id="deferred-status">deferred</output></main>';
		document.body.appendChild(container);
		const serverMain = container.querySelector('main');
		const serverStatus = container.querySelector('output');
		let editor: Editor | undefined;
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});

		const root = hydrateRoot(container, DeferredEditor, {
			onEditor: (currentEditor: Editor) => {
				editor = currentEditor;
			},
		});
		expect(container.querySelector('main')).toBe(serverMain);
		expect(container.querySelector('output')).toBe(serverStatus);
		expect(serverStatus?.textContent).toBe('deferred');

		settle();
		expect(container.querySelector('main')).toBe(serverMain);
		expect(container.querySelector('output')).toBe(serverStatus);
		expect(serverStatus?.textContent).toBe('ready');
		expect(container.querySelector('[data-editor-host="deferred"] .ProseMirror')?.textContent).toBe(
			'Hydrated editor',
		);
		expect(editor).toBeTruthy();
		expect(error).not.toHaveBeenCalled();

		root.unmount();
		flushEffects();
		vi.runAllTimers();
		expect(editor?.isDestroyed).toBe(true);
		error.mockRestore();
		container.remove();
	});
});
