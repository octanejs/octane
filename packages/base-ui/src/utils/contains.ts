// Vendored from @floating-ui/react's `contains` (octane's @octanejs/floating-ui has the same
// helper internally but doesn't export it). True when `child` is `parent` or inside it,
// crossing shadow boundaries.
export function contains(parent?: Element | null, child?: Element | null): boolean {
	if (!parent || !child) {
		return false;
	}
	if (parent.contains(child)) {
		return true;
	}
	const rootNode = child.getRootNode?.();
	if (rootNode && (rootNode as ShadowRoot).host) {
		let next: Node | null = child;
		while (next) {
			if (next === parent) {
				return true;
			}
			next = (next as any).parentNode || (next as ShadowRoot).host;
		}
	}
	return false;
}
