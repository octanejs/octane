import { isChildrenBlock } from 'octane';
import type { OctaneNode } from 'octane';

// Compiler-generated TSRX children blocks are zero-argument functions and are
// structurally assignable to this callback shape. Keep the public type focused
// on the upstream render-prop contract so callback parameters remain contextual.
export type RenderChildren<T> = (value: T) => OctaneNode;

export function isRenderFunction(value: unknown): value is (...args: any[]) => unknown {
	return typeof value === 'function' && !isChildrenBlock(value);
}

export function resolveRenderChildren<T>(
	children: RenderChildren<T> | undefined,
	value: T,
): unknown {
	return isRenderFunction(children) ? children(value) : children;
}
