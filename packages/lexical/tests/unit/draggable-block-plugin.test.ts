import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { LexicalEditor } from 'lexical';
import { mount, flushEffects, nextPaint } from '../_helpers';
import { DraggableBlockEditor, MENU_CLASS } from '../_fixtures/draggable-block-editor.tsrx';

type MountResult = ReturnType<typeof mount>;

// Ported from @lexical/react/src/__tests__/unit/LexicalDraggableBlockPlugin.test.tsx (0.51.0).
// Both upstream cases are ported ('follows setEditable' and 'renders no drag
// handle for an editor that mounts read-only'). The drag-end focus case below
// is Octane-only: it covers the 0.51.0 onDragEnd change that restores focus to
// the root on every engine (it was Firefox-only before).

async function settle() {
	for (let i = 0; i < 4; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await nextPaint();
		flushEffects();
	}
}

describe('DraggableBlockPlugin_EXPERIMENTAL', () => {
	let host: HTMLDivElement;
	let anchorElem: HTMLDivElement;
	let mounted: MountResult | null = null;

	beforeEach(() => {
		// anchorElem needs a parent: the plugin listens for mouse moves on it.
		host = document.createElement('div');
		anchorElem = document.createElement('div');
		host.appendChild(anchorElem);
		document.body.appendChild(host);
	});

	afterEach(() => {
		if (mounted) {
			mounted.unmount();
			mounted = null;
		}
		host.remove();
	});

	function hasDragHandle(): boolean {
		return anchorElem.querySelector(`.${MENU_CLASS}`) !== null;
	}

	async function render(editable?: boolean): Promise<LexicalEditor> {
		const editorRef: { current: LexicalEditor | null } = { current: null };
		mounted = mount(DraggableBlockEditor as any, { anchorElem, editorRef, editable });
		await settle();
		expect(editorRef.current).toBeTruthy();
		return editorRef.current!;
	}

	it('follows setEditable', async () => {
		const editor = await render();
		expect(hasDragHandle()).toBe(true);

		editor.setEditable(false);
		await settle();
		expect(hasDragHandle()).toBe(false);

		editor.setEditable(true);
		await settle();
		expect(hasDragHandle()).toBe(true);
	});

	it('renders no drag handle for an editor that mounts read-only', async () => {
		const editor = await render(false);
		expect(hasDragHandle()).toBe(false);

		editor.setEditable(true);
		await settle();
		expect(hasDragHandle()).toBe(true);
	});

	it('restores focus to the root element on drag end (Octane)', async () => {
		const editor = await render();
		const rootElement = editor.getRootElement()!;
		expect(rootElement).toBeTruthy();

		const outside = document.createElement('button');
		document.body.appendChild(outside);
		try {
			outside.focus();
			await settle();
			// Control: nothing but the drag end moves focus back into the editor.
			expect(document.activeElement).toBe(outside);

			// The draggable wrapper the plugin portals into anchorElem.
			const draggable = anchorElem.querySelector('[draggable="true"]')!;
			expect(draggable).toBeTruthy();
			draggable.dispatchEvent(new Event('dragend', { bubbles: true }));
			await settle();

			expect(document.activeElement).toBe(rootElement);
		} finally {
			outside.remove();
		}
	});
});
