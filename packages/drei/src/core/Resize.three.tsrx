/** @jsxImportSource @octanejs/three/intrinsics */
import { type ThreeElements, type ThreeRef } from '@octanejs/three';
import { useLayoutEffect, useMemo, useRef } from '@octanejs/three/renderer';
import * as THREE from 'three';

function assignRef<T>(ref: ThreeRef<T> | undefined, value: T | null): void {
	if (Array.isArray(ref)) for (const item of ref) assignRef(item, value);
	else if (typeof ref === 'function') ref(value);
	else if (ref && 'current' in ref) ref.current = value;
}

export type ResizeProps =
	Omit<ThreeElements['group'], 'ref'> & {
		width?: boolean;
		height?: boolean;
		depth?: boolean;
		box3?: THREE.Box3;
		precise?: boolean;
	};

export function Resize({
	children,
	width,
	height,
	depth,
	box3,
	precise = true,
	ref,
	...props
}: ResizeProps & { ref?: ThreeRef<THREE.Group> }) @{
	const container = useRef<THREE.Group | null>(null);
	const outer = useRef<THREE.Group | null>(null);
	const inner = useRef<THREE.Group | null>(null);
	const mergedRef = useMemo(
		() => (value: THREE.Group | null) => {
			container.current = value;
			assignRef(ref, value);
		},
		[ref],
	);
	useLayoutEffect(() => {
		if (!outer.current || !inner.current) return;
		outer.current.matrixWorld.identity();
		const box = box3 || new THREE.Box3().setFromObject(inner.current, precise);
		const w = box.max.x - box.min.x;
		const h = box.max.y - box.min.y;
		const d = box.max.z - box.min.z;
		let dimension = Math.max(w, h, d);
		if (width) dimension = w;
		if (height) dimension = h;
		if (depth) dimension = d;
		outer.current.scale.setScalar(1 / dimension);
	}, [width, height, depth, box3, precise]);
	<group ref={mergedRef} {...props}>
		<group ref={outer}>
			<group ref={inner}>{children}</group>
		</group>
	</group>
}
