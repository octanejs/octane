import type { MenuRef, MenuResolution } from './menuShared';

import { CAN_USE_DOM } from 'lexical';
import { useCallback, useEffect, useRef } from 'octane';

import { useLexicalComposerContext } from '../LexicalComposerContext';
import { resolveMenuParent, setContainerDivAttributes } from './menuShared';
import { useDynamicPositioning } from './useDynamicPositioning';
import { splitSlot, subSlot } from './internal';

// Ported from shared/LexicalMenu.tsx. Composes several base hooks + a nested hook
// (useDynamicPositioning); each gets a distinct sub-slot. `className`/`parent`/
// `shouldIncludePageYOffset` are optional, so the trailing slot is found via
// splitSlot (positional resolution would mistake it for an optional arg).
export function useMenuAnchorRef(...args: any[]): MenuRef {
	const [user, slot] = splitSlot(args);
	const resolution = user[0] as MenuResolution | null;
	const setResolution = user[1] as (r: MenuResolution | null) => void;
	const className = user[2] as string | undefined;
	const parent = user[3] as HTMLElement | undefined;
	const shouldIncludePageYOffset = user[4] !== undefined ? (user[4] as boolean) : true;

	const [editor] = useLexicalComposerContext();
	const resolvedParent = parent ?? resolveMenuParent(editor);
	const initialAnchorElement = CAN_USE_DOM ? document.createElement('div') : null;
	const anchorElementRef = useRef<HTMLElement | null>(
		initialAnchorElement,
		subSlot(slot, 'uma:ref'),
	);

	const positionMenu = useCallback(
		() => {
			if (anchorElementRef.current === null || resolvedParent === undefined) {
				return;
			}
			anchorElementRef.current.style.top = anchorElementRef.current.style.bottom;
			const rootElement = editor.getRootElement();
			const containerDiv = anchorElementRef.current;
			// octane portals leave a `<!--portal-->` marker as firstChild, so reach for
			// the first ELEMENT child (the rendered menu) to measure/position.
			const menuEle = containerDiv.firstElementChild as HTMLElement;
			if (rootElement !== null && resolution !== null) {
				const { left, top, width, height } = resolution.getRect();
				const anchorHeight = anchorElementRef.current.offsetHeight;
				containerDiv.style.top = `${
					top + anchorHeight + 3 + (shouldIncludePageYOffset ? window.pageYOffset : 0)
				}px`;
				containerDiv.style.left = `${left + window.pageXOffset}px`;
				containerDiv.style.height = `${height}px`;
				containerDiv.style.width = `${width}px`;
				if (menuEle !== null) {
					menuEle.style.top = `${top}`;
					const menuRect = menuEle.getBoundingClientRect();
					const menuHeight = menuRect.height;
					const menuWidth = menuRect.width;
					const rootElementRect = rootElement.getBoundingClientRect();
					if (left + menuWidth > rootElementRect.right) {
						containerDiv.style.left = `${rootElementRect.right - menuWidth + window.pageXOffset}px`;
					}
					if (
						(top + menuHeight > window.innerHeight || top + menuHeight > rootElementRect.bottom) &&
						top - rootElementRect.top > menuHeight + height
					) {
						containerDiv.style.top = `${
							top - menuHeight - height + (shouldIncludePageYOffset ? window.pageYOffset : 0)
						}px`;
					}
				}
				if (!containerDiv.isConnected) {
					setContainerDivAttributes(containerDiv, className);
					resolvedParent.append(containerDiv);
				}
				containerDiv.setAttribute('id', 'typeahead-menu');
				rootElement.setAttribute('aria-controls', 'typeahead-menu');
			}
		},
		[editor, resolution, shouldIncludePageYOffset, className, resolvedParent],
		subSlot(slot, 'uma:pos'),
	);

	useEffect(
		() => {
			const rootElement = editor.getRootElement();
			if (resolution !== null) {
				positionMenu();
			}
			return () => {
				if (rootElement !== null) {
					rootElement.removeAttribute('aria-controls');
				}
				const containerDiv = anchorElementRef.current;
				if (containerDiv !== null && containerDiv.isConnected) {
					containerDiv.remove();
					containerDiv.removeAttribute('id');
				}
			};
		},
		[editor, positionMenu, resolution],
		subSlot(slot, 'uma:eff'),
	);

	const onVisibilityChange = useCallback(
		(isInView: boolean) => {
			if (resolution !== null) {
				if (!isInView) {
					setResolution(null);
				}
			}
		},
		[resolution, setResolution],
		subSlot(slot, 'uma:vis'),
	);

	useDynamicPositioning(
		resolution,
		anchorElementRef.current,
		positionMenu,
		onVisibilityChange,
		subSlot(slot, 'uma:dyn'),
	);

	// Append the anchor container immediately (first render only).
	if (initialAnchorElement != null && initialAnchorElement === anchorElementRef.current) {
		setContainerDivAttributes(initialAnchorElement, className);
		if (resolvedParent != null) {
			resolvedParent.append(initialAnchorElement);
		}
	}

	return anchorElementRef;
}
