import { Editor, type Editor as EditorType } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { flushSync } from 'octane';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ContextEditor, LegacyProvider } from '../_fixtures/context-editor.tsrx';
import { EditorContentHost } from '../_fixtures/editor-content-host.tsrx';
import { flushEffects, mount } from '../_helpers';

const extensions = [StarterKit];

function settle(): void {
	flushEffects();
	flushSync(() => {});
	flushEffects();
}

afterEach(() => {
	vi.useRealTimers();
});

describe('@octanejs/tiptap components', () => {
	it('provides modern and legacy context while useTiptapState follows transactions', () => {
		const editor = new Editor({ extensions, content: '<p>Initial context</p>' });
		let modernEditor: EditorType | undefined;
		let legacyEditor: EditorType | null | undefined;
		const result = mount(ContextEditor as any, {
			editor,
			onContexts: (modern: EditorType, legacy: EditorType | null) => {
				modernEditor = modern;
				legacyEditor = legacy;
			},
		});
		settle();

		expect(modernEditor).toBe(editor);
		expect(legacyEditor).toBe(editor);
		expect(result.find('[data-context-text]').textContent).toBe('Initial context');
		expect(result.find('[data-editor-host="context"] .ProseMirror')).toBe(editor.view.dom);

		editor.commands.setContent('<p>Context update</p>');
		settle();
		expect(result.find('[data-context-text]').textContent).toBe('Context update');

		result.unmount();
		flushEffects();
		expect(editor.isDestroyed).toBe(false);
		editor.destroy();
	});

	it('keeps a live editor reusable as EditorContent switches instances', () => {
		const first = new Editor({ extensions, content: '<p>First editor</p>' });
		const second = new Editor({ extensions, content: '<p>Second editor</p>' });
		const firstView = first.view.dom;
		const secondView = second.view.dom;
		let host: HTMLDivElement | null = null;
		const hostRef = (element: HTMLDivElement | null) => {
			host = element;
		};
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

	it('renders EditorProvider slots in order and tears down its owned editor', () => {
		vi.useFakeTimers();
		let editor: EditorType | undefined;
		const result = mount(LegacyProvider as any, {
			onEditor: (currentEditor: EditorType) => {
				editor = currentEditor;
			},
		});
		settle();

		expect(editor).toBeTruthy();
		expect(
			result
				.findAll('[data-provider-piece]')
				.map((element) => element.getAttribute('data-provider-piece')),
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
