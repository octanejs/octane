import { getFiberFromHostInstance, type ScopedFiber } from '../bippy/index.js';
import type { OverlayBounds } from '../types.js';

interface ElementAdapter {
	hostElement: Element;
	supportsDomEditing: boolean;
	getBounds: () => OverlayBounds;
	getFiber: () => ScopedFiber | null;
	getPreview: () => string;
	getSelector: () => string;
	getTagName: () => string;
	isConnected: () => boolean;
}

const elementAdapters = new WeakMap<Element, ElementAdapter>();

export const registerElementAdapter = (element: Element, adapter: ElementAdapter): void => {
	elementAdapters.set(element, adapter);
};

export const getElementAdapter = (element: Element): ElementAdapter | null =>
	elementAdapters.get(element) ?? null;

export const getReactFiberForElement = (element: Element): ScopedFiber | null =>
	getElementAdapter(element)?.getFiber() ?? getFiberFromHostInstance(element);
