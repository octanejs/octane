// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/dialog/useDialog.ts).
// octane adaptations: `DOMAttributes` is a local structural prop-bag alias (upstream's is typed
// over React's synthetic handlers); the onBlur handler receives a NATIVE DOM FocusEvent (no
// synthetic layer); `useEffect`/`useRef` import from 'octane'; the dep-less dev-warning
// `useEffect` gets an explicit `null` dep arg (the explicit `[ref]` dep array is kept verbatim);
// public-hook slot threading (splitSlot/subSlot) per the binding convention — sibling ported
// hooks (useSlotId, useOverlayFocusContain) receive a derived sub-slot as their trailing arg.
import type { AriaLabelingProps, DOMProps, FocusableElement, RefObject } from '@react-types/shared';
import { filterDOMProps } from '../utils/filterDOMProps';
import { focusSafely } from '../interactions/focusSafely';
import { getActiveElement, isFocusWithin } from '../utils/shadowdom/DOMFunctions';
import { useEffect, useRef } from 'octane';
import { useOverlayFocusContain } from '../overlays/Overlay';
import { useSlotId } from '../utils/useId';

import { S, splitSlot, subSlot } from '../internal';

// octane adaptation: minimal structural DOMAttributes (upstream's drags React's synthetic
// handler types along).
type DOMAttributes = Record<string, any>;

export interface AriaDialogProps extends DOMProps, AriaLabelingProps {
	/**
	 * The accessibility role for the dialog.
	 *
	 * @default 'dialog'
	 */
	role?: 'dialog' | 'alertdialog';
}

export interface DialogAria {
	/** Props for the dialog container element. */
	dialogProps: DOMAttributes;

	/** Props for the dialog title element. */
	titleProps: DOMAttributes;
}

/**
 * Provides the behavior and accessibility implementation for a dialog component.
 * A dialog is an overlay shown above other content in an application.
 */
export function useDialog(
	props: AriaDialogProps,
	ref: RefObject<FocusableElement | null>,
): DialogAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useDialog(
	props: AriaDialogProps,
	ref: RefObject<FocusableElement | null>,
	slot: symbol | undefined,
): DialogAria;
export function useDialog(...args: any[]): DialogAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useDialog');
	const props = user[0] as AriaDialogProps;
	const ref = user[1] as RefObject<FocusableElement | null>;

	let { role = 'dialog' } = props;
	let titleId: string | undefined = useSlotId(undefined, subSlot(slot, 'title'));
	titleId = props['aria-label'] ? undefined : titleId;

	let isRefocusing = useRef(false, subSlot(slot, 'refocusing'));

	// Focus the dialog itself on mount, unless a child element is already focused.
	useEffect(
		() => {
			if (ref.current && !isFocusWithin(ref.current)) {
				focusSafely(ref.current);

				// Safari on iOS does not move the VoiceOver cursor to the dialog
				// or announce that it has opened until it has rendered. A workaround
				// is to wait for half a second, then blur and re-focus the dialog.
				let timeout = setTimeout(() => {
					// Check that the dialog is still focused, or focused was lost to the body.
					if (getActiveElement() === ref.current || getActiveElement() === document.body) {
						isRefocusing.current = true;
						if (ref.current) {
							ref.current.blur();
							focusSafely(ref.current);
						}
						isRefocusing.current = false;
					}
				}, 500);

				return () => {
					clearTimeout(timeout);
				};
			}
		},
		[ref],
		subSlot(slot, 'autofocus'),
	);

	useOverlayFocusContain(subSlot(slot, 'focusContain'));

	// Warn in dev mode if the dialog has no accessible title.
	// This catches a common mistake where useDialog and useOverlayTriggerState
	// are used in the same component, causing the title element to not be
	// in the DOM when useSlotId queries for it.
	// Check the DOM element directly since aria-labelledby may be added by
	// wrapper components (e.g. RAC Dialog uses trigger ID as a fallback).
	let hasWarned = useRef(false, subSlot(slot, 'warned'));
	useEffect(
		() => {
			if (process.env.NODE_ENV !== 'production' && !hasWarned.current && ref.current) {
				let el = ref.current;
				let hasAriaLabel = el.hasAttribute('aria-label');
				let hasAriaLabelledby = el.hasAttribute('aria-labelledby');
				if (!hasAriaLabel && !hasAriaLabelledby) {
					console.warn(
						'A dialog must have a title for accessibility. ' +
							'Either provide an aria-label or aria-labelledby prop, or render a heading element inside the dialog.',
					);
					hasWarned.current = true;
				}
			}
		},
		null,
		subSlot(slot, 'warn'),
	);

	// We do not use aria-modal due to a Safari bug which forces the first focusable element to be focused
	// on mount when inside an iframe, no matter which element we programmatically focus.
	// See https://bugs.webkit.org/show_bug.cgi?id=211934.
	// useModal sets aria-hidden on all elements outside the dialog, so the dialog will behave as a modal
	// even without aria-modal on the dialog itself.
	return {
		dialogProps: {
			...filterDOMProps(props, { labelable: true }),
			role,
			tabIndex: -1,
			'aria-labelledby': props['aria-labelledby'] || titleId,
			// Prevent blur events from reaching useOverlay, which may cause
			// popovers to close. Since focus is contained within the dialog,
			// we don't want this to occur due to the above useEffect.
			onBlur: (e: any) => {
				if (isRefocusing.current) {
					e.stopPropagation();
				}
			},
		},
		titleProps: {
			id: titleId,
		},
	};
}
