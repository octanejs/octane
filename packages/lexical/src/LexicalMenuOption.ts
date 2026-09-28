// Ported from @lexical/react/src/LexicalMenuOption.ts. Its own entry point (as
// upstream) so every menu module, and consumers subclassing it, share one class.
import type { MenuRef } from './shared/menuShared';

/**
 * The base class for an item shown in a {@link LexicalTypeaheadMenuPlugin} or
 * {@link LexicalNodeMenuPlugin} menu. Each option has a unique `key` and a `ref`
 * to its rendered element (used for scrolling and keyboard navigation).
 * Subclass it to attach your own data such as a label or callback.
 */
export class MenuOption {
	key: string;
	ref?: MenuRef;
	icon?: unknown;
	title?: unknown;

	constructor(key: string) {
		this.key = key;
		this.ref = { current: null };
		this.setRefElement = this.setRefElement.bind(this);
	}

	setRefElement(element: HTMLElement | null) {
		this.ref = { current: element };
	}
}
