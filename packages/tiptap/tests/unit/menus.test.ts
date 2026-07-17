import { Editor } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import { flushSync } from 'octane';
import { describe, expect, it, vi } from 'vitest';

import { AutoKeyMenuPair, MenuHarness } from '../_fixtures/menus.tsrx';
import { flushEffects, mount } from '../_helpers';

const extensions = [StarterKit];
const neverShow = () => false;

function settle(): void {
	flushEffects();
	flushSync(() => {});
	flushEffects();
	flushSync(() => {});
	flushEffects();
}

describe('@octanejs/tiptap menus', () => {
	it('registers real menu plugins and syncs the detached menu element', () => {
		const editor = new Editor({ extensions, content: '<p></p>' });
		const bubblePluginKey = new PluginKey('octaneBubbleMenu');
		const floatingPluginKey = new PluginKey('octaneFloatingMenu');
		const menuClicks: Array<{
			event: Event;
			currentTarget: EventTarget | null;
			target: EventTarget | null;
		}> = [];
		const actionClick = vi.fn();
		const stoppedActionClick = vi.fn((event: Event) => event.stopPropagation());
		const initialBubbleDestroy = vi.fn();
		const updatedBubbleDestroy = vi.fn();
		const bubbleRefs: Array<HTMLDivElement | null> = [];
		const floatingRefs: Array<HTMLDivElement | null> = [];
		const result = mount(MenuHarness as any, {
			editor,
			showBubble: true,
			showFloating: true,
			shouldShow: neverShow,
			bubblePluginKey,
			floatingPluginKey,
			bubbleOptions: { onDestroy: initialBubbleDestroy },
			menuClass: ['bubble', { active: true }],
			menuClassName: 'controls',
			version: 'one',
			ariaLabel: 'Formatting controls',
			style: { marginTop: 8, position: 'relative', zIndex: 9 },
			tabIndex: 3,
			label: 'Bold',
			onActionClick: actionClick,
			onStoppedActionClick: stoppedActionClick,
			onMenuClick: (event: Event) => {
				menuClicks.push({
					event,
					currentTarget: event.currentTarget,
					target: event.target,
				});
			},
			bubbleRef: (element: HTMLDivElement | null) => bubbleRefs.push(element),
			floatingRef: (element: HTMLDivElement | null) => floatingRefs.push(element),
		});
		settle();

		const bubble = bubbleRefs.at(-1);
		const floating = floatingRefs.at(-1);
		// Registering the sibling plugin reconfigures ProseMirror and may rebuild
		// the first plugin view. Dynamic option updates must not trigger another
		// rebuild, and the final live view must observe the updated callback.
		const initialBubbleDestroyCount = initialBubbleDestroy.mock.calls.length;
		expect(bubble).toBeInstanceOf(HTMLDivElement);
		expect(floating).toBeInstanceOf(HTMLDivElement);
		expect(bubblePluginKey.get(editor.state)).toBeDefined();
		expect(floatingPluginKey.get(editor.state)).toBeDefined();
		const registeredBubblePlugin = bubblePluginKey.get(editor.state);
		expect(bubble?.className).toBe('bubble active controls');
		expect(bubble?.dataset.version).toBe('one');
		expect(bubble?.getAttribute('aria-label')).toBe('Formatting controls');
		expect(bubble?.style.marginTop).toBe('8px');
		expect(bubble?.style.zIndex).toBe('9');
		// Position belongs to the real TipTap plugin and is not overwritten by host props.
		expect(bubble?.style.position).toBe('absolute');
		expect(bubble?.querySelector('[data-menu-action="bubble"]')?.textContent).toBe('Bold');
		expect(floating?.querySelector('[data-floating-content]')?.textContent).toBe('floating');
		expect(updatedBubbleDestroy).not.toHaveBeenCalled();

		const action = bubble?.querySelector<HTMLButtonElement>('[data-menu-action="bubble"]');
		action?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(actionClick).toHaveBeenCalledTimes(1);
		expect(menuClicks).toHaveLength(1);
		expect(menuClicks[0].event).toBeInstanceOf(MouseEvent);
		expect(menuClicks[0].currentTarget).toBe(bubble);
		expect(menuClicks[0].target).toBe(action);
		expect('nativeEvent' in menuClicks[0].event).toBe(false);
		bubble
			?.querySelector('[data-menu-action="stop"]')
			?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(stoppedActionClick).toHaveBeenCalledTimes(1);
		expect(menuClicks).toHaveLength(1);

		result.update(MenuHarness as any, {
			editor,
			showBubble: true,
			showFloating: true,
			shouldShow: neverShow,
			bubblePluginKey,
			floatingPluginKey,
			bubbleOptions: { onDestroy: updatedBubbleDestroy },
			menuClass: ['updated'],
			menuClassName: null,
			version: null,
			ariaLabel: null,
			style: { marginTop: 16, zIndex: 10 },
			tabIndex: undefined,
			label: 'Italic',
			onActionClick: actionClick,
			onStoppedActionClick: stoppedActionClick,
			onMenuClick: undefined,
			bubbleRef: (element: HTMLDivElement | null) => bubbleRefs.push(element),
			floatingRef: (element: HTMLDivElement | null) => floatingRefs.push(element),
		});
		settle();

		expect(bubble?.className).toBe('updated');
		expect(bubble?.hasAttribute('data-version')).toBe(false);
		expect(bubble?.hasAttribute('aria-label')).toBe(false);
		expect(bubble?.style.marginTop).toBe('16px');
		expect(bubble?.style.zIndex).toBe('10');
		expect(bubble?.style.position).toBe('absolute');
		expect(bubble?.querySelector('[data-menu-action="bubble"]')?.textContent).toBe('Italic');
		expect(bubblePluginKey.get(editor.state)).toBe(registeredBubblePlugin);
		expect(initialBubbleDestroy).toHaveBeenCalledTimes(initialBubbleDestroyCount);
		expect(updatedBubbleDestroy).not.toHaveBeenCalled();
		bubble
			?.querySelector('[data-menu-action="bubble"]')
			?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(actionClick).toHaveBeenCalledTimes(2);
		expect(menuClicks).toHaveLength(1);

		result.unmount();
		settle();
		expect(bubblePluginKey.get(editor.state)).toBeUndefined();
		expect(floatingPluginKey.get(editor.state)).toBeUndefined();
		expect(bubbleRefs.at(-1)).toBeNull();
		expect(floatingRefs.at(-1)).toBeNull();
		expect(initialBubbleDestroy).toHaveBeenCalledTimes(initialBubbleDestroyCount);
		expect(updatedBubbleDestroy).toHaveBeenCalledTimes(1);
		editor.destroy();
	});

	it('gives sibling menus independent automatic plugin keys', () => {
		const editor = new Editor({ extensions, content: '<p></p>' });
		let first: HTMLDivElement | null = null;
		let second: HTMLDivElement | null = null;
		const originalPluginCount = editor.state.plugins.length;
		const result = mount(AutoKeyMenuPair as any, {
			editor,
			shouldShow: neverShow,
			firstRef: (element: HTMLDivElement | null) => {
				first = element;
			},
			secondRef: (element: HTMLDivElement | null) => {
				second = element;
			},
		});
		settle();

		expect(first).toBeInstanceOf(HTMLDivElement);
		expect(second).toBeInstanceOf(HTMLDivElement);
		expect(first).not.toBe(second);
		expect(editor.state.plugins).toHaveLength(originalPluginCount + 2);

		result.unmount();
		settle();
		expect(editor.state.plugins).toHaveLength(originalPluginCount);
		editor.destroy();
	});
});
