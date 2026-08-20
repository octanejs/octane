class FakeIntersectionObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}

const MyIntersectionObserver =
	globalThis.IntersectionObserver ||
	(FakeIntersectionObserver as unknown as typeof IntersectionObserver);

class ElementObserver {
	private observer: IntersectionObserver;
	private elementsMap: Map<Element, (entry: IntersectionObserverEntry) => void> = new Map();

	constructor() {
		this.observer = new MyIntersectionObserver(this.onObserved.bind(this));
	}

	public onObserved(entries: IntersectionObserverEntry[]) {
		entries.forEach(function notify(this: ElementObserver, entry) {
			const elementCallback = this.elementsMap.get(entry.target as Element);
			if (elementCallback) {
				elementCallback(entry);
			}
		}, this);
	}

	public registerCallback(element: Element, callback: (entry: IntersectionObserverEntry) => void) {
		this.observer.observe(element);
		this.elementsMap.set(element, callback);
	}

	public removeCallback(element: Element) {
		this.observer.unobserve(element);
		this.elementsMap.delete(element);
	}
}

export default ElementObserver;
