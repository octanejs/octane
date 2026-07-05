// Ported verbatim from .base-ui/packages/react/src/utils/popups/popupTriggerMap.ts (v1.6.0).
// Tracks a popup's trigger elements by id (a Set for membership + a Map for id lookup). Pure —
// the dev-only invariant check is dropped (functional outcomes only).
export class PopupTriggerMap {
	private elementsSet: Set<Element>;

	private idMap: Map<string, Element>;

	constructor() {
		this.elementsSet = new Set();
		this.idMap = new Map();
	}

	add(id: string, element: Element) {
		const existingElement = this.idMap.get(id);
		if (existingElement === element) {
			return;
		}
		if (existingElement !== undefined) {
			this.elementsSet.delete(existingElement);
		}
		this.elementsSet.add(element);
		this.idMap.set(id, element);
	}

	delete(id: string) {
		const element = this.idMap.get(id);
		if (element) {
			this.elementsSet.delete(element);
			this.idMap.delete(id);
		}
	}

	hasElement(element: Element): boolean {
		return this.elementsSet.has(element);
	}

	hasMatchingElement(predicate: (el: Element) => boolean): boolean {
		for (const element of this.elementsSet) {
			if (predicate(element)) {
				return true;
			}
		}
		return false;
	}

	getById(id: string): Element | undefined {
		return this.idMap.get(id);
	}

	entries(): IterableIterator<[string, Element]> {
		return this.idMap.entries();
	}

	elements(): IterableIterator<Element> {
		return this.elementsSet.values();
	}

	get size(): number {
		return this.idMap.size;
	}
}
