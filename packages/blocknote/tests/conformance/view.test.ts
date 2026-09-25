import { BlockNoteEditor } from '@blocknote/core';
import { describe, expect, it, vi } from 'vitest';

import { flushEffects, mount } from '../../../octane/tests/_helpers.js';
import { ViewFixture, type ViewFixtureProps } from '../_fixtures/view.tsrx';

type Editor = BlockNoteEditor<any, any, any>;

function createEditorDouble() {
	const changes = new Set<Parameters<Editor['onChange']>[0]>();
	const selections = new Set<Parameters<Editor['onSelectionChange']>[0]>();
	const removeChange = vi.fn((callback: Parameters<Editor['onChange']>[0]) => {
		changes.delete(callback);
	});
	const removeSelection = vi.fn((callback: Parameters<Editor['onSelectionChange']>[0]) => {
		selections.delete(callback);
	});
	const editor = {
		isEditable: true,
		mount: vi.fn(),
		unmount: vi.fn(),
		onChange: vi.fn((callback: Parameters<Editor['onChange']>[0]) => {
			changes.add(callback);
			return () => removeChange(callback);
		}),
		onSelectionChange: vi.fn((callback: Parameters<Editor['onSelectionChange']>[0]) => {
			selections.add(callback);
			return () => removeSelection(callback);
		}),
	} as unknown as Editor;

	return {
		editor,
		removeChange,
		removeSelection,
		emitChange() {
			changes.forEach((callback) => callback(editor, { getChanges: () => ({}) } as never));
		},
		emitSelection() {
			selections.forEach((callback) => callback(editor));
		},
	};
}

function viewProps(editor: Editor, overrides: Partial<ViewFixtureProps> = {}): ViewFixtureProps {
	return {
		editor,
		captureContext: () => {},
		...overrides,
	};
}

