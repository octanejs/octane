// Ported from react-stately (source: .react-spectrum/packages/react-stately/src/selection/Selection.ts).
// Verbatim (no React surface).
import type { Key } from '@react-types/shared';

/**
 * A Selection is a special Set containing Keys, which also has an anchor
 * and current selected key for use when range selecting.
 */
export class Selection extends Set<Key> {
	anchorKey: Key | null;
	currentKey: Key | null;

	constructor(keys?: Iterable<Key> | Selection, anchorKey?: Key | null, currentKey?: Key | null) {
		super(keys);
		if (keys instanceof Selection) {
			this.anchorKey = anchorKey ?? keys.anchorKey;
			this.currentKey = currentKey ?? keys.currentKey;
		} else {
			this.anchorKey = anchorKey ?? null;
			this.currentKey = currentKey ?? null;
		}
	}
}
