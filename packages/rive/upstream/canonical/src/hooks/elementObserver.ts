class FakeIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const MyIntersectionObserver =
  globalThis.IntersectionObserver || FakeIntersectionObserver;

class ElementObserver {
  private observer;

  private elementsMap: Map<Element, Function> = new Map();

  constructor() {
    this.observer = new MyIntersectionObserver(this.onObserved);
  }
  public onObserved = (entries: IntersectionObserverEntry[]) => {
    entries.forEach((entry) => {
      const elementCallback = this.elementsMap.get(entry.target as Element);
      if (elementCallback) {
        elementCallback(entry);
      }
    });
  };

  public registerCallback(element: Element, callback: Function) {
    this.observer.observe(element);
    this.elementsMap.set(element, callback);
  }

  public removeCallback(element: Element) {
    this.observer.unobserve(element);
    this.elementsMap.delete(element);
  }
}

export default ElementObserver;
