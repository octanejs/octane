// Ported from .base-ui/packages/react/src/context-menu/ (v1.6.0) — Phase 3f STAGE 4.
//
// A `ContextMenu` is a `Menu.Root` opened by right-click or long-press at the pointer, anchored to a
// synthetic zero-size rect at the cursor instead of to a trigger element. `ContextMenu.Root`
// provides the `ContextMenuRootContext` that `Menu` has been branching on since stage 1
// (`parent.type === 'context-menu'`): a modal focus manager, `mousedown`-grace-period outside-press
// dismissal, `fixed` positioning, `start` alignment, and the item `mouseup` guards that stop the
// gesture which OPENED the menu from immediately activating an item under the cursor.
//
// `ContextMenuRootContext` itself lives in `./utils/ContextMenuRootContext` — it landed as a
// context-only module in stage 1 so `Menu`'s parent-union branches could be written verbatim ahead
// of this component.
//
// Every part other than `Root` and `Trigger` is `Menu`'s own, re-exported through this namespace
// exactly as upstream's `context-menu/index.parts.ts` does.
//
// octane adaptations: `createElement`, not JSX; `forwardRef` → ref-as-prop; per-call-site `S('…')`
// slots with `subSlot`; native events, so `event.nativeEvent` collapses to `event`; upstream's
// `React.TouchEvent`/`React.MouseEvent` are the native types here.
import { createElement, useState, useRef, useEffect, useMemo, useId } from 'octane';

import { S, subSlot } from './internal';
import { Menu, MenuRootContext, useMenuRootContext } from './menu';
import type { MenuRootContextValue } from './menu';
import { ContextMenuRootContext, useContextMenuRootContext } from './utils/ContextMenuRootContext';
import type { ContextMenuRootContextValue } from './utils/ContextMenuRootContext';
import { useRenderElement } from './utils/useRenderElement';
import { useTimeout } from './utils/useTimeout';
import { addEventListener } from './utils/addEventListener';
import { ownerDocument } from './utils/owner';
import { contains } from './utils/contains';
import { getTarget, stopEvent } from './utils/composite/list-utils';
import { createChangeEventDetails, REASONS } from './utils/createChangeEventDetails';
import { pressableTriggerOpenStateMapping } from './utils/popupStateMapping';
import { findRootOwnerId } from './utils/findRootOwnerId';

const LONG_PRESS_DELAY = 500;

// --- Root ---------------------------------------------------------------------

/**
 * A component that creates a context menu activated by right clicking or long pressing.
 * Doesn't render its own HTML element.
 */
function ContextMenuRoot(props: any): any {
	const slot = S('ContextMenuRoot');
	const [anchor, setAnchor] = useState<ContextMenuRootContextValue['anchor']>(
		{
			getBoundingClientRect() {
				return DOMRect.fromRect({ width: 0, height: 0, x: 0, y: 0 });
			},
		},
		subSlot(slot, 'anchor'),
	);

	const backdropRef = useRef<HTMLDivElement | null>(null, subSlot(slot, 'backdrop'));
	const internalBackdropRef = useRef<HTMLDivElement | null>(null, subSlot(slot, 'ibackdrop'));
	const actionsRef = useRef<ContextMenuRootContextValue['actionsRef']['current']>(
		null,
		subSlot(slot, 'actions'),
	);
	const positionerRef = useRef<HTMLElement | null>(null, subSlot(slot, 'positioner'));
	const allowMouseUpTriggerRef = useRef(true, subSlot(slot, 'amut'));
	const initialCursorPointRef = useRef<{ x: number; y: number } | null>(
		null,
		subSlot(slot, 'cursor'),
	);
	// Raw `useId` (no `base-ui-` prefix), matching Base UI's `@base-ui/utils/useId`.
	const id = useId(subSlot(slot, 'id'));

	const contextValue: ContextMenuRootContextValue = useMemo(
		() => ({
			anchor,
			setAnchor,
			actionsRef,
			backdropRef,
			internalBackdropRef,
			positionerRef,
			allowMouseUpTriggerRef,
			initialCursorPointRef,
			rootId: id,
		}),
		[anchor, id],
		subSlot(slot, 'ctx'),
	);

	// The inner `MenuRootContext.Provider value={undefined}` is load-bearing, not defensive: it is
	// how `MenuRoot` tells "this Menu IS the context menu" apart from "this Menu is nested inside a
	// ContextMenu.Trigger" (the `contextMenuContext && !parentMenuRootContext` guard).
	return createElement(ContextMenuRootContext.Provider, {
		value: contextValue,
		children: createElement(MenuRootContext.Provider, {
			value: undefined,
			children: createElement(Menu.Root, props),
		}),
	});
}

// --- Trigger ------------------------------------------------------------------

/**
 * An area that opens the menu on right click or long press.
 * Renders a `<div>` element.
 */
