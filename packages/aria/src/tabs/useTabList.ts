// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/tabs/useTabList.ts).
// octane adaptations:
// - `DOMAttributes` is a local structural prop-bag alias (upstream's is typed over React's
//   synthetic handlers); `TabListProps`/`TabListState` from the ported stately tabs state.
// - Public-hook slot threading (splitSlot/subSlot) per the binding convention; the
//   explicit `useMemo` dependency array is kept verbatim.
import type { AriaLabelingProps, DOMProps, Orientation, RefObject } from '@react-types/shared';
import { mergeProps } from '../utils/mergeProps';
import type { TabListProps, TabListState } from '../stately/tabs/useTabListState';
import { tabsIds } from './utils';
import { TabsKeyboardDelegate } from './TabsKeyboardDelegate';
import { useId } from '../utils/useId';
import { useLabels } from '../utils/useLabels';
import { useLocale } from '../i18n/I18nProvider';
import { useMemo } from 'octane';
import { useSelectableCollection } from '../selection/useSelectableCollection';

import { S, splitSlot, subSlot } from '../internal';

// octane adaptation: minimal structural DOMAttributes (upstream's drags React's synthetic
// handler types along).
type DOMAttributes = Record<string, any>;

export interface AriaTabListProps<T> extends TabListProps<T>, DOMProps, AriaLabelingProps {
	/**
	 * Whether tabs are activated automatically on focus or manually.
	 *
	 * @default 'automatic'
	 */
	keyboardActivation?: 'automatic' | 'manual';
	/**
	 * The orientation of the tabs.
	 *
	 * @default 'horizontal'
	 */
	orientation?: Orientation;
}

export interface AriaTabListOptions<T> extends Omit<AriaTabListProps<T>, 'children'> {}

export interface TabListAria {
	/** Props for the tablist container. */
	tabListProps: DOMAttributes;
}

/**
 * Provides the behavior and accessibility implementation for a tab list.
 * Tabs organize content into multiple sections and allow users to navigate between them.
 */
export function useTabList<T>(
	props: AriaTabListOptions<T>,
	state: TabListState<T>,
	ref: RefObject<HTMLElement | null>,
): TabListAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useTabList<T>(
	props: AriaTabListOptions<T>,
	state: TabListState<T>,
	ref: RefObject<HTMLElement | null>,
	slot: symbol | undefined,
): TabListAria;
export function useTabList(...args: any[]): TabListAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useTabList');
	const props = user[0] as AriaTabListOptions<unknown>;
	const state = user[1] as TabListState<unknown>;
	const ref = user[2] as RefObject<HTMLElement | null>;

	let { orientation = 'horizontal', keyboardActivation = 'automatic' } = props;
	let { collection, selectionManager: manager, disabledKeys } = state;
	let { direction } = useLocale(subSlot(slot, 'locale'));
	let delegate = useMemo(
		() => new TabsKeyboardDelegate(collection, direction, orientation, disabledKeys),
		[collection, disabledKeys, orientation, direction],
		subSlot(slot, 'delegate'),
	);

	let { collectionProps } = useSelectableCollection(
		{
			ref,
			selectionManager: manager,
			keyboardDelegate: delegate,
			selectOnFocus: keyboardActivation === 'automatic',
			disallowEmptySelection: true,
			scrollRef: ref,
			linkBehavior: 'selection',
		},
		subSlot(slot, 'collection'),
	);

	// Compute base id for all tabs
	let tabsId = useId(subSlot(slot, 'tabsId'));
	tabsIds.set(state, tabsId);

	let tabListLabelProps = useLabels({ ...props, id: tabsId }, undefined, subSlot(slot, 'labels'));

	return {
		tabListProps: {
			...mergeProps(collectionProps, tabListLabelProps),
			role: 'tablist',
			'aria-orientation': orientation,
			tabIndex: undefined,
		},
	};
}
