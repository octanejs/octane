// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/combobox/useComboBox.ts).
// octane adaptations:
// - The combobox text input is a TEXT input: upstream feeds the input value via a synthetic
//   `onChange` passed to useTextField. octane's useTextField already wires that `onChange`
//   onto the NATIVE `input` event (see textfield/useTextField.ts). So this port keeps
//   `onChange: state.setInputValue` VERBATIM — the onChange→onInput DOM wiring lives in
//   useTextField, and the value-level `onInputChange(value)` public callback is unchanged.
// - onKeyDown receives the ported BaseEvent Proxy (from useKeyboard/createEventHandler via
//   useTextField's useFocusable). `.nativeEvent.isComposing` → `e.isComposing` (the Proxy
//   forwards the read to the live native event); `continuePropagation`/`preventDefault` work
//   through the Proxy. FocusEvent/TouchEvent become native DOM events; element types → `any`.
// - The Parcel glob intl import becomes the generated '../intl/combobox' dictionary index.
// - Public-hook slot threading (splitSlot/subSlot) per the binding convention; the module-local
//   `useValueId` helper takes a threaded slot; dep-less upstream useEffects become explicit `null`.
import type {
	AriaLabelingProps,
	DOMProps,
	InputDOMProps,
	KeyboardDelegate,
	LayoutDelegate,
	PressEvent,
	RefObject,
	RouterOptions,
	ValidationResult,
} from '@react-types/shared';
import { useEffect, useMemo, useRef, useState } from 'octane';

import { announce } from '../live-announcer/LiveAnnouncer';
import type { AriaButtonProps } from '../button/useButton';
import { ariaHideOutside } from '../overlays/ariaHideOutside';
import type { AriaListBoxOptions } from '../listbox/useListBox';
import { chain } from '../utils/chain';
import {
	type ComboBoxState,
	type SelectionMode,
	type ComboBoxProps,
} from '../stately/combobox/useComboBoxState';
import { dispatchVirtualFocus } from '../focus/virtualFocus';
import { getActiveElement, getEventTarget, nodeContains } from '../utils/shadowdom/DOMFunctions';
import { getChildNodes } from '../stately/collections/getChildNodes';
import { getItemCount } from '../stately/collections/getItemCount';
import { getItemId, listData } from '../listbox/utils';
import { getOwnerDocument } from '../utils/domHelpers';
import intlMessages from '../intl/combobox';
import { isAppleDevice } from '../utils/platform';
import { ListKeyboardDelegate } from '../selection/ListKeyboardDelegate';
import { mergeProps } from '../utils/mergeProps';
import { privateValidationStateProp } from '../stately/form/useFormValidationState';
import { useEvent } from '../utils/useEvent';
import { useFormReset } from '../utils/useFormReset';
import { useId } from '../utils/useId';
import { useLabels } from '../utils/useLabels';
import { useLocalizedStringFormatter } from '../i18n/useLocalizedStringFormatter';
import { useMenuTrigger } from '../menu/useMenuTrigger';
import { useRouter } from '../utils/openLink';
import { useSelectableCollection } from '../selection/useSelectableCollection';
import { useTextField } from '../textfield/useTextField';
import { useUpdateEffect } from '../utils/useUpdateEffect';

import { S, splitSlot, subSlot } from '../internal';

// octane adaptation: element/DOM attribute types collapse to structural bags (upstream's
// versions are typed over React's SyntheticEvent / JSX intrinsic-element machinery).
type DOMAttributes = Record<string, any>;

export interface AriaComboBoxProps<T, M extends SelectionMode = 'single'>
	extends ComboBoxProps<T, M>, DOMProps, InputDOMProps, AriaLabelingProps {
	/** Whether keyboard navigation is circular. */
	shouldFocusWrap?: boolean;
}

export interface AriaComboBoxOptions<T, M extends SelectionMode = 'single'> extends Omit<
	AriaComboBoxProps<T, M>,
	'children'
> {
	/** The ref for the input element. */
	inputRef: RefObject<HTMLInputElement | null>;
	/** The ref for the list box popover. */
	popoverRef: RefObject<Element | null>;
	/** The ref for the list box. */
	listBoxRef: RefObject<HTMLElement | null>;
	/** The ref for the optional list box popup trigger button. */
	buttonRef?: RefObject<Element | null>;
	/** An optional keyboard delegate implementation, to override the default. */
	keyboardDelegate?: KeyboardDelegate;
	/**
	 * A delegate object that provides layout information for items in the collection.
	 * By default this uses the DOM, but this can be overridden to implement things like
	 * virtualized scrolling.
	 */
	layoutDelegate?: LayoutDelegate;
}

