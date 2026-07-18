// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/tag/useTagGroup.ts).
// octane adaptations:
// - `ListState` comes from the ported stately list hook; `DOMAttributes` is a local
//   structural prop-bag alias; React's `ReactNode` errorMessage type → `any` (octane
//   renderables).
// - Public-hook slot threading (splitSlot/subSlot); explicit dependency arrays are kept
//   verbatim.
import { AriaGridListProps, useGridList } from '../gridlist/useGridList';

import type {
	AriaLabelingProps,
	CollectionBase,
	DOMProps,
	HelpTextProps,
	Key,
	KeyboardDelegate,
	LabelableProps,
	MultipleSelection,
	RefObject,
	SelectionBehavior,
} from '@react-types/shared';
import { filterDOMProps } from '../utils/filterDOMProps';
import { ListKeyboardDelegate } from '../selection/ListKeyboardDelegate';
import type { ListState } from '../stately/list/useListState';
import { mergeProps } from '../utils/mergeProps';
import { useEffect, useRef, useState } from 'octane';
import { useField } from '../label/useField';
import { useFocusWithin } from '../interactions/useFocusWithin';
import { useLocale } from '../i18n/I18nProvider';

import { S, splitSlot, subSlot } from '../internal';

// octane adaptation: minimal structural DOMAttributes (upstream's drags React's synthetic
// handler types along).
type DOMAttributes = Record<string, any>;

export interface TagGroupAria {
	/** Props for the tag grouping element. */
	gridProps: DOMAttributes;
	/** Props for the tag group's visible label (if any). */
	labelProps: DOMAttributes;
	/** Props for the tag group description element, if any. */
	descriptionProps: DOMAttributes;
	/** Props for the tag group error message element, if any. */
	errorMessageProps: DOMAttributes;
}

export interface AriaTagGroupProps<T>
	extends
		CollectionBase<T>,
		MultipleSelection,
		Pick<AriaGridListProps<T>, 'escapeKeyBehavior' | 'onAction'>,
		DOMProps,
		LabelableProps,
		AriaLabelingProps,
		Omit<HelpTextProps, 'errorMessage'> {
	/**
	 * How multiple selection should behave in the collection.
	 *
	 * @default 'toggle'
	 */
	selectionBehavior?: SelectionBehavior;
	/** Whether selection should occur on press up instead of press down. */
	shouldSelectOnPressUp?: boolean;
	/** Handler that is called when a user deletes a tag. */
	onRemove?: (keys: Set<Key>) => void;
	/** An error message for the field. */
	errorMessage?: any;
	/**
	 * Whether pressing the escape key should clear selection in the TagGroup or not.
	 *
	 * Most experiences should not modify this option as it eliminates a keyboard user's ability to
	 * easily clear selection. Only use if the escape key is being handled externally or should not
	 * trigger selection clearing contextually.
	 *
	 * @default 'clearSelection'
	 */
	escapeKeyBehavior?: 'clearSelection' | 'none';
}

export interface AriaTagGroupOptions<T> extends Omit<AriaTagGroupProps<T>, 'children'> {
	/**
	 * An optional keyboard delegate to handle arrow key navigation,
	 * to override the default.
	 */
	keyboardDelegate?: KeyboardDelegate;
}

interface HookData {
	onRemove?: (keys: Set<Key>) => void;
}

export const hookData: WeakMap<ListState<any>, HookData> = new WeakMap<ListState<any>, HookData>();

/**
 * Provides the behavior and accessibility implementation for a tag group component. A tag group is
 * a focusable list of labels, categories, keywords, filters, or other items, with support for
 * keyboard navigation, selection, and removal.
 *
 * @param props - Props to be applied to the tag group.
 * @param state - State for the tag group, as returned by `useListState`.
 * @param ref - A ref to a DOM element for the tag group.
 */
export function useTagGroup<T>(
	props: AriaTagGroupOptions<T>,
	state: ListState<T>,
	ref: RefObject<HTMLElement | null>,
): TagGroupAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useTagGroup<T>(
	props: AriaTagGroupOptions<T>,
	state: ListState<T>,
	ref: RefObject<HTMLElement | null>,
	slot: symbol | undefined,
): TagGroupAria;
export function useTagGroup(...args: any[]): TagGroupAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useTagGroup');
	const props = user[0] as AriaTagGroupOptions<any>;
	const state = user[1] as ListState<any>;
	const ref = user[2] as RefObject<HTMLElement | null>;

	let { direction } = useLocale(subSlot(slot, 'locale'));
	let keyboardDelegate =
		props.keyboardDelegate ||
		new ListKeyboardDelegate({
			collection: state.collection,
			ref,
			orientation: 'horizontal',
			direction,
			disabledKeys: state.disabledKeys,
			disabledBehavior: state.selectionManager.disabledBehavior,
		});
	let { labelProps, fieldProps, descriptionProps, errorMessageProps } = useField(
		{
			...props,
			labelElementType: 'span',
		},
		subSlot(slot, 'field'),
	);
	let { gridProps } = useGridList(
		{
			...props,
			...fieldProps,
			keyboardDelegate,
			shouldFocusWrap: true,
			linkBehavior: 'override',
			keyboardNavigationBehavior: 'tab',
		},
		state,
		ref,
		subSlot(slot, 'gridList'),
	);

	let [isFocusWithin, setFocusWithin] = useState(false, subSlot(slot, 'focusWithin'));
	let { focusWithinProps } = useFocusWithin(
		{
			onFocusWithinChange: setFocusWithin,
		},
		subSlot(slot, 'focusWithinHook'),
	);
	let domProps = filterDOMProps(props);

	// If the last tag is removed, focus the container.
	let prevCount = useRef(state.collection.size, subSlot(slot, 'prevCount'));
	useEffect(
		() => {
			if (ref.current && prevCount.current > 0 && state.collection.size === 0 && isFocusWithin) {
				ref.current.focus();
			}
			prevCount.current = state.collection.size;
		},
		[state.collection.size, isFocusWithin, ref],
		subSlot(slot, 'focusContainerFx'),
	);

	hookData.set(state, { onRemove: props.onRemove });

	return {
		gridProps: mergeProps(gridProps, domProps, {
			role: state.collection.size ? 'grid' : 'group',
			'aria-atomic': false,
			'aria-relevant': 'additions',
			'aria-live': isFocusWithin ? 'polite' : 'off',
			...focusWithinProps,
			...fieldProps,
		}),
		labelProps,
		descriptionProps,
		errorMessageProps,
	};
}
