/** @jsxImportSource @octanejs/three/intrinsics */
import { applyProps, type Color, type ThreeElements, type ThreeRef } from '@octanejs/three';
import { useLayoutEffect, useMemo, useRef } from '@octanejs/three/renderer';
import * as THREE from 'three';

export type LightProps = Omit<ThreeElements['mesh'], 'ref' | 'scale' | 'args'> & {
	args?: any[];
	map?: THREE.Texture;
	toneMapped?: boolean;
	color?: Color;
	form?: 'circle' | 'ring' | 'rect' | 'plane' | 'box' | any;
	scale?: number | [number, number, number] | [number, number];
	intensity?: number;
	target?: boolean | [number, number, number] | THREE.Vector3;
	light?: Partial<ThreeElements['pointLight']>;
};

function assignRef<T>(ref: ThreeRef<T> | undefined, value: T | null): void {
	if (Array.isArray(ref)) for (const item of ref) assignRef(item, value);
	else if (typeof ref === 'function') ref(value);
	else if (ref && 'current' in ref) ref.current = value;
}

export function Lightformer({
	light,
	args,
	map,
	toneMapped = false,
	color = 'white',
	form: Form = 'rect',
	intensity = 1,
	scale: scaleProp = 1,
	target = [0, 0, 0],
	children,
	ref,
	...props
}: LightProps & { ref?: ThreeRef<THREE.Mesh> }) @{
	const localRef = useRef<THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | null>(null);
	const mergedRef = useMemo(
		() => (value: THREE.Mesh | null) => {
			localRef.current = value as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | null;
			assignRef(ref, value);
		},
		[ref],
	);
	useLayoutEffect(() => {
		if (!localRef.current || children || props.material) return;
		applyProps(localRef.current.material, { color });
		localRef.current.material.color.multiplyScalar(intensity);
	}, [color, intensity, children, props.material]);
	useLayoutEffect(() => {
		if (!localRef.current) return;
		if (!props.rotation) localRef.current.quaternion.identity();
		if (target && !props.rotation) {
			if (typeof target === 'boolean') localRef.current.lookAt(0, 0, 0);
			else localRef.current.lookAt(Array.isArray(target) ? new THREE.Vector3(...target) : target);
		}
	}, [target, props.rotation]);
	const scale = Array.isArray(scaleProp) && scaleProp.length === 2
		? [scaleProp[0], scaleProp[1], 1] as [number, number, number]
		: scaleProp;
	<mesh ref={mergedRef} scale={scale} {...props}>
		{Form === 'circle'
			? <ringGeometry args={(args ?? [0, 0.5, 64]) as any} />
			: Form === 'ring'
				? <ringGeometry args={(args ?? [0.25, 0.5, 64]) as any} />
				: Form === 'rect' || Form === 'plane'
					? <planeGeometry args={(args ?? [1, 1]) as any} />
					: Form === 'box'
						? <boxGeometry args={(args ?? [1, 1, 1]) as any} />
						: <Form args={args} />}
		{children || <meshBasicMaterial toneMapped={toneMapped} map={map} side={THREE.DoubleSide} />}
		{light && <pointLight castShadow {...light} />}
	</mesh>
}
