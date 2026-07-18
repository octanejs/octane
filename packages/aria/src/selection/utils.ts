// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/selection/utils.ts).
// octane adaptations: public-hook slot threading (splitSlot/subSlot) for useCollectionId per
// the binding convention; RefObject type from @react-types/shared (upstream: React's RefObject).
import type { Collection, Key, RefObject } from '@react-types/shared';
import { isAppleDevice } from '../utils/platform';

import { S, splitSlot, subSlot } from '../internal';
import { useId } from '../utils/useId';

interface Event {
	altKey: boolean;
	ctrlKey: boolean;
	metaKey: boolean;
}

export function isNonContiguousSelectionModifier(e: Event): boolean {
	// Ctrl + Arrow Up/Arrow Down has a system wide meaning on macOS, so use Alt instead.
	// On Windows and Ubuntu, Alt + Space has a system wide meaning.
	return isAppleDevice() ? e.altKey : e.ctrlKey;
}

export function getItemElement(
	collectionRef: RefObject<HTMLElement | null>,
	key: Key,
): Element | null | undefined {
	let selector = `[data-key="${CSS.escape(String(key))}"]`;
	let collection = collectionRef.current?.dataset.collection;
	if (collection) {
		selector = `[data-collection="${CSS.escape(collection)}"]${selector}`;
	}
	return collectionRef.current?.querySelector(selector);
}

const collectionMap = new WeakMap<Collection<any>, string>();
export function useCollectionId(collection: Collection<any>): string;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useCollectionId(collection: Collection<any>, slot: symbol | undefined): string;
export function useCollectionId(...args: any[]): string {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useCollectionId');
	const collection = user[0] as Collection<any>;

	let id = useId(undefined, subSlot(slot, 'id'));
	collectionMap.set(collection, id);
	return id;
}

export function getCollectionId(collection: Collection<any>): string {
	return collectionMap.get(collection)!;
}
