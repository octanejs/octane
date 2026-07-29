import { useCallback, useEffect, useRef, useState } from 'octane';
import { useCallbackRef } from '../utils';

function containsRelatedTarget(event: FocusEvent) {
	if (event.currentTarget instanceof HTMLElement && event.relatedTarget instanceof HTMLElement) {
		return event.currentTarget.contains(event.relatedTarget);
	}

	return false;
}

export interface UseFocusWithinOptions {
	onFocus?: (event: FocusEvent) => void;
	onBlur?: (event: FocusEvent) => void;
}

export interface UseFocusWithinReturnValue<T extends HTMLElement = any> {
	ref: React.RefCallback<T | null>;
	focused: boolean;
}

export function useFocusWithin<T extends HTMLElement = any>({
	onBlur,
	onFocus,
}: UseFocusWithinOptions = {}): UseFocusWithinReturnValue<T> {
	const [focused, setFocused] = useState(false);
	const focusedRef = useRef(false);
	const previousNode = useRef<T | null>(null);

	const onFocusRef = useCallbackRef(onFocus);
	const onBlurRef = useCallbackRef(onBlur);

	const _setFocused = useCallback((value: boolean) => {
		setFocused(value);
		focusedRef.current = value;
	}, []);

	const handleFocusIn = useCallback((event: FocusEvent) => {
		if (!focusedRef.current) {
			_setFocused(true);
			onFocusRef(event);
		}
	}, []);

	const handleFocusOut = useCallback((event: FocusEvent) => {
		if (focusedRef.current && !containsRelatedTarget(event)) {
			_setFocused(false);
			onBlurRef(event);
		}
	}, []);

	const detach = useCallback(() => {
		const node = previousNode.current;
		if (node) {
			node.removeEventListener('focusin', handleFocusIn);
			node.removeEventListener('focusout', handleFocusOut);
			previousNode.current = null;
		}
	}, [handleFocusIn, handleFocusOut]);

	const callbackRef: React.RefCallback<T | null> = useCallback(
		(node) => {
			detach();
			if (!node) {
				return undefined;
			}

			node.addEventListener('focusin', handleFocusIn);
			node.addEventListener('focusout', handleFocusOut);
			previousNode.current = node;

			return () => {
				// A stale ref cleanup must not detach a replacement node.
				if (previousNode.current === node) {
					detach();
				}
			};
		},
		[handleFocusIn, handleFocusOut, detach],
	);

	useEffect(() => () => detach(), [detach]);

	return { ref: callbackRef, focused };
}

export namespace useFocusWithin {
	export type Options = UseFocusWithinOptions;
	export type ReturnValue<T extends HTMLElement> = UseFocusWithinReturnValue<T>;
}
