// Ported from .base-ui/packages/react/src/menubar/ (v1.6.0) — Phase 3f STAGE 4.
//
// A `Menubar` is a `CompositeRoot` of `Menu.Trigger`s that share one `FloatingTree`, plus the
// `MenubarContext` that `Menu` has been branching on since stage 1 (`parent.type === 'menubar'`).
// Providing it here is what activates those already-transcribed branches: triggers render as
// `CompositeItem`s with `role="menuitem"`, sibling menus open on hover once one is open, the
// positioner flips its default side to match the bar's orientation, and the modal backdrop moves to
// the bar itself so the whole menubar stays clickable.
//
// `MenubarContext` itself lives in `./utils/MenubarContext` — it landed as a context-only module in
// stage 1 so `Menu`'s parent-union branches could be written verbatim ahead of this component.
//
// octane adaptations: `createElement`, not JSX; `forwardRef` → ref-as-prop; per-call-site `S('…')`
// slots with `subSlot` for every composed hook; `useFloatingNodeId()` takes an explicit
// (tree, slot) pair.
import { createElement, useState, useRef, useEffect, useMemo } from 'octane';

import { S, subSlot } from './internal';
import { useBaseUiId } from './utils/useBaseUiId';
import { CompositeRoot } from './utils/composite/CompositeRoot';
import {
	FloatingNode,
	FloatingTree,
	useFloatingNodeId,
	useFloatingTree,
} from './utils/floating/FloatingTree';
import { MenubarContext, useMenubarContext } from './utils/MenubarContext';
import type { MenubarContextValue } from './utils/MenubarContext';
import type { MenuOpenEventDetails, MenuRootOrientation } from './menu';
import type { StateAttributesMapping } from './utils/getStateAttributesProps';
import { REASONS } from './utils/createChangeEventDetails';

const menubarStateAttributesMapping: StateAttributesMapping<any> = {
	hasSubmenuOpen(value: boolean) {
		return value ? { 'data-has-submenu-open': '' } : null;
	},
};

function MenubarContent(props: { children?: any }): any {
	const slot = S('MenubarContent');
	const nodeId = useFloatingNodeId(undefined, subSlot(slot, 'nodeId'));
	const tree = useFloatingTree();
	const menuEvents = (tree as any).events;
	const rootContext = useMenubarContext();

	useEffect(
		() => {
			function onSubmenuOpenChange(details: MenuOpenEventDetails) {
				if (!details.nodeId || details.parentNodeId !== nodeId) {
					return;
				}

				if (details.open) {
					if (!rootContext.hasSubmenuOpen) {
						rootContext.setHasSubmenuOpen(true);
					}
				} else if (
					details.reason !== REASONS.siblingOpen &&
					details.reason !== REASONS.listNavigation
				) {
					rootContext.setHasSubmenuOpen(false);
				}
			}

			menuEvents.on('menuopenchange', onSubmenuOpenChange);

			return () => {
				menuEvents.off('menuopenchange', onSubmenuOpenChange);
			};
		},
		[menuEvents, nodeId, rootContext],
		subSlot(slot, 'e'),
	);

	return createElement(FloatingNode, { id: nodeId, children: props.children });
}

/**
 * The container for menus.
 *
 * Documentation: [Base UI Menubar](https://base-ui.com/react/components/menubar)
 */
export function Menubar(props: any): any {
	const slot = S('Menubar');
	const {
		orientation = 'horizontal',
		loopFocus = true,
		render,
		className,
		modal = true,
		disabled = false,
		id: idProp,
		style,
		ref: forwardedRef,
		...elementProps
	} = props;

	const [contentElement, setContentElement] = useState<HTMLElement | null>(
		null,
		subSlot(slot, 'content'),
	);
	const [hasSubmenuOpen, setHasSubmenuOpen] = useState(false, subSlot(slot, 'hasSub'));

	const id = useBaseUiId(idProp, subSlot(slot, 'id'));

	const state: MenubarState = {
		orientation,
		modal,
		hasSubmenuOpen,
	};

	const contentRef = useRef<HTMLDivElement | null>(null, subSlot(slot, 'contentRef'));
	const allowMouseUpTriggerRef = useRef(false, subSlot(slot, 'amut'));

	const context: MenubarContextValue = useMemo(
		() => ({
			contentElement,
			setContentElement,
			setHasSubmenuOpen,
			hasSubmenuOpen,
			modal,
			disabled,
			orientation,
			allowMouseUpTriggerRef,
			rootId: id,
		}),
		[contentElement, hasSubmenuOpen, modal, disabled, orientation, id],
		subSlot(slot, 'ctx'),
	);

	return createElement(MenubarContext.Provider, {
		value: context,
		children: createElement(FloatingTree, {
			children: createElement(MenubarContent, {
				children: createElement(CompositeRoot, {
					render,
					className,
					style,
					state,
					stateAttributesMapping: menubarStateAttributesMapping,
					refs: [forwardedRef, setContentElement, contentRef],
					props: [{ role: 'menubar', id, 'aria-orientation': orientation }, elementProps],
					orientation,
					loopFocus,
					enableHomeAndEndKeys: true,
					highlightItemOnHover: hasSubmenuOpen,
				}),
			}),
		}),
	});
}

export interface MenubarState {
	/** The orientation of the menubar. */
	orientation: MenuRootOrientation;
	/** Whether the menubar is modal. */
	modal: boolean;
	/** Whether any submenu within the menubar is open. */
	hasSubmenuOpen: boolean;
}
