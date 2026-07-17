// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/toolbar/useToolbar.ts).
// octane adaptations: React's FocusEventHandler/KeyboardEventHandler → native event
// handlers (octane delegates the *Capture props natively); public-hook slot threading.
import type { AriaLabelingProps, Orientation, RefObject } from '@react-types/shared';
import { useRef, useState } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import { createFocusManager } from '../focus/FocusScope';
import { filterDOMProps } from '../utils/filterDOMProps';
import { getActiveElement, getEventTarget, nodeContains } from '../utils/shadowdom/DOMFunctions';
import { useLayoutEffect } from '../utils/useLayoutEffect';
import { useLocale } from '../i18n/I18nProvider';

export interface AriaToolbarProps extends AriaLabelingProps {
	/**
	 * The orientation of the entire toolbar.
	 *
	 * @default 'horizontal'
	 */
	orientation?: Orientation;
}

export interface ToolbarAria {
	/**
	 * Props for the toolbar container.
	 */
	toolbarProps: Record<string, any>;
}

export function useToolbar(
	props: AriaToolbarProps,
	ref: RefObject<HTMLElement | null>,
): ToolbarAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useToolbar(
	props: AriaToolbarProps,
	ref: RefObject<HTMLElement | null>,
	slot: symbol | undefined,
): ToolbarAria;
export function useToolbar(...args: any[]): ToolbarAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useToolbar');
	const props = user[0] as AriaToolbarProps;
	const ref = user[1] as RefObject<HTMLElement | null>;

	const {
		'aria-label': ariaLabel,
		'aria-labelledby': ariaLabelledBy,
		orientation = 'horizontal',
	} = props;
	let [isInToolbar, setInToolbar] = useState(false, subSlot(slot, 'inToolbar'));
	// should be safe because re-calling set state with the same value it already has is a no-op
	// this will allow us to react should a parent re-render and change its role though
	useLayoutEffect(
		() => {
			setInToolbar(!!(ref.current && ref.current.parentElement?.closest('[role="toolbar"]')));
		},
		null,
		subSlot(slot, 'detect'),
	);
	const { direction } = useLocale(subSlot(slot, 'locale'));
	const shouldReverse = direction === 'rtl' && orientation === 'horizontal';
	let focusManager = createFocusManager(ref);

	const onKeyDown = (e: KeyboardEvent) => {
		// don't handle portalled events
		if (!nodeContains(e.currentTarget as Element, getEventTarget(e) as HTMLElement)) {
			return;
		}
		if (
			(orientation === 'horizontal' && e.key === 'ArrowRight') ||
			(orientation === 'vertical' && e.key === 'ArrowDown')
		) {
			if (shouldReverse) {
				focusManager.focusPrevious();
			} else {
				focusManager.focusNext();
			}
		} else if (
			(orientation === 'horizontal' && e.key === 'ArrowLeft') ||
			(orientation === 'vertical' && e.key === 'ArrowUp')
		) {
			if (shouldReverse) {
				focusManager.focusNext();
			} else {
				focusManager.focusPrevious();
			}
		} else if (e.key === 'Tab') {
			// When the tab key is pressed, we want to move focus
			// out of the entire toolbar. To do this, move focus
			// to the first or last focusable child, and let the
			// browser handle the Tab key as usual from there.
			lastFocused.current = getActiveElement() as HTMLElement;
			if (e.shiftKey) {
				focusManager.focusFirst();
			} else {
				focusManager.focusLast();
			}
			return;
		} else {
			// if we didn't handle anything, return early so we don't preventDefault
			return;
		}

		// Prevent arrow keys from being handled by nested action groups.
		e.stopPropagation();
		e.preventDefault();
	};

	// Record the last focused child when focus moves out of the toolbar.
	const lastFocused = useRef<HTMLElement | null>(null, subSlot(slot, 'lastFocused'));
	const onBlur = (e: FocusEvent) => {
		if (
			!nodeContains(e.currentTarget as Element, e.relatedTarget as Element) &&
			!lastFocused.current
		) {
			lastFocused.current = getEventTarget(e) as HTMLElement;
		}
	};

	// Restore focus to the last focused child when focus returns into the toolbar.
	// If the element was removed, do nothing, either the first item in the first group,
	// or the last item in the last group will be focused, depending on direction.
	const onFocus = (e: FocusEvent) => {
		if (
			lastFocused.current &&
			!nodeContains(e.currentTarget as Element, e.relatedTarget as Element) &&
			nodeContains(ref.current, getEventTarget(e) as Element)
		) {
			lastFocused.current?.focus();
			lastFocused.current = null;
		}
	};

	return {
		toolbarProps: {
			...filterDOMProps(props, { labelable: true }),
			role: !isInToolbar ? 'toolbar' : 'group',
			'aria-orientation': orientation,
			'aria-label': ariaLabel,
			'aria-labelledby': ariaLabel == null ? ariaLabelledBy : undefined,
			onKeyDownCapture: !isInToolbar ? onKeyDown : undefined,
			onFocusCapture: !isInToolbar ? onFocus : undefined,
			onBlurCapture: !isInToolbar ? onBlur : undefined,
		},
	};
}
