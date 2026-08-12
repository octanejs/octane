/**
 * Adapted from packages/tiptap/upstream/src/menus/BubbleMenu.spec.ts.
 */
import { render } from '@octanejs/testing-library';
import { createElement, Fragment } from 'octane';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BubbleMenu } from '@octanejs/tiptap/menus';

const { bubbleMenuPluginMock } = vi.hoisted(function () {
	return {
		bubbleMenuPluginMock: vi.fn(function () {
			return { key: 'bubble-menu-plugin' };
		}),
	};
});

vi.mock('@tiptap/extension-bubble-menu', function () {
	return {
		BubbleMenuPlugin: bubbleMenuPluginMock,
	};
});

function createEditor() {
	const tr = {
		setMeta: vi.fn(function () {
			return tr;
		}),
	};

	return {
		isDestroyed: false,
		registerPlugin: vi.fn(),
		unregisterPlugin: vi.fn(),
		view: {
			dispatch: vi.fn(),
		},
		state: {
			tr,
		},
	};
}

describe('BubbleMenu', function () {
	beforeEach(function () {
		bubbleMenuPluginMock.mockClear();
	});

	afterEach(function () {
		document.body.innerHTML = '';
	});

	// Per upstream/src/menus/BubbleMenu.spec.ts:42.
	it('applies html props to the actual menu element', function () {
		const editor = createEditor();
		const ref = { current: null as HTMLDivElement | null };
		const handleClick = vi.fn();
		let lastEvent: {
			event: Event;
			currentTarget: EventTarget | null;
			target: EventTarget | null;
		} | null = null;
		const handleClickCapture = vi.fn();
		const handleDoubleClick = vi.fn();
		const initialProps = {
			editor: editor as never,
			className: 'bubble-menu',
			'data-testid': 'menu-element',
			'aria-label': 'Bubble menu',
			style: { zIndex: 9999, marginTop: 8, position: 'relative' },
			onClick(event: Event) {
				lastEvent = {
					event,
					currentTarget: event.currentTarget,
					target: event.target,
				};
				handleClick();
			},
			onClickCapture: handleClickCapture,
			onDoubleClick: handleDoubleClick,
			dangerouslySetInnerHTML: { __html: 'ignored' },
			pluginKey: 'bubbleMenu',
			tabIndex: 3,
			ref,
			children: createElement('button', { type: 'button' }, 'Menu action'),
		};
		const updatedProps = {
			editor: editor as never,
			className: 'bubble-menu-updated',
			style: { zIndex: 1000, marginTop: 16, position: 'static' },
			onClick: undefined,
			onClickCapture: undefined,
			onDoubleClick: undefined,
			pluginKey: 'bubbleMenu',
			tabIndex: undefined,
			ref,
			children: createElement('button', { type: 'button' }, 'Updated action'),
		};

		const { rerender, unmount } = render(createElement(BubbleMenu as never, initialProps));

		expect(editor.registerPlugin).toHaveBeenCalledTimes(1);
		expect(bubbleMenuPluginMock).toHaveBeenCalledTimes(1);

		const [{ element }] = bubbleMenuPluginMock.mock.calls[0] as unknown as [
			{ element: HTMLDivElement },
		];

		expect(element).toBeInstanceOf(HTMLDivElement);
		expect(element).toBe(ref.current);
		expect(element.className).toBe('bubble-menu');
		expect(element.getAttribute('data-testid')).toBe('menu-element');
		expect(element.getAttribute('aria-label')).toBe('Bubble menu');
		expect(element.tabIndex).toBe(3);
		expect(element.style.zIndex).toBe('9999');
		expect(element.style.marginTop).toBe('8px');
		expect(element.style.position).toBe('absolute');
		expect(element.getAttribute('dangerouslySetInnerHTML')).toBeNull();

		element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		element.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		expect(handleClick).toHaveBeenCalledTimes(2);
		expect(handleDoubleClick).toHaveBeenCalledTimes(1);
		expect(handleClickCapture).toHaveBeenCalledTimes(2);
		// OCTANE DIVERGENCE[tiptap-native-menu-events][runtime:6b2bf62b801a2b07]
		// Upstream asserts a React synthetic event with .nativeEvent/.persist.
		expect(lastEvent?.event).toBeInstanceOf(MouseEvent);
		expect(lastEvent?.currentTarget).toBe(element);
		expect(lastEvent?.target).toBeInstanceOf(Element);
		expect('nativeEvent' in (lastEvent?.event as object)).toBe(false);
		expect(element.textContent).toContain('Menu action');

		rerender(createElement(BubbleMenu as never, updatedProps));

		expect(element.className).toBe('bubble-menu-updated');
		expect(element.getAttribute('data-testid')).toBeNull();
		expect(element.getAttribute('aria-label')).toBeNull();
		expect(element.tabIndex).toBe(-1);
		expect(element.style.zIndex).toBe('1000');
		expect(element.style.marginTop).toBe('16px');
		expect(element.style.position).toBe('absolute');

		element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		element.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		expect(handleClick).toHaveBeenCalledTimes(2);
		expect(handleDoubleClick).toHaveBeenCalledTimes(1);
		expect(handleClickCapture).toHaveBeenCalledTimes(2);
		expect(element.textContent).toContain('Updated action');

		unmount();

		expect(editor.unregisterPlugin).toHaveBeenCalledWith('bubbleMenu');
	});

	// Per upstream/src/menus/BubbleMenu.spec.ts:137.
	it('creates unique plugin keys when none are provided', function () {
		const editor = createEditor();
		const shouldShowA = vi.fn(function () {
			return true;
		});
		const shouldShowB = vi.fn(function () {
			return false;
		});

		const { unmount } = render(
			createElement(
				Fragment,
				null,
				createElement(BubbleMenu as never, {
					editor: editor as never,
					shouldShow: shouldShowA,
					children: createElement('button', { type: 'button' }, 'First'),
				}),
				createElement(BubbleMenu as never, {
					editor: editor as never,
					shouldShow: shouldShowB,
					children: createElement('button', { type: 'button' }, 'Second'),
				}),
			),
		);

		expect(bubbleMenuPluginMock).toHaveBeenCalledTimes(2);

		const pluginCalls = bubbleMenuPluginMock.mock.calls as unknown as Array<
			[{ pluginKey: unknown }]
		>;
		const firstPluginKey = pluginCalls[0][0].pluginKey;
		const secondPluginKey = pluginCalls[1][0].pluginKey;

		expect(firstPluginKey).toBeDefined();
		expect(secondPluginKey).toBeDefined();
		expect(firstPluginKey).not.toBe(secondPluginKey);

		unmount();

		const unregisterCalls = editor.unregisterPlugin.mock.calls as unknown as Array<[unknown]>;

		expect(
			unregisterCalls.some(function (call) {
				return call[0] === firstPluginKey;
			}),
		).toBe(true);
		expect(
			unregisterCalls.some(function (call) {
				return call[0] === secondPluginKey;
			}),
		).toBe(true);
	});
});
