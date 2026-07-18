// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/spinbutton/useSpinButton.ts).
// octane adaptations:
// - Handlers receive NATIVE events (there is no synthetic layer): the spinbutton keydown
//   handler is attached as a plain delegated DOM handler, so upstream's
//   `e.nativeEvent.isComposing` reads `e.isComposing` off the native KeyboardEvent.
// - The Parcel glob intl import becomes the generated src/intl/spinbutton index
//   (verbatim dictionaries).
// - `DOMAttributes` is a local structural prop-bag alias (upstream's is typed over
//   React's synthetic handlers).
// - Public-hook slot threading (splitSlot/subSlot); explicit dependency arrays are kept
//   verbatim.
import { announce, clearAnnouncer } from '../live-announcer/LiveAnnouncer';

import type { AriaButtonProps } from '../button/useButton';
import type { InputBase, RangeInputBase, Validation, ValueBase } from '@react-types/shared';
import intlMessages from '../intl/spinbutton';
import { useCallback, useEffect, useRef, useState } from 'octane';
import { useEffectEvent } from '../utils/useEffectEvent';
import { useGlobalListeners } from '../utils/useGlobalListeners';
import { useLocalizedStringFormatter } from '../i18n/useLocalizedStringFormatter';

import { S, splitSlot, subSlot } from '../internal';

// octane adaptation: minimal structural DOMAttributes (upstream's drags React's synthetic
// handler types along).
type DOMAttributes = Record<string, any>;

const noop = () => {};

export interface SpinButtonProps
	extends InputBase, Validation<number>, ValueBase<number>, RangeInputBase<number> {
	textValue?: string;
	onIncrement?: () => void;
	onIncrementPage?: () => void;
	onDecrement?: () => void;
	onDecrementPage?: () => void;
	onDecrementToMin?: () => void;
	onIncrementToMax?: () => void;
}

export interface SpinbuttonAria {
	spinButtonProps: DOMAttributes;
	incrementButtonProps: AriaButtonProps;
	decrementButtonProps: AriaButtonProps;
}