export interface ComboBoxAria<T> extends ValidationResult {
	/** Props for the label element. */
	labelProps: DOMAttributes;
	/** Props for the combo box input element. */
	inputProps: DOMAttributes;
	/** Props for the list box, to be passed to `useListBox`. */
	listBoxProps: AriaListBoxOptions<T>;
	/** Props for the optional trigger button, to be passed to `useButton`. */
	buttonProps: AriaButtonProps;
	/** Props for the element representing the selected value. */
	valueProps: DOMAttributes;
	/** Props for the combo box description element, if any. */
	descriptionProps: DOMAttributes;
	/** Props for the combo box error message element, if any. */
	errorMessageProps: DOMAttributes;
}

/**
 * Provides the behavior and accessibility implementation for a combo box component. A combo box
 * combines a text input with a listbox, allowing users to filter a list of options to items
 * matching a query.
 *
 * @param props - Props for the combo box.
 * @param state - State for the select, as returned by `useComboBoxState`.
 */
export function useComboBox<T, M extends SelectionMode = 'single'>(
	props: AriaComboBoxOptions<T, M>,
	state: ComboBoxState<T, M>,
): ComboBoxAria<T>;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useComboBox<T, M extends SelectionMode = 'single'>(
	props: AriaComboBoxOptions<T, M>,
	state: ComboBoxState<T, M>,
	slot: symbol | undefined,
): ComboBoxAria<T>;
export function useComboBox(...args: any[]): ComboBoxAria<any> {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useComboBox');
	const props = user[0] as AriaComboBoxOptions<any, any>;
	const state = user[1] as ComboBoxState<any, any>;

	let {
		buttonRef,
		popoverRef,
		inputRef,
		listBoxRef,
		keyboardDelegate,
		layoutDelegate,
		// completionMode = 'suggest',
		shouldFocusWrap,
		isReadOnly,
		isDisabled,
	} = props;
	let backupBtnRef = useRef(null, subSlot(slot, 'backupBtn'));
	buttonRef = buttonRef ?? backupBtnRef;

	let stringFormatter = useLocalizedStringFormatter(
		intlMessages,
		'@react-aria/combobox',
		subSlot(slot, 'formatter'),
	);
	let { menuTriggerProps, menuProps } = useMenuTrigger<any>(
		{
			type: 'listbox',
			isDisabled: isDisabled || isReadOnly,
		},
		state,
		buttonRef,
		subSlot(slot, 'menuTrigger'),
	);

	// Set listbox id so it can be used when calling getItemId later
	listData.set(state, { id: menuProps.id });

	// By default, a KeyboardDelegate is provided which uses the DOM to query layout information (e.g. for page up/page down).
	// When virtualized, the layout object will be passed in as a prop and override this.
	let { collection } = state;
	let { disabledKeys } = state.selectionManager;
	let delegate = useMemo(
		() =>
			keyboardDelegate ||
			new ListKeyboardDelegate({
				collection,
				disabledKeys,
				ref: listBoxRef,
				layoutDelegate,
			}),
		[keyboardDelegate, layoutDelegate, collection, disabledKeys, listBoxRef],
		subSlot(slot, 'delegate'),
	);

	// Use useSelectableCollection to get the keyboard handlers to apply to the textfield
	let { collectionProps } = useSelectableCollection(
		{
			selectionManager: state.selectionManager,
			keyboardDelegate: delegate,
			disallowTypeAhead: true,
			disallowEmptySelection: true,
			shouldFocusWrap,
			ref: inputRef,
			// Prevent item scroll behavior from being applied here, should be handled in the user's Popover + ListBox component
			isVirtualized: true,
		},
		subSlot(slot, 'selectable'),
	);

	let router = useRouter();

	// For textfield specific keydown operations
	let onKeyDown = (e: any) => {
		// octane adaptation: `.nativeEvent.isComposing` → `e.isComposing` (the BaseEvent Proxy
		// forwards the read to the live native event).
		if (e.isComposing) {
			return;
		}
		switch (e.key) {
			case 'Enter':
			case 'Tab':
				// Prevent form submission if menu is open since we may be selecting a option
				if (state.isOpen && e.key === 'Enter') {
					e.preventDefault();
				}

				// If the focused item is a link, trigger opening it. Items that are links are not selectable.
				if (state.isOpen && listBoxRef.current && state.selectionManager.focusedKey != null) {
					let collectionItem = state.collection.getItem(state.selectionManager.focusedKey);
					if (collectionItem?.props.href) {
						let item = listBoxRef.current.querySelector(
							`[data-key="${CSS.escape(state.selectionManager.focusedKey.toString())}"]`,
						);
						if (e.key === 'Enter' && item instanceof HTMLAnchorElement) {
							router.open(
								item,
								e,
								collectionItem.props.href,
								collectionItem.props.routerOptions as RouterOptions,
							);
						}
						state.close();
						break;
					} else if (collectionItem?.props.onAction) {
						collectionItem.props.onAction();
						state.close();
						break;
					}
				}
				if (e.key === 'Enter' || state.isOpen) {
					state.commit();
				}
				if (e.key === 'Tab') {
					e.continuePropagation();
				}

				break;
			case 'Escape':
				if (!state.selectionManager.isEmpty || state.inputValue === '' || props.allowsCustomValue) {
					e.continuePropagation();
				}
				state.revert();
				break;
			case 'ArrowDown':
				state.open('first', 'manual');
				break;
			case 'ArrowUp':
				state.open('last', 'manual');
				break;
			case 'ArrowLeft':
			case 'ArrowRight':
				state.selectionManager.setFocusedKey(null);
				break;
		}
	};

	let onBlur = (e: any) => {
		let blurFromButton = buttonRef?.current && buttonRef.current === e.relatedTarget;
		let blurIntoPopover = nodeContains(popoverRef.current, e.relatedTarget);
		// Ignore blur if focused moved to the button(if exists) or into the popover.
		if (blurFromButton || blurIntoPopover) {
			return;
		}

		if (props.onBlur) {
			props.onBlur(e);
		}

		state.setFocused(false);
	};

	let onFocus = (e: any) => {
		if (state.isFocused) {
			return;
		}

		if (props.onFocus) {
			props.onFocus(e);
		}

		state.setFocused(true);
	};

	let valueId = useValueId(
		[state.selectionManager.selectedKeys, state.selectionManager.selectionMode],
		subSlot(slot, 'valueId'),
	);
	let { isInvalid, validationErrors, validationDetails } = state.displayValidation;
	let { labelProps, inputProps, descriptionProps, errorMessageProps } = useTextField(
		{
			...props,
			// In multi-select mode, only set required if the selection is empty.
			isRequired:
				props.selectionMode === 'multiple'
					? props.isRequired && state.selectionManager.isEmpty
					: props.isRequired,
			onChange: state.setInputValue,
			onKeyDown: !isReadOnly
				? chain(state.isOpen && collectionProps.onKeyDown, onKeyDown, props.onKeyDown)
				: props.onKeyDown,
			onBlur,
			value: state.inputValue,
			defaultValue: state.defaultInputValue,
			onFocus,
			autoComplete: 'off',
			validate: undefined,
			[privateValidationStateProp]: state,
			'aria-describedby':
				[valueId, props['aria-describedby']].filter(Boolean).join(' ') || undefined,
		},
		inputRef,
		subSlot(slot, 'textField'),
	);

	useFormReset(inputRef, state.defaultValue, state.setValue, subSlot(slot, 'formReset'));

	// Press handlers for the ComboBox button
	let onPress = (e: PressEvent) => {
		if (e.pointerType === 'touch') {
			// Focus the input field in case it isn't focused yet
			inputRef.current?.focus();
			state.toggle(null, 'manual');
		}
	};

	let onPressStart = (e: PressEvent) => {
		if (e.pointerType !== 'touch') {
			inputRef.current?.focus();
			state.toggle(
				e.pointerType === 'keyboard' || e.pointerType === 'virtual' ? 'first' : null,
				'manual',
			);
		}
	};

	let triggerLabelProps = useLabels(
		{
			id: menuTriggerProps.id,
			'aria-label': stringFormatter.format('buttonLabel'),
			'aria-labelledby': props['aria-labelledby'] || labelProps.id,
		},
		undefined,
		subSlot(slot, 'triggerLabels'),
	);

	let listBoxProps = useLabels(
		{
			id: menuProps.id,
			'aria-label': stringFormatter.format('listboxLabel'),
			'aria-labelledby': props['aria-labelledby'] || labelProps.id,
		},
		undefined,
		subSlot(slot, 'listBoxLabels'),
	);

	// If a touch happens on direct center of ComboBox input, might be virtual click from iPad so open ComboBox menu
	let lastEventTime = useRef(0, subSlot(slot, 'lastEventTime'));
	let onTouchEnd = (e: any) => {
		if (isDisabled || isReadOnly) {
			return;
		}

		// Sometimes VoiceOver on iOS fires two touchend events in quick succession. Ignore the second one.
		if (e.timeStamp - lastEventTime.current < 500) {
			e.preventDefault();
			inputRef.current?.focus();
			return;
		}

		let rect = (getEventTarget(e) as Element).getBoundingClientRect();
		let touch = e.changedTouches[0];

		let centerX = Math.ceil(rect.left + 0.5 * rect.width);
		let centerY = Math.ceil(rect.top + 0.5 * rect.height);

		if (touch.clientX === centerX && touch.clientY === centerY) {
			e.preventDefault();
			inputRef.current?.focus();
			state.toggle(null, 'manual');

			lastEventTime.current = e.timeStamp;
		}
	};

	// VoiceOver has issues with announcing aria-activedescendant properly on change
	// (especially on iOS). We use a live region announcer to announce focus changes
	// manually. In addition, section titles are announced when navigating into a new section.
	let focusedItem =
		state.selectionManager.focusedKey != null && state.isOpen
			? state.collection.getItem(state.selectionManager.focusedKey)
			: undefined;
	let sectionKey = focusedItem?.parentKey ?? null;
	let itemKey = state.selectionManager.focusedKey ?? null;
	let lastSection = useRef(sectionKey, subSlot(slot, 'lastSection'));
	let lastItem = useRef(itemKey, subSlot(slot, 'lastItem'));
	// intentional omit dependency array, want this to happen on every render
	useEffect(
		() => {
			if (
				isAppleDevice() &&
				focusedItem != null &&
				itemKey != null &&
				itemKey !== lastItem.current
			) {
				let isSelected = state.selectionManager.isSelected(itemKey);
				let section = sectionKey != null ? state.collection.getItem(sectionKey) : null;
				let sectionTitle =
					section?.['aria-label'] ||
					(typeof section?.rendered === 'string' ? section.rendered : '') ||
					'';

				let announcement = stringFormatter.format('focusAnnouncement', {
					isGroupChange: (section && sectionKey !== lastSection.current) ?? false,
					groupTitle: sectionTitle,
					groupCount: section ? [...getChildNodes(section, state.collection)].length : 0,
					optionText: focusedItem['aria-label'] || focusedItem.textValue || '',
					isSelected,
				});

				announce(announcement);
			}

			lastSection.current = sectionKey;
			lastItem.current = itemKey;
		},
		null,
		subSlot(slot, 'announceFocus'),
	);

	// Announce the number of available suggestions when it changes
	let optionCount = getItemCount(state.collection);
	let lastSize = useRef(optionCount, subSlot(slot, 'lastSize'));
	let lastOpen = useRef(state.isOpen, subSlot(slot, 'lastOpen'));
	// intentional omit dependency array, want this to happen on every render
	useEffect(
		() => {
			// Only announce the number of options available when the menu opens if there is no
			// focused item, otherwise screen readers will typically read e.g. "1 of 6".
			// The exception is VoiceOver since this isn't included in the message above.
			let didOpenWithoutFocusedItem =
				state.isOpen !== lastOpen.current &&
				(state.selectionManager.focusedKey == null || isAppleDevice());

			if (state.isOpen && (didOpenWithoutFocusedItem || optionCount !== lastSize.current)) {
				let announcement = stringFormatter.format('countAnnouncement', { optionCount });
				announce(announcement);
			}

			lastSize.current = optionCount;
			lastOpen.current = state.isOpen;
		},
		null,
		subSlot(slot, 'announceCount'),
	);

	// Announce when a selection occurs for VoiceOver. Other screen readers typically do this automatically.
	// TODO: do we need to do this for multi-select?
	let lastSelectedKey = useRef(state.selectedKey, subSlot(slot, 'lastSelectedKey'));
	// intentional omit dependency array, want this to happen on every render
	useEffect(
		() => {
			if (
				isAppleDevice() &&
				state.isFocused &&
				state.selectedItem &&
				state.selectedKey !== lastSelectedKey.current
			) {
				let optionText = state.selectedItem['aria-label'] || state.selectedItem.textValue || '';
				let announcement = stringFormatter.format('selectedAnnouncement', { optionText });
				announce(announcement);
			}

			lastSelectedKey.current = state.selectedKey;
		},
		null,
		subSlot(slot, 'announceSelected'),
	);

	useEffect(
		() => {
			if (state.isOpen) {
				return ariaHideOutside(
					[inputRef.current, popoverRef.current].filter((element) => element != null),
				);
			}
		},
		[state.isOpen, inputRef, popoverRef],
		subSlot(slot, 'hideOutside'),
	);

	useUpdateEffect(
		() => {
			// Re-show focus ring when there is no virtually focused item.
			if (
				!focusedItem &&
				inputRef.current &&
				getActiveElement(getOwnerDocument(inputRef.current)) === inputRef.current
			) {
				dispatchVirtualFocus(inputRef.current, null);
			}
		},
		[focusedItem],
		subSlot(slot, 'virtualFocus'),
	);

	useEvent(
		listBoxRef,
		'react-aria-item-action',
		state.isOpen
			? () => {
					state.close();
				}
			: undefined,
		subSlot(slot, 'itemAction'),
	);

	return {
		labelProps,
		buttonProps: {
			...menuTriggerProps,
			...triggerLabelProps,
			excludeFromTabOrder: true,
			preventFocusOnPress: true,
			onPress,
			onPressStart,
			isDisabled: isDisabled || isReadOnly,
		},
		inputProps: mergeProps(inputProps, {
			role: 'combobox',
			'aria-expanded': menuTriggerProps['aria-expanded'],
			'aria-controls': state.isOpen ? menuProps.id : undefined,
			// TODO: readd proper logic for completionMode = complete (aria-autocomplete: both)
			'aria-autocomplete': 'list',
			'aria-activedescendant': focusedItem ? getItemId(state, focusedItem.key) : undefined,
			onTouchEnd,
			// This disable's iOS's autocorrect suggestions, since the combo box provides its own suggestions.
			autoCorrect: 'off',
			// This disable's the macOS Safari spell check auto corrections.
			spellCheck: 'false',
		}),
		listBoxProps: mergeProps(menuProps, listBoxProps, {
			onAction: undefined,
			autoFocus: state.focusStrategy || true,
			shouldUseVirtualFocus: true,
			shouldSelectOnPressUp: true,
			shouldFocusOnHover: true,
			linkBehavior: 'selection' as const,
			['UNSTABLE_itemBehavior']: 'action',
		}),
		valueProps: {
			id: valueId,
		},
		descriptionProps,
		errorMessageProps,
		isInvalid,
		validationErrors,
		validationDetails,
	};
}

// This is a modified version of useSlotId that uses useEffect instead of useLayoutEffect.
// Triggering re-renders from useLayoutEffect breaks useComboBoxState's useEffect logic in React 18.
// These re-renders preempt async state updates in the useEffect, which ends up running multiple times
// prior to the state being updated. This results in onSelectionChange being called multiple times.
// TODO: refactor useComboBoxState to avoid this.
// octane adaptation: takes a threaded slot (the module is not octane-compiled).
function useValueId(
	depArray: ReadonlyArray<any> = [],
	slot?: symbol | undefined,
): string | undefined {
	let id = useId(subSlot(slot, 'id'));
	let [exists, setExists] = useState(true, subSlot(slot, 'exists'));
	let [lastDeps, setLastDeps] = useState(depArray, subSlot(slot, 'lastDeps'));

	// If the deps changed, set exists to true so we can test whether the element exists.
	if (lastDeps.some((v, i) => !Object.is(v, depArray[i]))) {
		setExists(true);
		setLastDeps(depArray);
	}

	useEffect(
		() => {
			if (exists && !document.getElementById(id)) {
				setExists(false);
			}
		},
		[id, exists, lastDeps],
		subSlot(slot, 'existsEffect'),
	);

	return exists ? id : undefined;
}
