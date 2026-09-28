import { afterEach, describe, expect, onTestFinished, test, vi } from 'vitest';
import { FocusManagerExtension } from '@lexical/a11y';
import type { LexicalEditor } from 'lexical';
import { flushEffects, mount } from '../_helpers';
import { FocusManagerFixture } from '../_fixtures/a11y-hooks.tsrx';

function dispatchKey(target: HTMLElement, init: KeyboardEventInit): KeyboardEvent {
	const event = new KeyboardEvent('keydown', {
		bubbles: true,
		cancelable: true,
		...init,
	});
	target.dispatchEvent(event);
	return event;
}

// Ported from @lexical/react/src/__tests__/unit/useLexicalFocusManagerRef.test.tsx (0.51.0).
// Upstream mounts the harness under LexicalExtensionComposer, which
// @octanejs/lexical does not port; the fixture builds the editor with
// buildEditorFromExtensions and provides it through LexicalComposerContext.
// Upstream's `onReady` spy is dropped: it was never asserted on. The harness
// toolbar also carries an extra `[data-item]` span (tabindex -1, so the default
// selector ignores it) for the Octane-specific option-change case below.
describe('useLexicalFocusManagerRef', () => {
	let r: ReturnType<typeof mount> | null = null;
	let editor: LexicalEditor | null = null;

	afterEach(() => {
		r?.unmount();
		r = null;
		editor = null;
	});

	function render(props: Record<string, unknown> = {}): void {
		r = mount(FocusManagerFixture as any, {
			extension: FocusManagerExtension,
			onEditor: (e: LexicalEditor) => (editor = e),
			...props,
		});
		flushEffects();
	}

	function update(props: Record<string, unknown>): void {
		r!.update(FocusManagerFixture as any, {
			extension: FocusManagerExtension,
			onEditor: (e: LexicalEditor) => (editor = e),
			...props,
		});
		flushEffects();
	}

	function byId(id: string): HTMLElement {
		const el = r!.container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
		if (el === null) {
			throw new Error(`Missing ${id}`);
		}
		return el;
	}

	test('Alt+F10 inside the editor focuses the first toolbar item', () => {
		render();
		const editorRoot = byId('editor-root');
		expect(editor!.getRootElement()).toBe(editorRoot);
		editorRoot.focus();
		dispatchKey(editorRoot, { altKey: true, key: 'F10' });
		expect(document.activeElement).toBe(byId('btn-0'));
	});

	test('Alt+F10 without Alt modifier is a no-op', () => {
		render();
		const editorRoot = byId('editor-root');
		editorRoot.focus();
		dispatchKey(editorRoot, { key: 'F10' });
		expect(document.activeElement).toBe(editorRoot);
	});

	test('Escape inside the toolbar returns focus to the editor', () => {
		render();
		const toolbarBtn = byId('btn-0');
		toolbarBtn.focus();
		expect(document.activeElement).toBe(toolbarBtn);

		const windowSpy = vi.fn();
		window.addEventListener('keydown', windowSpy);
		onTestFinished(() => window.removeEventListener('keydown', windowSpy));
		dispatchKey(toolbarBtn, { key: 'Escape' });
		expect(document.activeElement).toBe(byId('editor-root'));
		expect(windowSpy).not.toHaveBeenCalled();
	});

	// Octane-specific: the callback ref registers the toolbar when it attaches
	// and releases the registration when it detaches, then registers the fresh
	// node when the toolbar mounts again.
	test('callback ref registers on attach and unregisters on detach', () => {
		render();
		const editorRoot = byId('editor-root');
		editorRoot.focus();
		const handled = dispatchKey(editorRoot, { altKey: true, key: 'F10' });
		expect(handled.defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(byId('btn-0'));

		update({ showToolbar: false });
		expect(r!.container.querySelector('[data-testid="toolbar"]')).toBeNull();
		editorRoot.focus();
		// A leaked registration would still claim the KEY_DOWN_COMMAND (and
		// preventDefault) for the detached toolbar.
		const unhandled = dispatchKey(editorRoot, { altKey: true, key: 'F10' });
		expect(unhandled.defaultPrevented).toBe(false);
		expect(document.activeElement).toBe(editorRoot);

		update({ showToolbar: true });
		const freshButton = byId('btn-0');
		editorRoot.focus();
		dispatchKey(editorRoot, { altKey: true, key: 'F10' });
		expect(document.activeElement).toBe(freshButton);
	});

	// Octane-specific: changing `toolbarItemSelector` on a still-mounted toolbar
	// changes the callback-ref identity, which must release the old registration
	// before registering with the new options (the registry is ref-counted per
	// element, so a leaked holder would pin the old options).
	test('re-registers with new options when toolbarItemSelector changes', () => {
		render();
		const toolbarBefore = byId('toolbar');
		const editorRoot = byId('editor-root');
		editorRoot.focus();
		dispatchKey(editorRoot, { altKey: true, key: 'F10' });
		expect(document.activeElement).toBe(byId('btn-0'));

		update({ options: { toolbarItemSelector: '[data-item]' } });
		expect(byId('toolbar')).toBe(toolbarBefore); // same DOM node, not remounted
		editorRoot.focus();
		dispatchKey(editorRoot, { altKey: true, key: 'F10' });
		expect(document.activeElement).toBe(byId('item'));
	});
});
