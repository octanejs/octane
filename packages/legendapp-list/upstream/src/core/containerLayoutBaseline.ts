type ContainerLayoutSize = Pick<DOMRectReadOnly, "height" | "width">;

// This tracks the physical border box read by the parent layout effect. It is
// intentionally separate from sizesKnown, which stores item scroll-axis sizes.
const containerLayoutBaselines = new WeakMap<HTMLElement, ContainerLayoutSize>();

export function getContainerLayoutBaseline(element: HTMLElement): ContainerLayoutSize | undefined {
    return containerLayoutBaselines.get(element);
}

export function setContainerLayoutBaseline(element: HTMLElement, size: ContainerLayoutSize) {
    containerLayoutBaselines.set(element, size);
}
