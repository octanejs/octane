/**
 * Adapted divergence: EditorConsumer is a render-prop compatibility component
 * because Octane contexts do not expose `.Consumer`. Dedicated file so the rest
 * of component conformance stays in ordinary shards.
 */
import { Editor, type Editor as EditorType } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { flushSync } from 'octane';
import { describe, expect, it } from 'vitest';

import { ContextEditor } from '../_fixtures/context-editor.tsrx';
import { flushEffects, mount } from '../_helpers';

const extensions = [StarterKit];

function settle(): void {
	flushEffects();
	flushSync(function () {});
	flushEffects();
}

describe('@octanejs/tiptap components', function () {
	// Octane divergence: EditorConsumer render-prop (framework contract; not parity-owned).
	it('provides modern and legacy context while useTiptapState follows editor changes and transactions', function () {
		const editor = new Editor({ extensions, content: '<p>Initial context</p>' });
		const replacementEditor = new Editor({
			extensions,
			content: '<p>Replacement context</p>',
		});
		let modernEditor: EditorType | undefined;
		let legacyEditor: EditorType | null | undefined;
		function onContexts(modern: EditorType, legacy: EditorType | null): void {
			modernEditor = modern;
			legacyEditor = legacy;
		}
		const result = mount(ContextEditor as any, {
			editor,
			onContexts,
		});
		settle();

		expect(modernEditor).toBe(editor);
		expect(legacyEditor).toBe(editor);
		expect(result.find('[data-context-text]').textContent).toBe('Initial context');
		expect(result.find('[data-editor-host="context"] .ProseMirror')).toBe(editor.view.dom);

		editor.commands.setContent('<p>Context update</p>');
		settle();
		expect(result.find('[data-context-text]').textContent).toBe('Context update');

		result.update(ContextEditor as any, { editor: replacementEditor, onContexts });
		settle();
		expect(modernEditor).toBe(replacementEditor);
		expect(legacyEditor).toBe(replacementEditor);
		expect(result.find('[data-context-text]').textContent).toBe('Replacement context');
		expect(result.find('[data-editor-host="context"] .ProseMirror')).toBe(
			replacementEditor.view.dom,
		);

		result.unmount();
		flushEffects();
		expect(editor.isDestroyed).toBe(false);
		expect(replacementEditor.isDestroyed).toBe(false);
		editor.destroy();
		replacementEditor.destroy();
	});
});
