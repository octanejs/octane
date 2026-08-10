/** @jsxImportSource @octanejs/three/intrinsics */
import { createPortal, type ThreeRef } from '@octanejs/three';
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from '@octanejs/three/renderer';
import type { UniversalRenderable } from 'octane/universal';
import * as THREE from 'three';
import { Flow } from 'three-stdlib';

export interface CurveModifierProps {
	children: UniversalRenderable;
	curve?: THREE.Curve<THREE.Vector3>;
}

export type CurveModifierRef = Flow;

export function CurveModifier({ children, curve, ref }: CurveModifierProps & {
	ref?: ThreeRef<CurveModifierRef>;
}) @{
	const [scene] = useState(() => new THREE.Scene());
	const [object, setObject] = useState<THREE.Object3D | undefined>(undefined);
	const modifier = useRef<Flow | null>(null);
	const source = useRef<THREE.Object3D | null>(null);
	useLayoutEffect(() => {
		if (!scene.children[0] || source.current === scene.children[0]) return;
		source.current = scene.children[0];
		const FlowConstructor = Flow as unknown as new (mesh: THREE.Mesh) => Flow;
		modifier.current = new FlowConstructor(scene.children[0] as THREE.Mesh);
		setObject(modifier.current.object3D as unknown as THREE.Object3D);
	});
	useEffect(() => {
		if (curve) modifier.current?.updateCurve(0, curve as any);
	}, [curve]);
	useImperativeHandle(ref as any, () => modifier.current!, [modifier.current]);
	<>
		{createPortal(children, scene)}
		{object && <primitive object={object} />}
	</>
}
