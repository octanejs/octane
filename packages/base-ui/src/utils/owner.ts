// Ported from .base-ui/packages/utils/src/owner.ts. `ownerWindow` resolves the window that
// owns a node (Base UI re-exports `@floating-ui/utils/dom`'s `getWindow`).
export function ownerWindow(node: Node | null | undefined): Window & typeof globalThis {
	return ((node as any)?.ownerDocument?.defaultView ?? window) as Window & typeof globalThis;
}

export function ownerDocument(node: Element | null): Document {
	return node?.ownerDocument || document;
}
