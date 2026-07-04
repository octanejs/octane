// Ported from .base-ui/packages/react/src/internals/use-button/useButton.ts (v1.6.0).
// Produces `getButtonProps` (a prop-merger that adds `type="button"`/`role="button"`,
// the disabled/aria/tabIndex props, and keyboard-accessibility handlers) plus a
// `buttonRef`. octane adaptations: events are NATIVE (not synthetic), so the handlers act
// on the native event directly and `makeEventPreventable` shims `preventBaseUIHandler` /
// `baseUIHandlerPrevented` onto it; the dev native-<button> warning is dropped.
//
// SLOT: plain-`.ts` hook; the trailing arg is the caller's slot.
import { useCallback, useLayoutEffect, useRef } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import { mergeProps, makeEventPreventable } from './mergeProps';
import { useCompositeRootContext } from './CompositeRootContext';
import { useFocusableWhenDisabled } from './useFocusableWhenDisabled';
import { useStableCallback } from './useStableCallback';

export interface UseButtonParameters {
	disabled?: boolean;
	focusableWhenDisabled?: boolean;
	tabIndex?: number;
	native?: boolean;
	composite?: boolean;
}

export interface UseButtonReturnValue {
	getButtonProps: (externalProps?: Record<string, any>) => Record<string, any>;
	buttonRef: (element: HTMLElement | null) => void;
}

function isButtonElement(elem: Element | null): elem is HTMLButtonElement {
	return elem != null && elem instanceof HTMLElement && elem.tagName === 'BUTTON';
}

function isValidLinkElement(elem: Element | null): elem is HTMLAnchorElement {
	return Boolean(elem != null && elem.tagName === 'A' && (elem as HTMLAnchorElement).href);
}

export function useButton(...args: any[]): UseButtonReturnValue {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useButton');
	const {
		disabled = false,
		focusableWhenDisabled,
		tabIndex = 0,
		native: isNativeButton = true,
		composite: compositeProp,
	} = (user[0] as UseButtonParameters) ?? {};

	const elementRef = useRef<HTMLElement | null>(null, subSlot(slot, 'el'));

	const compositeRootContext = useCompositeRootContext(true);
	const isCompositeItem = compositeProp ?? compositeRootContext !== undefined;

	const { props: focusableWhenDisabledProps } = useFocusableWhenDisabled(
		{ focusableWhenDisabled, disabled, composite: isCompositeItem, tabIndex, isNativeButton },
		subSlot(slot, 'fwd'),
	);

	// Handle a disabled composite button that renders another button — the `disabled` prop
	// passes through two `useButton`s, then the attribute is removed from the DOM.
	const updateDisabled = useCallback(
		() => {
			const element = elementRef.current;
			if (!isButtonElement(element)) {
				return;
			}
			if (
				isCompositeItem &&
				disabled &&
				(focusableWhenDisabledProps as any).disabled === undefined &&
				element.disabled
			) {
				element.disabled = false;
			}
		},
		[disabled, (focusableWhenDisabledProps as any).disabled, isCompositeItem],
		subSlot(slot, 'upd'),
	);

	useLayoutEffect(updateDisabled, [updateDisabled], subSlot(slot, 'e:upd'));

	const getButtonProps = useCallback(
		(externalProps: Record<string, any> = {}) => {
			const {
				onClick: externalOnClick,
				onMouseDown: externalOnMouseDown,
				onKeyUp: externalOnKeyUp,
				onKeyDown: externalOnKeyDown,
				onPointerDown: externalOnPointerDown,
				...otherExternalProps
			} = externalProps;

			return mergeProps(
				{
					onClick(event: any) {
						if (disabled) {
							event.preventDefault();
							return;
						}
						externalOnClick?.(event);
					},
					onMouseDown(event: any) {
						if (!disabled) {
							externalOnMouseDown?.(event);
						}
					},
					onKeyDown(event: any) {
						if (disabled) {
							return;
						}

						makeEventPreventable(event);
						externalOnKeyDown?.(event);
						if (event.baseUIHandlerPrevented) {
							return;
						}

						const isCurrentTarget = event.target === event.currentTarget;
						const currentTarget = event.currentTarget as HTMLElement;
						const isButton = isButtonElement(currentTarget);
						const isLink = !isNativeButton && isValidLinkElement(currentTarget);
						const shouldClick = isCurrentTarget && (isNativeButton ? isButton : !isLink);
						const isEnterKey = event.key === 'Enter';
						const isSpaceKey = event.key === ' ';
						const role = currentTarget.getAttribute('role');
						const isTextNavigationRole =
							role?.startsWith('menuitem') || role === 'option' || role === 'gridcell';

						if (isCurrentTarget && isCompositeItem && isSpaceKey) {
							if (event.defaultPrevented && isTextNavigationRole) {
								return;
							}

							event.preventDefault();

							if (isLink || (isNativeButton && isButton)) {
								currentTarget.click();
								event.preventBaseUIHandler();
							} else if (shouldClick) {
								externalOnClick?.(event);
								event.preventBaseUIHandler();
							}

							return;
						}

						// Keyboard accessibility for native and non-native elements.
						if (shouldClick) {
							if (!isNativeButton && (isSpaceKey || isEnterKey)) {
								event.preventDefault();
							}
							if (!isNativeButton && isEnterKey) {
								externalOnClick?.(event);
							}
						}
					},
					onKeyUp(event: any) {
						if (disabled) {
							return;
						}

						// preventDefault in keyUp on a <button> won't dispatch a click if Space is pressed.
						makeEventPreventable(event);
						externalOnKeyUp?.(event);

						if (
							event.target === event.currentTarget &&
							isNativeButton &&
							isCompositeItem &&
							isButtonElement(event.currentTarget as HTMLElement) &&
							event.key === ' '
						) {
							event.preventDefault();
							return;
						}

						if (event.baseUIHandlerPrevented) {
							return;
						}

						// Keyboard accessibility for non-interactive elements.
						if (
							event.target === event.currentTarget &&
							!isNativeButton &&
							!isCompositeItem &&
							event.key === ' '
						) {
							externalOnClick?.(event);
						}
					},
					onPointerDown(event: any) {
						if (disabled) {
							event.preventDefault();
							return;
						}
						externalOnPointerDown?.(event);
					},
				},
				isNativeButton ? { type: 'button' } : { role: 'button' },
				focusableWhenDisabledProps,
				otherExternalProps,
			);
		},
		[disabled, focusableWhenDisabledProps, isCompositeItem, isNativeButton],
		subSlot(slot, 'gbp'),
	);

	const buttonRef = useStableCallback(
		(element: HTMLElement | null) => {
			elementRef.current = element;
			updateDisabled();
		},
		subSlot(slot, 'ref'),
	);

	return { getButtonProps, buttonRef };
}
