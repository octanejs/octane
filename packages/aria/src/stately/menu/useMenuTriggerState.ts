// Ported from react-stately (source: .react-spectrum/packages/react-stately/src/menu/useMenuTriggerState.ts).
// octane adaptations: public-hook slot threading (splitSlot/subSlot) per the binding
// convention.
import type { FocusStrategy, Key } from '@react-types/shared';
import { useState } from 'octane';

import { S, splitSlot, subSlot } from '../../internal';
import {
	type OverlayTriggerProps,
	type OverlayTriggerState,
	useOverlayTriggerState,
} from '../overlays/useOverlayTriggerState';

export type MenuTriggerType = 'press' | 'longPress';

export interface MenuTriggerProps extends OverlayTriggerProps {
	/**
	 * How the menu is triggered.
	 *
	 * @default 'press'
	 */
	trigger?: MenuTriggerType;
}

export interface MenuTriggerState extends OverlayTriggerState {
	/** Controls which item will be auto focused when the menu opens. */
	readonly focusStrategy: FocusStrategy | null;

	/** Opens the menu. */
	open(focusStrategy?: FocusStrategy | null): void;

	/** Toggles the menu. */
	toggle(focusStrategy?: FocusStrategy | null): void;
}

export interface RootMenuTriggerState extends MenuTriggerState {
	/** Opens a specific submenu tied to a specific menu item at a specific level. */
	openSubmenu: (triggerKey: Key, level: number) => void;

	/** Closes a specific submenu tied to a specific menu item at a specific level. */
	closeSubmenu: (triggerKey: Key, level: number) => void;

	/**
	 * An array of open submenu trigger keys within the menu tree.
	 * The index of key within array matches the submenu level in the tree.
	 */
	expandedKeysStack: Key[];

	/** Closes the menu and all submenus in the menu tree. */
	close: () => void;
}

/**
 * Manages state for a menu trigger. Tracks whether the menu is currently open,
 * and controls which item will receive focus when it opens. Also tracks the open submenus within
 * the menu tree via their trigger keys.
 */
export function useMenuTriggerState(props: MenuTriggerProps): RootMenuTriggerState;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useMenuTriggerState(
	props: MenuTriggerProps,
	slot: symbol | undefined,
): RootMenuTriggerState;
export function useMenuTriggerState(...args: any[]): RootMenuTriggerState {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useMenuTriggerState');
	const props = user[0] as MenuTriggerProps;

	let overlayTriggerState = useOverlayTriggerState(props, subSlot(slot, 'overlay'));
	let [focusStrategy, setFocusStrategy] = useState<FocusStrategy | null>(
		null,
		subSlot(slot, 'focusStrategy'),
	);
	let [expandedKeysStack, setExpandedKeysStack] = useState<Key[]>([], subSlot(slot, 'expanded'));

	let closeAll = () => {
		setExpandedKeysStack([]);
		overlayTriggerState.close();
	};

	let openSubmenu = (triggerKey: Key, level: number) => {
		setExpandedKeysStack((oldStack) => {
			if (level > oldStack.length) {
				return oldStack;
			}

			return [...oldStack.slice(0, level), triggerKey];
		});
	};

	let closeSubmenu = (triggerKey: Key, level: number) => {
		setExpandedKeysStack((oldStack) => {
			let key = oldStack[level];
			if (key === triggerKey) {
				return oldStack.slice(0, level);
			} else {
				return oldStack;
			}
		});
	};

	return {
		focusStrategy,
		...overlayTriggerState,
		open(focusStrategy: FocusStrategy | null = null) {
			setFocusStrategy(focusStrategy);
			overlayTriggerState.open();
		},
		toggle(focusStrategy: FocusStrategy | null = null) {
			setFocusStrategy(focusStrategy);
			overlayTriggerState.toggle();
		},
		close() {
			closeAll();
		},
		expandedKeysStack,
		openSubmenu,
		closeSubmenu,
	};
}
