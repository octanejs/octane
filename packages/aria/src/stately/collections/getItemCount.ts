// Ported from react-stately (source: .react-spectrum/packages/react-stately/src/collections/getItemCount.ts).
// Verbatim (no React surface).
import type { Collection, Node } from '@react-types/shared';
import { getChildNodes } from './getChildNodes';

const cache = new WeakMap<Iterable<unknown>, number>();

export function getItemCount<T>(collection: Collection<Node<T>>): number {
	let count = cache.get(collection);
	if (count != null) {
		return count;
	}

	// TS isn't smart enough to know we've ensured count is a number, so use a new variable
	let counter = 0;
	let countItems = (items: Iterable<Node<T>>) => {
		for (let item of items) {
			if (item.type === 'section') {
				countItems(getChildNodes(item, collection));
			} else if (item.type === 'item') {
				counter++;
			}
		}
	};

	countItems(collection);
	cache.set(collection, counter);
	return counter;
}
