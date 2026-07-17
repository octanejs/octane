import type { Editor } from '@tiptap/core';
import { type FloatingMenuPluginProps, FloatingMenuPlugin } from '@tiptap/extension-floating-menu';
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

export type FloatingMenuProps = Omit<
	Optional<FloatingMenuPluginProps, 'pluginKey'>,
	'element' | 'editor'
> & {
	editor: FloatingMenuPluginProps['editor'] | null;
	options?: FloatingMenuPluginProps['options'];
} & MenuElementProps;

const FLOATING_MENU_SLOT = Symbol.for('@octanejs/tiptap:menus:FloatingMenu');

function areFloatingMenuPluginPropsEqual(
	previous: Omit<FloatingMenuPluginProps, 'editor' | 'element'>,
	next: Omit<FloatingMenuPluginProps, 'editor' | 'element'>,
): boolean {
	return (
		previous.pluginKey === next.pluginKey &&
		previous.updateDelay === next.updateDelay &&
		previous.resizeDelay === next.resizeDelay &&
		previous.appendTo === next.appendTo &&
		previous.shouldShow === next.shouldShow &&
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

export function FloatingMenu(props: FloatingMenuProps): unknown {
	const {
		pluginKey,
		editor,
		updateDelay,
		resizeDelay,
		appendTo,
		shouldShow = null,
		options,
		children,
		ref,
		...restProps
	} = props;
	const [menuElement, setMenuElement] = useState<HTMLDivElement | null>(
		null,
		subSlot(FLOATING_MENU_SLOT, 'element'),
	);
	const resolvedPluginKeyRef = useRef<PluginKey | string | null>(
		null,
		subSlot(FLOATING_MENU_SLOT, 'plugin-key'),
	);
	const registrationRef = useRef(0, subSlot(FLOATING_MENU_SLOT, 'registration'));
	const [pluginInitialized, setPluginInitialized] = useState(
		false,
		subSlot(FLOATING_MENU_SLOT, 'initialized'),
	);
	const lastAppliedPluginPropsRef = useRef<Omit<
		FloatingMenuPluginProps,
		'editor' | 'element'
	> | null>(null, subSlot(FLOATING_MENU_SLOT, 'last-applied-plugin-props'));

	if (resolvedPluginKeyRef.current === null) {
		resolvedPluginKeyRef.current = getAutoPluginKey(pluginKey, 'floatingMenu');
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
		subSlot(FLOATING_MENU_SLOT, 'mount'),
	);

	useMenuElementProps(menuElement, restProps, subSlot(FLOATING_MENU_SLOT, 'element-props'));
	useMenuElementRef(menuElement, ref, subSlot(FLOATING_MENU_SLOT, 'element-ref'));

	const { editor: currentEditor } = useCurrentEditor();
	const pluginEditor: Editor | null = editor || currentEditor;
	const floatingMenuPluginProps: Omit<FloatingMenuPluginProps, 'editor' | 'element'> = {
		updateDelay,
		resizeDelay,
		appendTo,
		pluginKey: resolvedPluginKey,
		shouldShow,
		options,
	};
	const floatingMenuPluginPropsRef = useRef(
		floatingMenuPluginProps,
		subSlot(FLOATING_MENU_SLOT, 'plugin-props'),
	);
	floatingMenuPluginPropsRef.current = floatingMenuPluginProps;

	useEffect(
		() => {
			if (!menuElement || pluginEditor?.isDestroyed) {
				return;
			}

			if (!pluginEditor) {
				console.warn(
					'FloatingMenu component is not rendered inside of an editor component or does not have editor prop.',
				);
				return;
			}

			menuElement.style.visibility = 'hidden';
			menuElement.style.position = 'absolute';

			const registeredPluginProps = floatingMenuPluginPropsRef.current;
			const plugin = FloatingMenuPlugin({
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
		subSlot(FLOATING_MENU_SLOT, 'plugin'),
	);

	useEffect(
		() => {
			if (!pluginInitialized || !pluginEditor || pluginEditor.isDestroyed) {
				return;
			}

			const nextPluginProps = floatingMenuPluginPropsRef.current;
			const lastAppliedPluginProps = lastAppliedPluginPropsRef.current;

			if (
				lastAppliedPluginProps &&
				areFloatingMenuPluginPropsEqual(lastAppliedPluginProps, nextPluginProps)
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
			resolvedPluginKey,
		],
		subSlot(FLOATING_MENU_SLOT, 'options'),
	);

	return menuElement ? createPortal(children, menuElement) : null;
}
