import { Children, attachRef, cloneElement, type ElementDescriptor, type OctaneNode } from 'octane';

export type StructuralRef<T> =
	| { current: T | null }
	| ((value: T | null) => void | (() => void))
	| ReadonlyArray<StructuralRef<T>>;

export function assignRef<T>(ref: StructuralRef<T> | null | undefined, value: T | null): void {
	attachRef(ref, value as Element | null);
}

export function cloneCoreChild(
	child: OctaneNode,
	handlers: {
		onMouseDown(event: MouseEvent): void;
		onMouseUp(event: MouseEvent): void;
		onTouchEnd(event: TouchEvent): void;
	},
): ElementDescriptor {
	return cloneElement(Children.only(child) as ElementDescriptor, handlers);
}
