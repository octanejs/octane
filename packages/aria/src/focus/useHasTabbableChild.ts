// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/focus/useHasTabbableChild.ts).
// octane adaptations:
// - Public-hook slot threading (splitSlot/subSlot) per the binding convention.
// - Upstream's no-deps `useLayoutEffect` (re-runs after every render) becomes an explicit
//   `null` deps argument — octane's convention for run-every-render effects.

import { getFocusableTreeWalker } from './FocusScope';
import type { RefObject } from '@react-types/shared';
import { useState } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import { useLayoutEffect } from '../utils/useLayoutEffect';

interface AriaHasTabbableChildOptions {
	isDisabled?: boolean;
}

// This was created for a special empty case of a component that can have child or
// be empty, like Collection/Virtualizer/Table/ListView/etc. When these components
// are empty they can have a message with a tabbable element, which is like them
// being not empty, when it comes to focus and tab order.

/**
 * Returns whether an element has a tabbable child, and updates as children change.
 *
 * @private
 */
export function useHasTabbableChild(
	ref: RefObject<Element | null>,
	options?: AriaHasTabbableChildOptions,
): boolean;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useHasTabbableChild(
	ref: RefObject<Element | null>,
	options: AriaHasTabbableChildOptions | undefined,
	slot: symbol | undefined,
): boolean;
export function useHasTabbableChild(...args: any[]): boolean {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useHasTabbableChild');
	const ref = user[0] as RefObject<Element | null>;
	const options = user[1] as AriaHasTabbableChildOptions | undefined;

	let isDisabled = options?.isDisabled;
	let [hasTabbableChild, setHasTabbableChild] = useState(false, subSlot(slot, 'has'));

	useLayoutEffect(
		() => {
			if (ref?.current && !isDisabled) {
				let update = () => {
					if (ref.current) {
						let walker = getFocusableTreeWalker(ref.current, { tabbable: true });
						setHasTabbableChild(!!walker.nextNode());
					}
				};

				update();

				// Update when new elements are inserted, or the tabIndex/disabled attribute updates.
				let observer = new MutationObserver(update);
				observer.observe(ref.current, {
					subtree: true,
					childList: true,
					attributes: true,
					attributeFilter: ['tabIndex', 'disabled'],
				});

				return () => {
					// Disconnect mutation observer when an update occurs on the top-level component
					// so we update synchronously after re-rendering. Otherwise React will emit act warnings
					// in tests since mutation observers fire asynchronously. The mutation observer is necessary
					// so we also update if a child component re-renders and adds/removes something tabbable.
					observer.disconnect();
				};
			}
		},
		null,
		subSlot(slot, 'observe'),
	);

	return isDisabled ? false : hasTabbableChild;
}
