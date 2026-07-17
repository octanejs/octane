import { type BubbleMenuPluginProps, BubbleMenuPlugin } from '@tiptap/extension-bubble-menu';
import type { Editor } from '@tiptap/core';
import type { PluginKey } from '@tiptap/pm/state';
import { createPortal, useEffect, useLayoutEffect, useRef, useState } from 'octane';

import { useCurrentEditor } from '../Context';
import { subSlot } from '../internal';
import { getAutoPluginKey } from './getAutoPluginKey';
import {
	type MenuElementProps,
	useMenuElementProps,
	useMenuElementRef,
} from './useMenuElementProps';

type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;

export type BubbleMenuProps = Optional<
	Omit<Optional<BubbleMenuPluginProps, 'pluginKey'>, 'element'>,
	'editor'
> &
	MenuElementProps;

const BUBBLE_MENU_SLOT = Symbol.for('@octanejs/tiptap:menus:BubbleMenu');

function areBubbleMenuPluginPropsEqual(
	previous: Omit<BubbleMenuPluginProps, 'editor' | 'element'>,
	next: Omit<BubbleMenuPluginProps, 'editor' | 'element'>,
): boolean {
	return (
		previous.pluginKey === next.pluginKey &&
		previous.updateDelay === next.updateDelay &&
		previous.resizeDelay === next.resizeDelay &&
		previous.appendTo === next.appendTo &&
		previous.shouldShow === next.shouldShow &&
		previous.getReferencedVirtualElement === next.getReferencedVirtualElement &&
		previous.options === next.options
	);
}

function scheduleElementRemoval(
	element: HTMLDivElement,
	registrationRef: { current: number },
	registration: number,
): void {
	const remove = () => {
		if (registrationRef.current === registration && element.parentNode) {
			element.parentNode.removeChild(element);
		}
	};

	if (typeof window.requestAnimationFrame === 'function') {
		window.requestAnimationFrame(remove);
	} else {
		setTimeout(remove, 0);
	}
}

export function BubbleMenu(props: BubbleMenuProps): unknown {
	const {
		pluginKey,
		editor,
		updateDelay,
		resizeDelay,
		appendTo,
		shouldShow = null,
		getReferencedVirtualElement,
		options,
		children,
		ref,
		...restProps
	} = props;
	const [menuElement, setMenuElement] = useState<HTMLDivElement | null>(
		null,
		subSlot(BUBBLE_MENU_SLOT, 'element'),
	);
	const resolvedPluginKeyRef = useRef<PluginKey | string | null>(
		null,
		subSlot(BUBBLE_MENU_SLOT, 'plugin-key'),
	);
	const registrationRef = useRef(0, subSlot(BUBBLE_MENU_SLOT, 'registration'));
	const [pluginInitialized, setPluginInitialized] = useState(
		false,
		subSlot(BUBBLE_MENU_SLOT, 'initialized'),
	);
	const lastAppliedPluginPropsRef = useRef<Omit<
		BubbleMenuPluginProps,
		'editor' | 'element'
	> | null>(null, subSlot(BUBBLE_MENU_SLOT, 'last-applied-plugin-props'));

	if (resolvedPluginKeyRef.current === null) {
		resolvedPluginKeyRef.current = getAutoPluginKey(pluginKey, 'bubbleMenu');
	}
	const resolvedPluginKey = resolvedPluginKeyRef.current;

	useLayoutEffect(
		() => {
			if (typeof document === 'undefined') {
				return;
			}

			setMenuElement(document.createElement('div'));
		},
		[],
		subSlot(BUBBLE_MENU_SLOT, 'mount'),
	);

	useMenuElementProps(menuElement, restProps, subSlot(BUBBLE_MENU_SLOT, 'element-props'));
	useMenuElementRef(menuElement, ref, subSlot(BUBBLE_MENU_SLOT, 'element-ref'));

	const { editor: currentEditor } = useCurrentEditor();
	const pluginEditor: Editor | null = editor || currentEditor;
	const bubbleMenuPluginProps: Omit<BubbleMenuPluginProps, 'editor' | 'element'> = {
		updateDelay,
		resizeDelay,
		appendTo,
		pluginKey: resolvedPluginKey,
		shouldShow,
		getReferencedVirtualElement,
		options,
	};
	const bubbleMenuPluginPropsRef = useRef(
		bubbleMenuPluginProps,
		subSlot(BUBBLE_MENU_SLOT, 'plugin-props'),
	);
	bubbleMenuPluginPropsRef.current = bubbleMenuPluginProps;

	useEffect(
		() => {
			if (!menuElement || pluginEditor?.isDestroyed) {
				return;
			}

			if (!pluginEditor) {
				console.warn(
					'BubbleMenu component is not rendered inside of an editor component or does not have editor prop.',
				);
				return;
			}

			menuElement.style.visibility = 'hidden';
			menuElement.style.position = 'absolute';

			const registeredPluginProps = bubbleMenuPluginPropsRef.current;
			const plugin = BubbleMenuPlugin({
				...registeredPluginProps,
				editor: pluginEditor,
				element: menuElement,
			});
			lastAppliedPluginPropsRef.current = registeredPluginProps;
			pluginEditor.registerPlugin(plugin);

			const createdPluginKey = registeredPluginProps.pluginKey;
			const registration = registrationRef.current + 1;
			registrationRef.current = registration;
			setPluginInitialized(true);

			return () => {
				setPluginInitialized(false);
				lastAppliedPluginPropsRef.current = null;
				pluginEditor.unregisterPlugin(createdPluginKey);
				scheduleElementRemoval(menuElement, registrationRef, registration);
			};
		},
		[menuElement, pluginEditor],
		subSlot(BUBBLE_MENU_SLOT, 'plugin'),
	);

	useEffect(
		() => {
			if (!pluginInitialized || !pluginEditor || pluginEditor.isDestroyed) {
				return;
			}

			const nextPluginProps = bubbleMenuPluginPropsRef.current;
			const lastAppliedPluginProps = lastAppliedPluginPropsRef.current;

			if (
				lastAppliedPluginProps &&
				areBubbleMenuPluginPropsEqual(lastAppliedPluginProps, nextPluginProps)
			) {
				return;
			}

			pluginEditor.view.dispatch(
				pluginEditor.state.tr.setMeta(resolvedPluginKey, {
					type: 'updateOptions',
					options: nextPluginProps,
				}),
			);
			lastAppliedPluginPropsRef.current = nextPluginProps;
		},
		[
			pluginInitialized,
			pluginEditor,
			updateDelay,
			resizeDelay,
			shouldShow,
			options,
			appendTo,
			getReferencedVirtualElement,
			resolvedPluginKey,
		],
		subSlot(BUBBLE_MENU_SLOT, 'options'),
	);

	return menuElement ? createPortal(children, menuElement) : null;
}
