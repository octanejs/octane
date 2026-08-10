/**
 * Adapted from packages/tiptap/upstream/src/menus/FloatingMenu.spec.ts.
 */
import { render } from '@octanejs/testing-library';
import { createElement, Fragment } from 'octane';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FloatingMenu } from '@octanejs/tiptap/menus';

const { floatingMenuPluginMock } = vi.hoisted(function () {
	return {
		floatingMenuPluginMock: vi.fn(function () {
			return { key: 'floating-menu-plugin' };
		}),
	};
});

vi.mock('@tiptap/extension-floating-menu', function () {
	return {
		FloatingMenuPlugin: floatingMenuPluginMock,
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

describe('FloatingMenu', function () {
	beforeEach(function () {
		floatingMenuPluginMock.mockClear();
	});

	afterEach(function () {
		document.body.innerHTML = '';
	});

	// Per upstream/src/menus/FloatingMenu.spec.ts:42.
	it('applies html props to the actual menu element', function () {
		const editor = createEditor();
		const ref = { current: null as HTMLDivElement | null };
		const handleClick = vi.fn();
		const handleClickCapture = vi.fn();
		const handleDoubleClick = vi.fn();
		const initialProps = {
			editor: editor as never,
			className: 'floating-menu',
			'data-testid': 'floating-element',
			'aria-label': 'Floating menu',
			style: { zIndex: 8888, marginTop: 12, position: 'relative' },
			onClick: handleClick,
			onClickCapture: handleClickCapture,
			onDoubleClick: handleDoubleClick,
			pluginKey: 'floatingMenu',
			tabIndex: 5,
			ref,
			children: createElement('button', { type: 'button' }, 'Floating action'),
		};
		const updatedProps = {
			editor: editor as never,
			className: 'floating-menu-updated',
			style: { zIndex: 7777, marginTop: 20, position: 'static' },
			onClick: undefined,
			onClickCapture: undefined,
			onDoubleClick: undefined,
			pluginKey: 'floatingMenu',
			tabIndex: undefined,
			ref,
			children: createElement('button', { type: 'button' }, 'Updated floating action'),
		};

		const { rerender, unmount } = render(createElement(FloatingMenu as never, initialProps));

		expect(editor.registerPlugin).toHaveBeenCalledTimes(1);
		expect(floatingMenuPluginMock).toHaveBeenCalledTimes(1);

		const [{ element }] = floatingMenuPluginMock.mock.calls[0] as unknown as [
			{ element: HTMLDivElement },
		];

		expect(element).toBeInstanceOf(HTMLDivElement);
		expect(element).toBe(ref.current);
		expect(element.className).toBe('floating-menu');
		expect(element.getAttribute('data-testid')).toBe('floating-element');
		expect(element.getAttribute('aria-label')).toBe('Floating menu');
		expect(element.tabIndex).toBe(5);
		expect(element.style.zIndex).toBe('8888');
		expect(element.style.marginTop).toBe('12px');
		expect(element.style.position).toBe('absolute');

		element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		element.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		expect(handleClick).toHaveBeenCalledTimes(2);
		expect(handleDoubleClick).toHaveBeenCalledTimes(1);
		expect(handleClickCapture).toHaveBeenCalledTimes(2);
		expect(element.textContent).toContain('Floating action');

		rerender(createElement(FloatingMenu as never, updatedProps));

		expect(element.className).toBe('floating-menu-updated');
		expect(element.getAttribute('data-testid')).toBeNull();
		expect(element.getAttribute('aria-label')).toBeNull();
		expect(element.tabIndex).toBe(-1);
		expect(element.style.zIndex).toBe('7777');
		expect(element.style.marginTop).toBe('20px');
		expect(element.style.position).toBe('absolute');

		element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		element.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		expect(handleClick).toHaveBeenCalledTimes(2);
		expect(handleDoubleClick).toHaveBeenCalledTimes(1);
		expect(handleClickCapture).toHaveBeenCalledTimes(2);
		expect(element.textContent).toContain('Updated floating action');

		unmount();

		expect(editor.unregisterPlugin).toHaveBeenCalledWith('floatingMenu');
	});

	// Per upstream/src/menus/FloatingMenu.spec.ts:127.
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
				createElement(FloatingMenu as never, {
					editor: editor as never,
					shouldShow: shouldShowA,
					children: createElement('button', { type: 'button' }, 'First'),
				}),
				createElement(FloatingMenu as never, {
					editor: editor as never,
					shouldShow: shouldShowB,
					children: createElement('button', { type: 'button' }, 'Second'),
				}),
			),
		);

		expect(floatingMenuPluginMock).toHaveBeenCalledTimes(2);

		const pluginCalls = floatingMenuPluginMock.mock.calls as unknown as Array<
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