export function useSpinButton(props: SpinButtonProps): SpinbuttonAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useSpinButton(props: SpinButtonProps, slot: symbol | undefined): SpinbuttonAria;
export function useSpinButton(...args: any[]): SpinbuttonAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useSpinButton');
	const props = user[0] as SpinButtonProps;

	const _async = useRef<number | undefined>(undefined, subSlot(slot, 'async'));
	let {
		value,
		textValue,
		minValue,
		maxValue,
		isDisabled,
		isReadOnly,
		isRequired,
		onIncrement,
		onIncrementPage,
		onDecrement,
		onDecrementPage,
		onDecrementToMin,
		onIncrementToMax,
	} = props;
	const stringFormatter = useLocalizedStringFormatter(
		intlMessages,
		'@react-aria/spinbutton',
		subSlot(slot, 'strings'),
	);

	let isSpinning = useRef(false, subSlot(slot, 'isSpinning'));
	const clearAsync = useCallback(
		() => {
			clearTimeout(_async.current);
			isSpinning.current = false;
		},
		[],
		subSlot(slot, 'clearAsync'),
	);
	const clearAsyncEvent = useEffectEvent(
		() => {
			clearAsync();
		},
		subSlot(slot, 'clearAsyncEvent'),
	);

	useEffect(
		() => {
			return () => clearAsyncEvent();
		},
		[],
		subSlot(slot, 'unmountFx'),
	);

	let onKeyDown = (e: KeyboardEvent) => {
		// octane adaptation: `e.nativeEvent.isComposing` → the native event's own flag.
		if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || isReadOnly || e.isComposing) {
			return;
		}

		switch (e.key) {
			case 'PageUp':
				if (onIncrementPage) {
					e.preventDefault();
					onIncrementPage?.();
					break;
				}
			// fallthrough!
			case 'ArrowUp':
			case 'Up':
				if (onIncrement) {
					e.preventDefault();
					onIncrement?.();
				}
				break;
			case 'PageDown':
				if (onDecrementPage) {
					e.preventDefault();
					onDecrementPage?.();
					break;
				}
			// fallthrough
			case 'ArrowDown':
			case 'Down':
				if (onDecrement) {
					e.preventDefault();
					onDecrement?.();
				}
				break;
			case 'Home':
				if (onDecrementToMin) {
					e.preventDefault();
					onDecrementToMin?.();
				}
				break;
			case 'End':
				if (onIncrementToMax) {
					e.preventDefault();
					onIncrementToMax?.();
				}
				break;
		}
	};

	let isFocused = useRef(false, subSlot(slot, 'isFocused'));
	let onFocus = () => {
		isFocused.current = true;
	};

	let onBlur = () => {
		isFocused.current = false;
	};

	// Replace Unicode hyphen-minus (U+002D) with minus sign (U+2212).
	// This ensures that macOS VoiceOver announces it as "minus" even with other characters between the minus sign
	// and the number (e.g. currency symbol). Otherwise it announces nothing because it assumes the character is a hyphen.
	// In addition, replace the empty string with the word "Empty" so that iOS VoiceOver does not read "50%" for an empty field.
	let ariaTextValue =
		textValue === ''
			? stringFormatter.format('Empty')
			: (textValue || `${value}`).replace('-', '\u2212');

	useEffect(
		() => {
			if (isFocused.current) {
				clearAnnouncer('assertive');
				announce(ariaTextValue, 'assertive');
			}
		},
		[ariaTextValue],
		subSlot(slot, 'announceFx'),
	);

	// For touch users, if they move their finger like they're scrolling, we don't want to trigger a spin.
	let onPointerCancel = useCallback(
		() => {
			clearAsync();
		},
		[clearAsync],
		subSlot(slot, 'pointerCancel'),
	);

	const onIncrementEvent = useEffectEvent(onIncrement ?? noop, subSlot(slot, 'incEvent'));
	const onDecrementEvent = useEffectEvent(onDecrement ?? noop, subSlot(slot, 'decEvent'));

	const stepUpEvent = useEffectEvent(
		() => {
			if (
				maxValue === undefined ||
				isNaN(maxValue) ||
				value === undefined ||
				isNaN(value) ||
				value < maxValue
			) {
				onIncrementEvent();
				onIncrementPressStartEvent(60);
			}
		},
		subSlot(slot, 'stepUp'),
	);

	const onIncrementPressStartEvent = useEffectEvent(
		(initialStepDelay: number) => {
			clearAsyncEvent();
			isSpinning.current = true;
			// Start spinning after initial delay
			_async.current = window.setTimeout(stepUpEvent, initialStepDelay);
		},
		subSlot(slot, 'incPressStart'),
	);

	const stepDownEvent = useEffectEvent(
		() => {
			if (
				minValue === undefined ||
				isNaN(minValue) ||
				value === undefined ||
				isNaN(value) ||
				value > minValue
			) {
				onDecrementEvent();
				onDecrementPressStartEvent(60);
			}
		},
		subSlot(slot, 'stepDown'),
	);

	const onDecrementPressStartEvent = useEffectEvent(
		(initialStepDelay: number) => {
			clearAsyncEvent();
			isSpinning.current = true;
			// Start spinning after initial delay
			_async.current = window.setTimeout(stepDownEvent, initialStepDelay);
		},
		subSlot(slot, 'decPressStart'),
	);

	let cancelContextMenu = (e: Event) => {
		e.preventDefault();
	};

	let { addGlobalListener, removeAllGlobalListeners } = useGlobalListeners(
		subSlot(slot, 'globalListeners'),
	);

	// Tracks in touch if the press end event was preceded by a press up.
	// If it wasn't, then we know the finger left the button while still in contact with the screen.
	// This means that the user is trying to scroll or interact in some way that shouldn't trigger
	// an increment or decrement.
	let isUp = useRef(false, subSlot(slot, 'isUp'));

	let [isIncrementPressed, setIsIncrementPressed] = useState<'touch' | 'mouse' | null>(
		null,
		subSlot(slot, 'incPressed'),
	);
	useEffect(
		() => {
			if (isIncrementPressed === 'touch') {
				onIncrementPressStartEvent(600);
			} else if (isIncrementPressed) {
				onIncrementPressStartEvent(400);
			} else if (!isIncrementPressed) {
				clearAsyncEvent();
			}
		},
		[isIncrementPressed],
		subSlot(slot, 'incPressedFx'),
	);

	let [isDecrementPressed, setIsDecrementPressed] = useState<'touch' | 'mouse' | null>(
		null,
		subSlot(slot, 'decPressed'),
	);
	useEffect(
		() => {
			if (isDecrementPressed === 'touch') {
				onDecrementPressStartEvent(600);
			} else if (isDecrementPressed) {
				onDecrementPressStartEvent(400);
			} else if (!isDecrementPressed) {
				clearAsyncEvent();
			}
		},
		[isDecrementPressed],
		subSlot(slot, 'decPressedFx'),
	);

	return {
		spinButtonProps: {
			role: 'spinbutton',
			'aria-valuenow': value !== undefined && !isNaN(value) ? value : undefined,
			'aria-valuetext': ariaTextValue,
			'aria-valuemin': minValue,
			'aria-valuemax': maxValue,
			'aria-disabled': isDisabled || undefined,
			'aria-readonly': isReadOnly || undefined,
			'aria-required': isRequired || undefined,
			onKeyDown,
			onFocus,
			onBlur,
		},
		incrementButtonProps: {
			onPressStart: (e) => {
				clearAsync();
				if (e.pointerType !== 'touch') {
					onIncrement?.();
					setIsIncrementPressed('mouse');
				} else {
					addGlobalListener(window, 'pointercancel', onPointerCancel, { capture: true });
					isUp.current = false;
					// For touch users, don't trigger a decrement on press start, we'll wait for the press end to trigger it if
					// the control isn't spinning.
					setIsIncrementPressed('touch');
				}
				addGlobalListener(window, 'contextmenu', cancelContextMenu);
			},
			onPressUp: (e) => {
				clearAsync();
				if (e.pointerType === 'touch') {
					isUp.current = true;
				}
				removeAllGlobalListeners();
				setIsIncrementPressed(null);
			},
			onPressEnd: (e) => {
				clearAsync();
				if (e.pointerType === 'touch') {
					if (!isSpinning.current && isUp.current) {
						onIncrement?.();
					}
				}
				isUp.current = false;
				setIsIncrementPressed(null);
			},
			onFocus,
			onBlur,
		},
		decrementButtonProps: {
			onPressStart: (e) => {
				clearAsync();
				if (e.pointerType !== 'touch') {
					onDecrement?.();
					setIsDecrementPressed('mouse');
				} else {
					addGlobalListener(window, 'pointercancel', onPointerCancel, { capture: true });
					isUp.current = false;
					// For touch users, don't trigger a decrement on press start, we'll wait for the press end to trigger it if
					// the control isn't spinning.
					setIsDecrementPressed('touch');
				}
			},
			onPressUp: (e) => {
				clearAsync();
				if (e.pointerType === 'touch') {
					isUp.current = true;
				}
				removeAllGlobalListeners();
				setIsDecrementPressed(null);
			},
			onPressEnd: (e) => {
				clearAsync();
				if (e.pointerType === 'touch') {
					if (!isSpinning.current && isUp.current) {
						onDecrement?.();
					}
				}
				isUp.current = false;
				setIsDecrementPressed(null);
			},
			onFocus,
			onBlur,
		},
	};
}
