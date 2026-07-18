// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/selection/useTypeSelect.ts).
// octane adaptations:
// - Handlers receive NATIVE KeyboardEvents (there is no synthetic layer). The
//   `'continuePropagation' in e` probes port verbatim: they distinguish events wrapped by
//   the ported useKeyboard machinery (whose BaseEvent shim carries continuePropagation/
//   isPropagationStopped) from plain delegated events.
// - `e.currentTarget` casts to Element (octane's delegated dispatch guarantees the
//   per-handler currentTarget; native types say EventTarget | null).
// - Public-hook slot threading (splitSlot/subSlot) per the binding convention.
// - MultipleSelectionManager type from the ported stately selection types.
import type { Key, KeyboardDelegate } from '@react-types/shared';
import { getEventTarget, nodeContains } from '../utils/shadowdom/DOMFunctions';
import { useEffect, useRef } from 'octane';
import type { MultipleSelectionManager } from '../stately/selection/types';

import { S, splitSlot, subSlot } from '../internal';

// octane adaptation: minimal structural DOMAttributes (upstream's drags React's synthetic
// handler types along).
type DOMAttributes = Record<string, any>;

/**
 * Controls how long to wait before clearing the typeahead buffer.
 */
const TYPEAHEAD_DEBOUNCE_WAIT_MS = 1000; // 1 second

export interface AriaTypeSelectOptions {
	/**
	 * A delegate that returns collection item keys with respect to visual layout.
	 */
	keyboardDelegate: KeyboardDelegate;
	/**
	 * An interface for reading and updating multiple selection state.
	 */
	selectionManager: MultipleSelectionManager;
	/**
	 * Called when an item is focused by typing.
	 */
	onTypeSelect?: (key: Key) => void;
}

export interface TypeSelectAria {
	/**
	 * Props to be spread on the owner of the options.
	 */
	typeSelectProps: DOMAttributes;
}

/**
 * Handles typeahead interactions with collections.
 */
export function useTypeSelect(options: AriaTypeSelectOptions): TypeSelectAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useTypeSelect(
	options: AriaTypeSelectOptions,
	slot: symbol | undefined,
): TypeSelectAria;
export function useTypeSelect(...args: any[]): TypeSelectAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useTypeSelect');
	const options = user[0] as AriaTypeSelectOptions;

	let { keyboardDelegate, selectionManager, onTypeSelect } = options;
	let state = useRef<{ search: string; timeout: ReturnType<typeof setTimeout> | undefined }>(
		{
			search: '',
			timeout: undefined,
		},
		subSlot(slot, 'state'),
	);

	let onKeyDownCapture = (e: KeyboardEvent) => {
		// if we're in the middle of a search, then a spacebar should be treated as a search and we should not propagate the event
		// since we handle this one in a capture phase, we should ignore it in the bubble phase
		if (state.current.search.length > 0 && e.key === ' ') {
			e.preventDefault();
			if (
				!('continuePropagation' in e) ||
				('continuePropagation' in e && !(e as any).isPropagationStopped())
			) {
				e.stopPropagation();
			}
			state.current.search += ' ';

			if (keyboardDelegate.getKeyForSearch != null) {
				// Use the delegate to find a key to focus.
				// Prioritize items after the currently focused item, falling back to searching the whole list.
				let key = keyboardDelegate.getKeyForSearch(
					state.current.search,
					selectionManager.focusedKey,
				);

				// If no key found, search from the top.
				if (key == null) {
					key = keyboardDelegate.getKeyForSearch(state.current.search);
				}

				if (key != null) {
					selectionManager.setFocusedKey(key);
					if (onTypeSelect) {
						onTypeSelect(key);
					}
				}
			}

			clearTimeout(state.current.timeout);
			state.current.timeout = setTimeout(() => {
				state.current.search = '';
			}, TYPEAHEAD_DEBOUNCE_WAIT_MS);
		}
	};

	let onKeyDown = (e: KeyboardEvent) => {
		let character = getStringForKey(e.key);
		if (
			!character ||
			e.ctrlKey ||
			e.metaKey ||
			e.altKey ||
			!nodeContains(e.currentTarget as Element, getEventTarget(e) as HTMLElement) ||
			(state.current.search.length === 0 && character === ' ')
		) {
			return;
		}

		state.current.search += character;

		if (keyboardDelegate.getKeyForSearch != null) {
			// Use the delegate to find a key to focus.
			// Prioritize items after the currently focused item, falling back to searching the whole list.
			let key = keyboardDelegate.getKeyForSearch(state.current.search, selectionManager.focusedKey);

			if (key == null) {
				key = keyboardDelegate.getKeyForSearch(state.current.search);
			}

			if (key != null) {
				selectionManager.setFocusedKey(key);
				if (onTypeSelect) {
					onTypeSelect(key);
				}
				e.preventDefault();
				if (!('continuePropagation' in e)) {
					e.stopPropagation();
				}
			} else {
				// if still nothing then the type to select is done and everything is reset
				state.current.search = '';
				clearTimeout(state.current.timeout);
				state.current.timeout = undefined;
				return;
			}
		}

		clearTimeout(state.current.timeout);
		state.current.timeout = setTimeout(() => {
			state.current.search = '';
		}, TYPEAHEAD_DEBOUNCE_WAIT_MS);
	};

	useEffect(
		() => {
			let timeout = state.current.timeout;
			return () => {
				clearTimeout(timeout);
			};
		},
		[state],
		subSlot(slot, 'teardown'),
	);

	return {
		typeSelectProps: {
			// Using a capturing listener to catch the keydown event before
			// other hooks in order to handle the Spacebar event.
			onKeyDownCapture: keyboardDelegate.getKeyForSearch ? onKeyDownCapture : undefined,
			onKeyDown: keyboardDelegate.getKeyForSearch ? onKeyDown : undefined,
		},
	};
}

function getStringForKey(key: string) {
	// If the key is of length 1, it is an ASCII value.
	// Otherwise, if there are no ASCII characters in the key name,
	// it is a Unicode character.
	// See https://www.w3.org/TR/uievents-key/
	if (key.length === 1 || !/^[A-Z]/i.test(key)) {
		return key;
	}

	return '';
}
