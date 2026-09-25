import { BlockNoteEditor } from '@blocknote/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { flushEffects, mount, type MountResult } from '../../../octane/tests/_helpers.js';
import { ActivityEditor, HeadlessView, SplitView } from '../_fixtures/headless-view.tsrx';

const createEditor = () =>
	BlockNoteEditor.create({
		initialContent: [{ type: 'paragraph', content: 'Hello headless' }],
	});

let mounted: MountResult | undefined;

afterEach(() => {
	mounted?.unmount();
	mounted = undefined;
});

describe('@octanejs/blocknote — headless BlockNoteViewRaw', () => {
	it('keeps the created editor usable after Activity hides and reveals it', () => {
		let editor: BlockNoteEditor | undefined;
		const capture = (value: BlockNoteEditor) => {
			editor = value;
		};
		const props = { mode: 'visible' as const, capture };
		mounted = mount(ActivityEditor, props);
		flushEffects();
		const original = editor!;
		expect(original.domElement?.isConnected).toBe(true);
		original.updateBlock(original.document[0], { content: 'Edited before hiding' });

		mounted.update(ActivityEditor, { ...props, mode: 'hidden' });
		flushEffects();
		mounted.update(ActivityEditor, props);
		flushEffects();

		expect(editor).toBe(original);
		expect(original.domElement?.isConnected).toBe(true);
		expect(original.domElement?.textContent).toContain('Edited before hiding');
		original.updateBlock(original.document[0], { content: 'Edited after reveal' });
		expect(original.domElement?.textContent).toContain('Edited after reveal');
	});

	it('mounts the editor into the container with no default UI', () => {
		const editor = createEditor();
		mounted = mount(HeadlessView, { editor, theme: 'dark', className: 'custom' });
		flushEffects();

		const container = mounted.find('[data-testid="view"]');
		expect(container.className).toBe('bn-root bn-container dark custom');
		expect(container.getAttribute('data-color-scheme')).toBe('dark');

		const content = mounted.find('.bn-editor');
		expect(content.getAttribute('contenteditable')).toBe('true');
		expect(content.textContent).toContain('Hello headless');

		// Children render after the editor and read it from context.
		expect(mounted.find('output').getAttribute('data-probe')).toBe('1');
		expect(mounted.findAll('.bn-toolbar, .bn-side-menu, .bn-suggestion-menu')).toEqual([]);

		expect(editor.portalElement?.className).toBe('bn-root dark custom');
		expect(editor.portalElement?.getAttribute('data-color-scheme')).toBe('dark');
	});

	it('reports content changes through onChange', () => {
		const editor = createEditor();
		const onChange = vi.fn();
		mounted = mount(HeadlessView, { editor, onChange });
		flushEffects();

		editor.insertBlocks([{ type: 'paragraph', content: 'Second' }], editor.document[0]!, 'after');

		expect(onChange).toHaveBeenCalled();
		expect(mounted.find('.bn-editor').textContent).toContain('Second');
	});

	it('remounts the editor when editable toggles', () => {
		const editor = createEditor();
		mounted = mount(HeadlessView, { editor, editable: false });
		flushEffects();
		expect(editor.isEditable).toBe(false);
		expect(mounted.find('.bn-editor').getAttribute('contenteditable')).toBe('false');

		mounted.update(HeadlessView, { editor, editable: true });
		flushEffects();
		expect(editor.isEditable).toBe(true);
		expect(mounted.find('.bn-editor').getAttribute('contenteditable')).toBe('true');
		expect(mounted.find('.bn-editor').textContent).toContain('Hello headless');
	});

	it('lets children own editor placement when renderEditor is false', () => {
		const editor = createEditor();
		mounted = mount(SplitView, { editor });
		flushEffects();

		const [toolbar, editorHost] = Array.from(mounted.find('.bn-container').children);
		expect(toolbar?.className).toBe('toolbar');
		expect(editorHost).toBe(mounted.find('.bn-editor'));
		expect(editorHost?.textContent).toContain('Hello headless');
	});

	it('unmounts the editor with the view', () => {
		const editor = createEditor();
		const unmount = vi.spyOn(editor, 'unmount');
		mounted = mount(HeadlessView, { editor });
		flushEffects();

		mounted.unmount();
		mounted = undefined;
		expect(unmount).toHaveBeenCalled();
	});
});
