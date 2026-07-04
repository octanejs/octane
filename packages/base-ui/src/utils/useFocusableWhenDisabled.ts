// Ported verbatim from .base-ui/packages/react/src/utils/useFocusableWhenDisabled.ts.
// Computes the tabIndex / aria-disabled / disabled / onKeyDown props a button-like element
// needs so it can (optionally) stay focusable while disabled. Pure prop computation.
//
// SLOT: plain-`.ts` hook; the trailing arg is the caller's slot.
import { useMemo } from 'octane';

import { S, splitSlot } from '../internal';

export interface UseFocusableWhenDisabledParameters {
	focusableWhenDisabled?: boolean;
	disabled: boolean;
	composite?: boolean;
	tabIndex?: number;
	isNativeButton: boolean;
}

export interface FocusableWhenDisabledProps {
	'aria-disabled'?: boolean;
	disabled?: boolean;
	onKeyDown: (event: KeyboardEvent) => void;
	tabIndex: number;
}

export function useFocusableWhenDisabled(...args: any[]): { props: FocusableWhenDisabledProps } {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useFocusableWhenDisabled');
	const {
		focusableWhenDisabled,
		disabled,
		composite = false,
		tabIndex: tabIndexProp = 0,
		isNativeButton,
	} = user[0] as UseFocusableWhenDisabledParameters;

	const isFocusableComposite = composite && focusableWhenDisabled !== false;
	const isNonFocusableComposite = composite && focusableWhenDisabled === false;

	// We can't explicitly assign `undefined` to any of these props — that would prevent a
	// subsequently merged prop from setting them.
	const props = useMemo(
		() => {
			const additionalProps = {
				onKeyDown(event: KeyboardEvent) {
					if (disabled && focusableWhenDisabled && event.key !== 'Tab') {
						event.preventDefault();
					}
				},
			} as FocusableWhenDisabledProps;

			if (!composite) {
				additionalProps.tabIndex = tabIndexProp;
				if (!isNativeButton && disabled) {
					additionalProps.tabIndex = focusableWhenDisabled ? tabIndexProp : -1;
				}
			}

			if (
				(isNativeButton && (focusableWhenDisabled || isFocusableComposite)) ||
				(!isNativeButton && disabled)
			) {
				additionalProps['aria-disabled'] = disabled;
			}

			if (isNativeButton && (!focusableWhenDisabled || isNonFocusableComposite)) {
				additionalProps.disabled = disabled;
			}

			return additionalProps;
		},
		[
			composite,
			disabled,
			focusableWhenDisabled,
			isFocusableComposite,
			isNonFocusableComposite,
			isNativeButton,
			tabIndexProp,
		],
		slot,
	);

	return { props };
}
