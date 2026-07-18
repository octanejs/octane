// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/tabs/TabsKeyboardDelegate.ts).
// No octane adaptations required: a plain class over @react-types/shared types.
import type {
	Collection,
	Direction,
	Key,
	KeyboardDelegate,
	Node,
	Orientation,
} from '@react-types/shared';

export class TabsKeyboardDelegate<T> implements KeyboardDelegate {
	private collection: Collection<Node<T>>;
	private flipDirection: boolean;
	private disabledKeys: Set<Key>;
	private tabDirection: boolean;

	constructor(
		collection: Collection<Node<T>>,
		direction: Direction,
		orientation: Orientation,
		disabledKeys: Set<Key> = new Set(),
	) {
		this.collection = collection;
		this.flipDirection = direction === 'rtl' && orientation === 'horizontal';
		this.disabledKeys = disabledKeys;
		this.tabDirection = orientation === 'horizontal';
	}

	getKeyLeftOf(key: Key): Key | null {
		if (this.flipDirection) {
			return this.getNextKey(key);
		}
		return this.getPreviousKey(key);
	}

	getKeyRightOf(key: Key): Key | null {
		if (this.flipDirection) {
			return this.getPreviousKey(key);
		}
		return this.getNextKey(key);
	}

	private isDisabled(key: Key) {
		return this.disabledKeys.has(key) || !!this.collection.getItem(key)?.props?.isDisabled;
	}

	getFirstKey(): Key | null {
		let key = this.collection.getFirstKey();
		if (key != null && this.isDisabled(key)) {
			key = this.getNextKey(key);
		}
		return key;
	}

	getLastKey(): Key | null {
		let key = this.collection.getLastKey();
		if (key != null && this.isDisabled(key)) {
			key = this.getPreviousKey(key);
		}
		return key;
	}

	getKeyAbove(key: Key): Key | null {
		if (this.tabDirection) {
			return null;
		}
		return this.getPreviousKey(key);
	}

	getKeyBelow(key: Key): Key | null {
		if (this.tabDirection) {
			return null;
		}
		return this.getNextKey(key);
	}

	getNextKey(startKey: Key): Key | null {
		let key: Key | null = startKey;
		do {
			key = this.collection.getKeyAfter(key);
			if (key == null) {
				key = this.collection.getFirstKey();
			}
		} while (key != null && this.isDisabled(key) && key !== startKey);
		return key;
	}

	getPreviousKey(startKey: Key): Key | null {
		let key: Key | null = startKey;
		do {
			key = this.collection.getKeyBefore(key);
			if (key == null) {
				key = this.collection.getLastKey();
			}
		} while (key != null && this.isDisabled(key) && key !== startKey);
		return key;
	}
}
