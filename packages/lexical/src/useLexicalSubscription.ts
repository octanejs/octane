import type { LexicalEditor } from 'lexical';
import { useMemo, useRef, useState, useLayoutEffect } from 'octane';

import { useLexicalComposerContext } from './LexicalComposerContext';
import { subSlot } from './shared/internal';

// Ported from @lexical/react/src/useLexicalSubscription.tsx. A plain `.ts` hook:
// the caller's compiled call site injects `slot` as the trailing arg, and each
// composed base hook gets a distinct sub-slot (per-call-site identity).

export type LexicalSubscription<T> = {
	initialValueFn: () => T;
	subscribe: (callback: (value: T) => void) => () => void;
};

/**
 * Shortcut to Lexical subscriptions when values are used for render.
 * @param subscription - Creates the {@link LexicalSubscription}. Its identity must
 *   be stable (module scope or `useCallback`).
 */
export function useLexicalSubscription<T>(
	subscription: (editor: LexicalEditor) => LexicalSubscription<T>,
	slot?: symbol,
): T {
	const [editor] = useLexicalComposerContext();
	const initializedSubscription = useMemo(
		() => subscription(editor),
		[editor, subscription],
		subSlot(slot, 'uls:memo'),
	);
	const [value, setValue] = useState<T>(
		() => initializedSubscription.initialValueFn(),
		subSlot(slot, 'uls:state'),
	);
	const valueRef = useRef<T>(value, subSlot(slot, 'uls:ref'));
	useLayoutEffect(
		() => {
			const { initialValueFn, subscribe } = initializedSubscription;
			const currentValue = initialValueFn();
			if (valueRef.current !== currentValue) {
				valueRef.current = currentValue;
				setValue(currentValue);
			}

			return subscribe((newValue: T) => {
				valueRef.current = newValue;
				setValue(newValue);
			});
		},
		[initializedSubscription, subscription],
		subSlot(slot, 'uls:le'),
	);

	return value;
}