function ContextMenuTrigger(componentProps: any): any {
	const slot = S('ContextMenuTrigger');
	const { render, className, style, ref: forwardedRef, ...elementProps } = componentProps;

	const {
		setAnchor,
		actionsRef,
		internalBackdropRef,
		backdropRef,
		positionerRef,
		allowMouseUpTriggerRef,
		initialCursorPointRef,
		rootId,
	} = useContextMenuRootContext(false);

	const { store } = useMenuRootContext() as MenuRootContextValue;
	const open = store.useState('open', subSlot(slot, 'open'));
	const disabled = store.useState('disabled', subSlot(slot, 'disabled'));

	const triggerRef = useRef<HTMLDivElement | null>(null, subSlot(slot, 'trigger'));
	const touchPositionRef = useRef<{ x: number; y: number } | null>(null, subSlot(slot, 'touch'));
	const longPressTimeout = useTimeout(subSlot(slot, 'lp'));
	const allowMouseUpTimeout = useTimeout(subSlot(slot, 'amu'));
	const allowMouseUpRef = useRef(false, subSlot(slot, 'amur'));

	function handleLongPress(x: number, y: number, event: MouseEvent | TouchEvent) {
		const isTouchEvent = event.type.startsWith('touch');

		initialCursorPointRef.current = { x, y };

		setAnchor({
			getBoundingClientRect() {
				return DOMRect.fromRect({
					width: isTouchEvent ? 10 : 0,
					height: isTouchEvent ? 10 : 0,
					x,
					y,
				});
			},
		});

		allowMouseUpRef.current = false;
		actionsRef.current?.setOpen(true, createChangeEventDetails(REASONS.triggerPress, event));

		allowMouseUpTimeout.start(LONG_PRESS_DELAY, () => {
			allowMouseUpRef.current = true;
		});
	}

	function handleContextMenu(event: MouseEvent) {
		if (disabled) {
			return;
		}
		allowMouseUpTriggerRef.current = true;
		stopEvent(event);
		// octane dispatches NATIVE events, so upstream's `event.nativeEvent` collapses to `event`.
		handleLongPress(event.clientX, event.clientY, event);
		const doc = ownerDocument(triggerRef.current);

		addEventListener(
			doc,
			'mouseup',
			(mouseEvent: Event) => {
				allowMouseUpTriggerRef.current = false;

				if (!allowMouseUpRef.current) {
					return;
				}

				allowMouseUpTimeout.clear();
				allowMouseUpRef.current = false;

				const mouseUpTarget = getTarget(mouseEvent) as Element | null;

				if (contains(positionerRef.current, mouseUpTarget)) {
					return;
				}

				if (rootId && mouseUpTarget && findRootOwnerId(mouseUpTarget) === rootId) {
					return;
				}

				actionsRef.current?.setOpen(
					false,
					createChangeEventDetails(REASONS.cancelOpen, mouseEvent),
				);
			},
			{ once: true },
		);
	}

	function handleTouchStart(event: TouchEvent) {
		if (disabled) {
			return;
		}
		allowMouseUpTriggerRef.current = false;
		if (event.touches.length === 1) {
			event.stopPropagation();
			const touch = event.touches[0];
			touchPositionRef.current = { x: touch.clientX, y: touch.clientY };
			longPressTimeout.start(LONG_PRESS_DELAY, () => {
				if (touchPositionRef.current) {
					handleLongPress(touchPositionRef.current.x, touchPositionRef.current.y, event);
				}
			});
		}
	}

	function handleTouchMove(event: TouchEvent) {
		if (longPressTimeout.isStarted() && touchPositionRef.current && event.touches.length === 1) {
			const touch = event.touches[0];
			const moveThreshold = 10;

			const deltaX = Math.abs(touch.clientX - touchPositionRef.current.x);
			const deltaY = Math.abs(touch.clientY - touchPositionRef.current.y);

			if (deltaX > moveThreshold || deltaY > moveThreshold) {
				longPressTimeout.clear();
			}
		}
	}

	function handleTouchEnd() {
		longPressTimeout.clear();
		touchPositionRef.current = null;
	}

	useEffect(
		() => {
			function handleDocumentContextMenu(event: Event) {
				if (disabled) {
					return;
				}

				const target = getTarget(event);
				const targetElement = target as HTMLElement | null;
				if (
					contains(triggerRef.current, targetElement) ||
					contains(internalBackdropRef.current, targetElement) ||
					contains(backdropRef.current, targetElement)
				) {
					event.preventDefault();
				}
			}

			const doc = ownerDocument(triggerRef.current);
			return addEventListener(doc, 'contextmenu', handleDocumentContextMenu);
		},
		[backdropRef, disabled, internalBackdropRef],
		subSlot(slot, 'e:ctxmenu'),
	);

	const state: ContextMenuTriggerState = {
		open,
	};

	return useRenderElement(
		'div',
		componentProps,
		{
			state,
			ref: [triggerRef, forwardedRef],
			props: [
				{
					onContextMenu: handleContextMenu,
					onTouchStart: handleTouchStart,
					onTouchMove: handleTouchMove,
					onTouchEnd: handleTouchEnd,
					onTouchCancel: handleTouchEnd,
					style: {
						WebkitTouchCallout: 'none',
					},
				},
				elementProps,
			],
			stateAttributesMapping: pressableTriggerOpenStateMapping,
		},
		subSlot(slot, 're'),
	);
}

export interface ContextMenuTriggerState {
	/** Whether the context menu is currently open. */
	open: boolean;
}

// --- Namespace ----------------------------------------------------------------

/**
 * Mirrors upstream's `context-menu/index.parts.ts`: `Root` and `Trigger` are ContextMenu's own,
 * everything else is `Menu`'s part re-exported here.
 */
export const ContextMenu = {
	Root: ContextMenuRoot,
	Trigger: ContextMenuTrigger,
	Backdrop: Menu.Backdrop,
	Portal: Menu.Portal,
	Positioner: Menu.Positioner,
	Popup: Menu.Popup,
	Arrow: Menu.Arrow,
	Group: Menu.Group,
	GroupLabel: Menu.GroupLabel,
	Item: Menu.Item,
	CheckboxItem: Menu.CheckboxItem,
	CheckboxItemIndicator: Menu.CheckboxItemIndicator,
	LinkItem: Menu.LinkItem,
	RadioGroup: Menu.RadioGroup,
	RadioItem: Menu.RadioItem,
	RadioItemIndicator: Menu.RadioItemIndicator,
	SubmenuRoot: Menu.SubmenuRoot,
	SubmenuTrigger: Menu.SubmenuTrigger,
	Separator: Menu.Separator,
};
