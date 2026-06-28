import { describe, it, expect } from 'vitest';
import { $createParagraphNode, $createTextNode, $getRoot, CLEAR_EDITOR_COMMAND } from 'lexical';
import { mount, flushEffects } from '../_helpers';
import { PluginsEditor } from '../_fixtures/plugins-editor.tsrx';

// Phase 2 plugins: History, OnChange, AutoFocus, ClearEditor — all mounted on the
// same editor, exercised through the editor API + commands.
describe('@octanejs/lexical — Phase 2 plugins', () => {
	it('OnChangePlugin fires on edits; ClearEditorPlugin empties via CLEAR_EDITOR_COMMAND', () => {
		let editor: any;
		let changeCount = 0;
		let lastText: string | null = null;
		const r = mount(PluginsEditor as any, {
			onEditor: (ed: any) => (editor = ed),
			onChange: (editorState: any) => {
				changeCount++;
				lastText = editorState.read(() => $getRoot().getTextContent());
			},
		});
		flushEffects();

		const ce = r.find('[contenteditable="true"]') as HTMLElement;

		editor.update(
			() => {
				const root = $getRoot();
				root.clear();
				const paragraph = $createParagraphNode();
				paragraph.append($createTextNode('typed'));
				root.append(paragraph);
			},
			{ discrete: true },
		);
		flushEffects();

		expect(ce.textContent).toBe('typed');
		expect(changeCount).toBeGreaterThan(0);
		expect(lastText).toBe('typed');

		// ClearEditorPlugin registered CLEAR_EDITOR_COMMAND — clearing empties the
		// editor state (the command's update is non-discrete, so assert state rather
		// than racing the DOM reconcile).
		editor.dispatchCommand(CLEAR_EDITOR_COMMAND, undefined);
		expect(editor.read(() => $getRoot().getTextContent())).toBe('');

		r.unmount();
	});
});
