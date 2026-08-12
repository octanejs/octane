/** @jsxImportSource @octanejs/three/intrinsics */
import { type ThreeRef, type Vector3 as Vector3Prop } from '@octanejs/three';
import { useMemo, useState } from '@octanejs/three/renderer';
import * as THREE from 'three';
import { Sky as SkyImpl } from 'three-stdlib';

export type SkyProps = {
	distance?: number;
	sunPosition?: Vector3Prop;
	inclination?: number;
	azimuth?: number;
	mieCoefficient?: number;
	mieDirectionalG?: number;
	rayleigh?: number;
	turbidity?: number;
};

export function calcPosFromAngles(
	inclination: number,
	azimuth: number,
	vector: THREE.Vector3 = new THREE.Vector3(),
): THREE.Vector3 {
	const theta = Math.PI * (inclination - 0.5);
	const phi = 2 * Math.PI * (azimuth - 0.5);
	vector.x = Math.cos(phi);
	vector.y = Math.sin(theta);
	vector.z = Math.sin(phi);
	return vector;
}

function assignRef<T>(ref: ThreeRef<T> | undefined, value: T | null): void {
	if (Array.isArray(ref)) for (const item of ref) assignRef(item, value);
	else if (typeof ref === 'function') ref(value);
	else if (ref && 'current' in ref) ref.current = value;
}

export function Sky({
	inclination = 0.6,
	azimuth = 0.1,
	distance = 1000,
	mieCoefficient = 0.005,
	mieDirectionalG = 0.8,
	rayleigh = 0.5,
	turbidity = 10,
	sunPosition = calcPosFromAngles(inclination, azimuth),
	ref,
	...props
}: SkyProps & { ref?: ThreeRef<SkyImpl> }) @{
	const scale = useMemo(() => new THREE.Vector3().setScalar(distance), [distance]);
	const [sky] = useState(() => new SkyImpl());
	const mergedRef = useMemo(() => (value: SkyImpl | null) => assignRef(ref, value), [ref]);
	<primitive
		object={sky}
		ref={mergedRef}
		material-uniforms-mieCoefficient-value={mieCoefficient}
		material-uniforms-mieDirectionalG-value={mieDirectionalG}
		material-uniforms-rayleigh-value={rayleigh}
		material-uniforms-sunPosition-value={sunPosition}
		material-uniforms-turbidity-value={turbidity}
		scale={scale}
		{...props}
	/>
}
