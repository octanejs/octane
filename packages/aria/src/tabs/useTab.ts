// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/tabs/useTab.ts).
// octane adaptations:
// - `DOMAttributes` is a local structural prop-bag alias (upstream's is typed over React's
//   synthetic handlers); `TabListState` from the ported stately tabs state.
// - Public-hook slot threading (splitSlot/subSlot) per the binding convention
//   (`useLinkProps` composes only context-reading hooks and takes no slot, matching the
//   ported useLink).
import type { AriaLabelingProps, FocusableElement, Key, RefObject } from '@react-types/shared';
import { filterDOMProps } from '../utils/filterDOMProps';
import { generateId } from './utils';
import { mergeProps } from '../utils/mergeProps';
import type { TabListState } from '../stately/tabs/useTabListState';
import { useFocusable } from '../interactions/useFocusable';
import { useLinkProps } from '../utils/openLink';
import { useSelectableItem } from '../selection/useSelectableItem';

import { S, splitSlot, subSlot } from '../internal';

// octane adaptation: minimal structural DOMAttributes (upstream's drags React's synthetic
// handler types along).
type DOMAttributes = Record<string, any>;

export interface AriaTabProps extends AriaLabelingProps {
	/** The key of the tab. */
	key: Key;
	/** Whether the tab should be disabled. */
	isDisabled?: boolean;
	/** Whether the tab selection should occur on press up instead of press down. */
	shouldSelectOnPressUp?: boolean;
}

export interface TabAria {
	/** Props for the tab element. */
	tabProps: DOMAttributes;
	/** Whether the tab is currently selected. */
	isSelected: boolean;
	/** Whether the tab is disabled. */
	isDisabled: boolean;
	/** Whether the tab is currently in a pressed state. */
	isPressed: boolean;
}

/**
 * Provides the behavior and accessibility implementation for a tab.
 * When selected, the associated tab panel is shown.
 */
export function useTab<T>(
	props: AriaTabProps,
	state: TabListState<T>,
	ref: RefObject<FocusableElement | null>,
): TabAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useTab<T>(
	props: AriaTabProps,
	state: TabListState<T>,
	ref: RefObject<FocusableElement | null>,
	slot: symbol | undefined,
): TabAria;
export function useTab(...args: any[]): TabAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useTab');
	const props = user[0] as AriaTabProps;
	const state = user[1] as TabListState<unknown>;
	const ref = user[2] as RefObject<FocusableElement | null>;

	let { key, isDisabled: propsDisabled, shouldSelectOnPressUp } = props;
	let { selectionManager: manager, selectedKey } = state;

	let isSelected = key === selectedKey;

	let isDisabled = propsDisabled || state.isDisabled || state.selectionManager.isDisabled(key);
	let item = state.collection.getItem(key);
	let { itemProps, isPressed } = useSelectableItem(
		{
			selectionManager: manager,
			key,
			ref,
			isDisabled,
			// Link tabs should behave like native anchors (navigate on press up)
			// This avoids reopening beforeunload dialogs when browsers replay
			// queued pointer enter/leave events after cancellation.
			shouldSelectOnPressUp: shouldSelectOnPressUp ?? item?.props.href != null,
			linkBehavior: 'selection',
		},
		subSlot(slot, 'item'),
	);

	let tabId = generateId(state, key, 'tab');
	let tabPanelId = generateId(state, key, 'tabpanel');
	let { tabIndex } = itemProps;

	let domProps = filterDOMProps(item?.props, { labelable: true });
	delete domProps.id;
	let linkProps = useLinkProps(item?.props);
	let { focusableProps } = useFocusable(
		{
			...item?.props,
			isDisabled,
		},
		ref,
		subSlot(slot, 'focusable'),
	);

	return {
		tabProps: mergeProps(domProps, focusableProps, linkProps, itemProps, {
			id: tabId,
			'aria-selected': isSelected,
			'aria-disabled': isDisabled || undefined,
			'aria-controls': isSelected ? tabPanelId : undefined,
			tabIndex: isDisabled ? undefined : tabIndex,
			role: 'tab',
		}),
		isSelected,
		isDisabled,
		isPressed,
	};
}
