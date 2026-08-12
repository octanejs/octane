import { Editor, type Editor as EditorType } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { flushSync } from 'octane';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LegacyProvider } from '../_fixtures/context-editor.tsrx';
import { EditorContentHost } from '../_fixtures/editor-content-host.tsrx';
import { flushEffects, mount } from '../_helpers';

const extensions = [StarterKit];

function settle(): void {
	flushEffects();
	flushSync(function () {});
	flushEffects();
}

afterEach(function () {
	vi.useRealTimers();
});

describe('@octanejs/tiptap components', function () {
	it('keeps a live editor reusable as EditorContent switches instances', function () {
		const first = new Editor({ extensions, content: '<p>First editor</p>' });
		const second = new Editor({ extensions, content: '<p>Second editor</p>' });
		const firstView = first.view.dom;
		const secondView = second.view.dom;
		let host: HTMLDivElement | null = null;
		function hostRef(element: HTMLDivElement | null): void {
			host = element;
		}
		const result = mount(EditorContentHost as any, { editor: first, hostRef });
		settle();

		expect(host).toBe(result.find('[data-editor-host="standalone"]'));
		expect(firstView.parentElement).toBe(host);
		expect(host?.textContent).toBe('First editor');

		result.update(EditorContentHost as any, { editor: second, hostRef });
		settle();
		expect(first.isDestroyed).toBe(false);
		expect(secondView.parentElement).toBe(host);
		expect(host?.textContent).toBe('Second editor');

		result.update(EditorContentHost as any, { editor: first, hostRef });
		settle();
		expect(first.view.dom).toBe(firstView);
		expect(firstView.parentElement).toBe(host);
		expect(host?.textContent).toBe('First editor');

		result.unmount();
		flushEffects();
		expect(first.isDestroyed).toBe(false);
		expect(second.isDestroyed).toBe(false);
		first.destroy();
		second.destroy();
	});

	it('renders EditorProvider slots in order and tears down its owned editor', function () {
		vi.useFakeTimers();
		let editor: EditorType | undefined;
		const result = mount(LegacyProvider as any, {
			onEditor: function (currentEditor: EditorType) {
				editor = currentEditor;
			},
		});
		settle();

		expect(editor).toBeTruthy();
		expect(
			result.findAll('[data-provider-piece]').map(function (element) {
				return element.getAttribute('data-provider-piece');
			}),
		).toEqual(['before', 'content', 'child', 'after']);
		expect(result.find('[data-provider-piece="content"] .ProseMirror').textContent).toBe(
			'Provided content',
		);

		result.unmount();
		flushEffects();
		vi.runAllTimers();
		expect(editor?.isDestroyed).toBe(true);
	});
});
