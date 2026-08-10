import { isChildrenBlock, isValidElement } from 'octane';

/** Keeps renderer-neutral element detection outside universal compiler imports. */
export const isOctaneElement: typeof isValidElement = isValidElement;

/** Distinguishes compiled child blocks from user-authored render-prop functions. */
export const isOctaneChildrenBlock: typeof isChildrenBlock = isChildrenBlock;

/** Iterates universal child values, whose descriptors intentionally differ from DOM elements. */
export function forEachOctaneChild(children: unknown, visit: (child: unknown) => void): void {
	if (isChildrenBlock(children)) {
		forEachOctaneChild((children as () => unknown)(), visit);
		return;
	}
	if (Array.isArray(children)) {
		for (const child of children) forEachOctaneChild(child, visit);
	} else if (children !== null && children !== undefined && typeof children !== 'boolean') {
		visit(children);
	}
}
