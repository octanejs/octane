// Ported from react-stately (source: .react-spectrum/packages/react-stately/src/menu/useSubmenuTriggerState.ts).
// octane adaptations: public-hook slot threading (splitSlot/subSlot) per the binding
// convention; explicit dependency arrays are kept verbatim (they retain React's exact
// behavior in octane).
import type { FocusStrategy, Key } from '@react-types/shared';
import { useCallback, useMemo, useState } from 'octane';

import { S, splitSlot, subSlot } from '../../internal';
import type { OverlayTriggerState } from '../overlays/useOverlayTriggerState';
import type { RootMenuTriggerState } from './useMenuTriggerState';

export interface SubmenuTriggerProps {
	/** Key of the trigger item. */
	triggerKey: Key;
}

export interface SubmenuTriggerState extends OverlayTriggerState {
	/** Whether the submenu is currently open. */
	isOpen: boolean;
	/** Controls which item will be auto focused when the submenu opens. */
	focusStrategy: FocusStrategy | null;
	/** Opens the submenu. */
	open: (focusStrategy?: FocusStrategy | null) => void;
	/** Closes the submenu. */
	close: () => void;
	/** Closes all menus and submenus in the menu tree. */
	closeAll: () => void;
	/** The level of the submenu. */
	submenuLevel: number;
	/** Toggles the submenu. */
	toggle: (focusStrategy?: FocusStrategy | null) => void;
	/** @private */
	setOpen: () => void;
}

/**
 * Manages state for a submenu trigger. Tracks whether the submenu is currently open, the level of
 * the submenu, and controls which item will receive focus when it opens.
 */
export function useSubmenuTriggerState(
	props: SubmenuTriggerProps,
	state: RootMenuTriggerState,
): SubmenuTriggerState;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useSubmenuTriggerState(
	props: SubmenuTriggerProps,
	state: RootMenuTriggerState,
	slot: symbol | undefined,
): SubmenuTriggerState;
export function useSubmenuTriggerState(...args: any[]): SubmenuTriggerState {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useSubmenuTriggerState');
	const props = user[0] as SubmenuTriggerProps;
	const state = user[1] as RootMenuTriggerState;

	let { triggerKey } = props;
	let { expandedKeysStack, openSubmenu, closeSubmenu, close: closeAll } = state;
	let [submenuLevel] = useState(expandedKeysStack?.length, subSlot(slot, 'level'));
	let isOpen = useMemo(
		() => expandedKeysStack[submenuLevel] === triggerKey,
		[expandedKeysStack, triggerKey, submenuLevel],
		subSlot(slot, 'isOpen'),
	);
	let [focusStrategy, setFocusStrategy] = useState<FocusStrategy | null>(
		null,
		subSlot(slot, 'focusStrategy'),
	);

	let open = useCallback(
		(focusStrategy?: FocusStrategy | null) => {
			setFocusStrategy(focusStrategy ?? null);
			openSubmenu(triggerKey, submenuLevel);
		},
		[openSubmenu, submenuLevel, triggerKey],
		subSlot(slot, 'open'),
	);

	let close = useCallback(
		() => {
			setFocusStrategy(null);
			closeSubmenu(triggerKey, submenuLevel);
		},
		[closeSubmenu, submenuLevel, triggerKey],
		subSlot(slot, 'close'),
	);

	let toggle = useCallback(
		(focusStrategy?: FocusStrategy | null) => {
			setFocusStrategy(focusStrategy ?? null);
			if (isOpen) {
				close();
			} else {
				open(focusStrategy);
			}
		},
		[close, open, isOpen],
		subSlot(slot, 'toggle'),
	);

	return useMemo(
		() => ({
			focusStrategy,
			isOpen,
			open,
			close,
			closeAll,
			submenuLevel,
			// TODO: Placeholders that aren't used but give us parity with OverlayTriggerState so we can use this in Popover. Refactor if we update Popover via
			// https://github.com/adobe/react-spectrum/pull/4976#discussion_r1336472863
			setOpen: () => {},
			toggle,
		}),
		[isOpen, open, close, closeAll, focusStrategy, toggle, submenuLevel],
		subSlot(slot, 'state'),
	);
}
