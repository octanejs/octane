/** @jsxImportSource @octanejs/three/intrinsics */
import { type RefObject, useFrame, useThree } from '@octanejs/three';
import { useLayoutEffect, useRef } from '@octanejs/three/renderer';
import { Object3D } from 'three';
import { stripTrailingSlot } from './compiler-slot.js';

type Falsey = false | null | undefined;
type HelperType = Object3D & { update?: () => void; dispose?: () => void };
type HelperConstructor = new (...args: any[]) => any;
type HelperArgs<T> = T extends [infer _, ...infer Rest] ? Rest : never;

export function useHelper<T extends HelperConstructor>(
	object3D: RefObject<Object3D> | Falsey,
	helperConstructor: T,
	...args: HelperArgs<ConstructorParameters<T>>
) {
	args = stripTrailingSlot(args) as HelperArgs<ConstructorParameters<T>>;
	const helper = useRef<HelperType | null | undefined>(null);
	const scene = useThree((state) => state.scene);
	useLayoutEffect(() => {
		let currentHelper: HelperType | undefined;
		if (object3D && object3D.current && helperConstructor) {
			helper.current = currentHelper =
				new helperConstructor(object3D.current, ...args) as HelperType;
		}
		if (currentHelper) {
			currentHelper.traverse((child) => (child.raycast = () => null));
			scene.add(currentHelper);
			return () => {
				helper.current = undefined;
				scene.remove(currentHelper);
				currentHelper.dispose?.();
			};
		}
	}, [scene, helperConstructor, object3D, ...args]);
	useFrame(() => void helper.current?.update?.());
	return helper;
}

export type HelperProps<T extends HelperConstructor> = {
	type: T;
	args?: HelperArgs<ConstructorParameters<T>>;
};

export function Helper<T extends HelperConstructor>({
	type: helperConstructor,
	args = [] as never,
}: HelperProps<T>) @{
	const thisRef = useRef<Object3D | null>(null);
	const parentRef = useRef<Object3D | null>(null);
	useLayoutEffect(() => {
		parentRef.current = thisRef.current?.parent ?? null;
	});
	useHelper(parentRef, helperConstructor, ...args);
	<object3D ref={thisRef} />
}
