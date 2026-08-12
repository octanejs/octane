/** @jsxImportSource @octanejs/three/intrinsics */
import { type ThreeElements, type ThreeRef, useFrame } from '@octanejs/three';
import { useMemo, useRef, useState } from '@octanejs/three/renderer';
import { createContext, useContext } from 'octane';
import * as THREE from 'three';
import { MarchingCubes as MarchingCubesImpl } from 'three-stdlib';

type MarchingApi = { getParent(): { current: MarchingCubesImpl | null } };
const MarchingContext = createContext<MarchingApi | null>(null);

function assignRef<T>(ref: ThreeRef<T> | undefined, value: T | null): void {
	if (Array.isArray(ref)) for (const item of ref) assignRef(item, value);
	else if (typeof ref === 'function') ref(value);
	else if (ref && 'current' in ref) ref.current = value;
}

export type MarchingCubesProps = {
	resolution?: number;
	maxPolyCount?: number;
	enableUvs?: boolean;
	enableColors?: boolean;
} & Omit<ThreeElements['group'], 'ref'>;

export function MarchingCubes({
	resolution = 28,
	maxPolyCount = 10000,
	enableUvs = false,
	enableColors = false,
	children,
	ref,
	...props
}: MarchingCubesProps & { ref?: ThreeRef<MarchingCubesImpl> }) @{
	const marchingRef = useRef<MarchingCubesImpl | null>(null);
	const marchingCubes = useMemo(() => {
		const Constructor = MarchingCubesImpl as unknown as new (
			resolution: number,
			material: THREE.Material,
			enableUvs: boolean,
			enableColors: boolean,
			maxPolyCount: number,
		) => MarchingCubesImpl;
		return new Constructor(resolution, null as unknown as THREE.Material, enableUvs, enableColors, maxPolyCount);
	}, [resolution, maxPolyCount, enableUvs, enableColors]);
	const api = useMemo<MarchingApi>(() => ({ getParent: () => marchingRef }), []);
	const mergedRef = useMemo(
		() => (value: MarchingCubesImpl | null) => { marchingRef.current = value; assignRef(ref, value); },
		[ref],
	);
	useFrame(() => {
		marchingCubes.update();
		marchingCubes.reset();
	}, -1);
	<primitive object={marchingCubes} ref={mergedRef as any} {...props as any}>
		<MarchingContext.Provider value={api}>{children}</MarchingContext.Provider>
	</primitive>
}

export type MarchingCubeProps = {
	strength?: number;
	subtract?: number;
	color?: THREE.Color;
} & Omit<ThreeElements['group'], 'ref'>;

export function MarchingCube({
	strength = 0.5,
	subtract = 12,
	color,
	ref,
	...props
}: MarchingCubeProps & { ref?: ThreeRef<THREE.Group> }) @{
	const api = useContext(MarchingContext);
	if (!api) throw new Error('MarchingCube must be used inside MarchingCubes.');
	const parentRef = useMemo(() => api.getParent(), [api]);
	const cubeRef = useRef<THREE.Group | null>(null);
	const vector = new THREE.Vector3();
	const mergedRef = useMemo(
		() => (value: THREE.Group | null) => { cubeRef.current = value; assignRef(ref, value); },
		[ref],
	);
	useFrame(() => {
		if (!parentRef.current || !cubeRef.current) return;
		cubeRef.current.getWorldPosition(vector);
		parentRef.current.addBall(
			0.5 + vector.x * 0.5,
			0.5 + vector.y * 0.5,
			0.5 + vector.z * 0.5,
			strength,
			subtract,
			color as any,
		);
	});
	<group ref={mergedRef} {...props} />
}

export type MarchingPlaneProps = {
	planeType?: 'x' | 'y' | 'z';
	strength?: number;
	subtract?: number;
} & Omit<ThreeElements['group'], 'ref'>;

export function MarchingPlane({
	planeType: requestedPlaneType = 'x',
	strength = 0.5,
	subtract = 12,
	ref,
	...props
}: MarchingPlaneProps & { ref?: ThreeRef<THREE.Group> }) @{
	const api = useContext(MarchingContext);
	if (!api) throw new Error('MarchingPlane must be used inside MarchingCubes.');
	const parentRef = useMemo(() => api.getParent(), [api]);
	const wallRef = useRef<THREE.Group | null>(null);
	const planeType = useMemo(
		() => requestedPlaneType === 'x' ? 'addPlaneX' : requestedPlaneType === 'y' ? 'addPlaneY' : 'addPlaneZ',
		[requestedPlaneType],
	);
	const mergedRef = useMemo(
		() => (value: THREE.Group | null) => { wallRef.current = value; assignRef(ref, value); },
		[ref],
	);
	useFrame(() => {
		if (!parentRef.current || !wallRef.current) return;
		parentRef.current[planeType](strength, subtract);
	});
	<group ref={mergedRef} {...props} />
}
