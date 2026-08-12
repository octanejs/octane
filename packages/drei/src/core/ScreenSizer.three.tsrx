/** @jsxImportSource @octanejs/three/intrinsics */
import { type ThreeElements, type ThreeRef, useFrame } from '@octanejs/three';
import { useMemo, useRef } from '@octanejs/three/renderer';
import { Object3D, Vector3 } from 'three';
import { calculateScaleFactor } from './calculateScaleFactor.js';

const worldPosition = new Vector3();

export type ScreenSizerProps =
	Omit<ThreeElements['object3D'], 'ref'> & {
		scale?: number;
	};

function assignRef<T>(ref: ThreeRef<T> | undefined, value: T | null): void {
	if (Array.isArray(ref)) for (const item of ref) assignRef(item, value);
	else if (typeof ref === 'function') ref(value);
	else if (ref && 'current' in ref) ref.current = value;
}

export function ScreenSizer({ scale = 1, ref, ...props }: ScreenSizerProps & {
	ref?: ThreeRef<Object3D>;
}) @{
	const container = useRef<Object3D | null>(null);
	const mergedRef = useMemo(
		() => (value: Object3D | null) => {
			container.current = value;
			assignRef(ref, value);
		},
		[ref],
	);
	useFrame((state) => {
		const object = container.current;
		if (!object) return;
		const factor = calculateScaleFactor(
			object.getWorldPosition(worldPosition),
			scale,
			state.camera,
			state.size,
		);
		object.scale.setScalar(factor * scale);
	});
	<object3D ref={mergedRef} {...props} />
}