describe('BlockNoteView', () => {
	it('mounts the editor, provides context, applies view props, and cleans up', () => {
		const double = createEditorDouble();
		const onChange = vi.fn();
		const onSelectionChange = vi.fn();
		const captureContext = vi.fn();
		const ref = { current: null as HTMLDivElement | null };
		const mounted = mount(
			ViewFixture,
			viewProps(double.editor, {
				captureContext,
				class: 'consumer-view',
				editable: false,
				onChange,
				onSelectionChange,
				ref,
				theme: 'dark',
			}),
		);
		flushEffects();

		const container = mounted.find('.bn-container');
		const editorHost = mounted.find('[data-blocknote-editor]');
		expect(container.classList.contains('consumer-view')).toBe(true);
		expect(container.matches('.bn-root.dark')).toBe(true);
		expect(container.getAttribute('data-color-scheme')).toBe('dark');
		expect(ref.current).toBe(container);
		expect(double.editor.mount).toHaveBeenCalledWith(editorHost);
		expect(double.editor.isEditable).toBe(false);
		expect(captureContext).toHaveBeenCalledWith(double.editor);
		expect(mounted.find('[data-view-child]')).toBeTruthy();

		double.emitChange();
		double.emitSelection();
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onSelectionChange).toHaveBeenCalledTimes(1);

		mounted.unmount();
		flushEffects();
		expect(double.editor.unmount).toHaveBeenCalledTimes(1);
		expect(double.removeChange).toHaveBeenCalledTimes(1);
		expect(double.removeSelection).toHaveBeenCalledTimes(1);
		expect(ref.current).toBeNull();
		double.emitChange();
		double.emitSelection();
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onSelectionChange).toHaveBeenCalledTimes(1);
	});

	it('switches core theme selectors without leaving the previous scheme behind', () => {
		const editor = BlockNoteEditor.create();
		const mounted = mount(ViewFixture, viewProps(editor, { theme: 'dark' }));
		flushEffects();

		expect(editor.domElement?.closest('.dark.bn-root')).toBe(mounted.find('.bn-container'));
		mounted.update(ViewFixture, viewProps(editor, { theme: 'light' }));
		flushEffects();
		expect(editor.domElement?.closest('.light.bn-root')).toBe(mounted.find('.bn-container'));
		expect(editor.domElement?.closest('.dark')).toBeNull();

		mounted.unmount();
	});

	it('replaces and removes event subscriptions when callbacks change', () => {
		const double = createEditorDouble();
		const firstChange = vi.fn();
		const firstSelection = vi.fn();
		const nextChange = vi.fn();
		const nextSelection = vi.fn();
		const mounted = mount(
			ViewFixture,
			viewProps(double.editor, {
				onChange: firstChange,
				onSelectionChange: firstSelection,
			}),
		);
		flushEffects();
		double.emitChange();
		double.emitSelection();

		mounted.update(
			ViewFixture,
			viewProps(double.editor, {
				onChange: nextChange,
				onSelectionChange: nextSelection,
			}),
		);
		flushEffects();
		double.emitChange();
		double.emitSelection();
		expect(firstChange).toHaveBeenCalledTimes(1);
		expect(firstSelection).toHaveBeenCalledTimes(1);
		expect(nextChange).toHaveBeenCalledTimes(1);
		expect(nextSelection).toHaveBeenCalledTimes(1);

		mounted.update(ViewFixture, viewProps(double.editor));
		flushEffects();
		double.emitChange();
		double.emitSelection();
		expect(nextChange).toHaveBeenCalledTimes(1);
		expect(nextSelection).toHaveBeenCalledTimes(1);
		mounted.unmount();
	});

	it('follows system color changes unless an explicit theme is set', () => {
		const listeners = new Set<() => void>();
		const media = {
			matches: true,
			addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
			removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
		};
		vi.stubGlobal('matchMedia', () => media);
		const double = createEditorDouble();
		const mounted = mount(ViewFixture, viewProps(double.editor));
		try {
			flushEffects();
			expect(mounted.find('.bn-container').matches('.bn-root.dark')).toBe(true);
			media.matches = false;
			listeners.forEach((listener) => listener());
			flushEffects();
			expect(mounted.find('.bn-container').matches('.bn-root.light')).toBe(true);

			mounted.update(ViewFixture, viewProps(double.editor, { theme: 'dark' }));
			flushEffects();
			expect(mounted.find('.bn-container').matches('.bn-root.dark')).toBe(true);
			expect(listeners.size).toBe(0);

			mounted.update(ViewFixture, viewProps(double.editor));
			flushEffects();
			expect(mounted.find('.bn-container').matches('.bn-root.light')).toBe(true);
		} finally {
			mounted.unmount();
			flushEffects();
			vi.unstubAllGlobals();
		}
		expect(listeners.size).toBe(0);
	});

	it('detaches a replaced core editor and can remount the current editor', () => {
		const first = BlockNoteEditor.create();
		const second = BlockNoteEditor.create();
		const captureContext = vi.fn();
		const mounted = mount(ViewFixture, viewProps(first, { editable: false }));
		flushEffects();
		expect(first.domElement?.getAttribute('contenteditable')).toBe('false');

		mounted.update(ViewFixture, viewProps(second, { captureContext }));
		flushEffects();
		expect(first.domElement).toBeUndefined();
		expect(mounted.find('[data-blocknote-editor]').contains(second.domElement!)).toBe(true);
		expect(captureContext).toHaveBeenLastCalledWith(second);

		mounted.update(ViewFixture, viewProps(second, { renderEditor: false }));
		flushEffects();
		expect(second.domElement).toBeUndefined();
		expect(mounted.container.querySelector('[data-blocknote-editor]')).toBeNull();

		mounted.update(ViewFixture, viewProps(second));
		flushEffects();
		expect(mounted.find('[data-blocknote-editor]').contains(second.domElement!)).toBe(true);
		mounted.unmount();
		flushEffects();
		expect(second.domElement).toBeUndefined();
	});

	it('can provide context and children without mounting the editor element', () => {
		const double = createEditorDouble();
		const captureContext = vi.fn();
		const mounted = mount(
			ViewFixture,
			viewProps(double.editor, { captureContext, renderEditor: false }),
		);
		flushEffects();

		expect(mounted.container.querySelector('[data-blocknote-editor]')).toBeNull();
		expect(captureContext).toHaveBeenCalledWith(double.editor);
		expect(mounted.find('[data-view-child]')).toBeTruthy();
		expect(double.editor.mount).not.toHaveBeenCalled();

		mounted.unmount();
	});

	it('mounts a real @blocknote/core editor into the Octane host', () => {
		const editor = BlockNoteEditor.create();
		const mounted = mount(ViewFixture, viewProps(editor));
		flushEffects();

		const host = mounted.find('[data-blocknote-editor]');
		expect(editor.domElement).toBeInstanceOf(HTMLDivElement);
		expect(host.contains(editor.domElement!)).toBe(true);
		expect(editor.domElement?.getAttribute('contenteditable')).toBe('true');
		expect(editor.domElement?.getAttribute('tabindex')).toBe('0');

		mounted.update(ViewFixture, viewProps(editor, { editable: false }));
		flushEffects();
		expect(editor.isEditable).toBe(false);
		expect(editor.domElement?.getAttribute('contenteditable')).toBe('false');

		mounted.update(ViewFixture, viewProps(editor, { editable: true }));
		flushEffects();
		expect(editor.isEditable).toBe(true);
		expect(editor.domElement?.getAttribute('contenteditable')).toBe('true');
		expect(editor.domElement?.getAttribute('tabindex')).toBe('0');

		mounted.unmount();
		flushEffects();
		expect(editor.domElement).toBeUndefined();
	});
});
