// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/tabs/useTabPanel.ts).
// octane adaptations: `DOMAttributes` is a local structural prop-bag alias (upstream's is
// typed over React's synthetic handlers); `TabListState` from the ported stately tabs state;
// public-hook slot threading (splitSlot/subSlot) per the binding convention.
import type { AriaLabelingProps, DOMProps, Key, RefObject } from '@react-types/shared';
import { generateId } from './utils';
import { mergeProps } from '../utils/mergeProps';
import type { TabListState } from '../stately/tabs/useTabListState';
import { useHasTabbableChild } from '../focus/useHasTabbableChild';
import { useLabels } from '../utils/useLabels';

import { S, splitSlot, subSlot } from '../internal';

// octane adaptation: minimal structural DOMAttributes (upstream's drags React's synthetic
// handler types along).
type DOMAttributes = Record<string, any>;

export interface AriaTabPanelProps extends Omit<DOMProps, 'id'>, AriaLabelingProps {
	/** The unique id of the tab. */
	id?: Key;
}

export interface TabPanelAria {
	/** Props for the tab panel element. */
	tabPanelProps: DOMAttributes;
}

/**
 * Provides the behavior and accessibility implementation for a tab panel. A tab panel is a
 * container for the contents of a tab, and is shown when the tab is selected.
 */
export function useTabPanel<T>(
	props: AriaTabPanelProps,
	state: TabListState<T> | null,
	ref: RefObject<Element | null>,
): TabPanelAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useTabPanel<T>(
	props: AriaTabPanelProps,
	state: TabListState<T> | null,
	ref: RefObject<Element | null>,
	slot: symbol | undefined,
): TabPanelAria;
export function useTabPanel(...args: any[]): TabPanelAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useTabPanel');
	const props = user[0] as AriaTabPanelProps;
	const state = user[1] as TabListState<unknown> | null;
	const ref = user[2] as RefObject<Element | null>;

	// The tabpanel should have tabIndex=0 when there are no tabbable elements within it.
	// Otherwise, tabbing from the focused tab should go directly to the first tabbable element
	// within the tabpanel.
	let tabIndex = useHasTabbableChild(ref, undefined, subSlot(slot, 'tabbable')) ? undefined : 0;

	const id = generateId(state, props.id ?? state?.selectedKey, 'tabpanel');
	const tabPanelProps = useLabels(
		{
			...props,
			id,
			'aria-labelledby': generateId(state, state?.selectedKey, 'tab'),
		},
		undefined,
		subSlot(slot, 'labels'),
	);

	return {
		tabPanelProps: mergeProps(tabPanelProps, {
			tabIndex,
			role: 'tabpanel',
			'aria-describedby': props['aria-describedby'],
			'aria-details': props['aria-details'],
		}),
	};
}
