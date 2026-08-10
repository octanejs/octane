/** @jsxImportSource @octanejs/three/intrinsics */
import { type ThreeElements, type ThreeRef, useFrame } from '@octanejs/three';
import { useEffect, useLayoutEffect, useMemo, useRef } from '@octanejs/three/renderer';
import * as THREE from 'three';

function assignRef<T>(ref: ThreeRef<T> | undefined, value: T | null): void {
	if (Array.isArray(ref)) {
		for (const item of ref) assignRef(item, value);
	} else if (typeof ref === 'function') ref(value);
	else if (ref && 'current' in ref) ref.current = value;
}

export type BillboardProps =
	Omit<ThreeElements['group'], 'ref'> & {
		follow?: boolean;
		lockX?: boolean;
		lockY?: boolean;
		lockZ?: boolean;
	};

export function Billboard({
	children,
	follow = true,
	lockX = false,
	lockY = false,
	lockZ = false,
	ref,
	...props
}: BillboardProps & { ref?: ThreeRef<THREE.Group> }) @{
	const inner = useRef<THREE.Group | null>(null);
	const localRef = useRef<THREE.Group | null>(null);
	const quaternion = useMemo(() => new THREE.Quaternion(), []);
	const mergedRef = useMemo(
		() => (value: THREE.Group | null) => {
			localRef.current = value;
			assignRef(ref, value);
		},
		[ref],
	);
	useFrame(({ camera }) => {
		if (!follow || !localRef.current || !inner.current) return;
		const previousRotation = inner.current.rotation.clone();
		localRef.current.updateMatrix();
		localRef.current.updateWorldMatrix(false, false);
		localRef.current.getWorldQuaternion(quaternion);
		camera.getWorldQuaternion(inner.current.quaternion).premultiply(quaternion.invert());
		if (lockX) inner.current.rotation.x = previousRotation.x;
		if (lockY) inner.current.rotation.y = previousRotation.y;
		if (lockZ) inner.current.rotation.z = previousRotation.z;
	});
	<group ref={mergedRef} {...props}>
		<group ref={inner}>{children}</group>
	</group>
}

export type FloatProps =
	Omit<ThreeElements['group'], 'ref'> & {
		enabled?: boolean;
		speed?: number;
		rotationIntensity?: number;
		floatIntensity?: number;
		floatingRange?: [number?, number?];
		autoInvalidate?: boolean;
	};

export function Float({
	children,
	enabled = true,
	speed = 1,
	rotationIntensity = 1,
	floatIntensity = 1,
	floatingRange = [-0.1, 0.1],
	autoInvalidate = false,
	ref,
	...props
}: FloatProps & { ref?: ThreeRef<THREE.Group> }) @{
	const inner = useRef<THREE.Group | null>(null);
	const offset = useRef(Math.random() * 10000);
	const mergedRef = useMemo(
		() => (value: THREE.Group | null) => {
			inner.current = value;
			assignRef(ref, value);
		},
		[ref],
	);
	useFrame((state) => {
		if (!enabled || speed === 0 || !inner.current) return;
		if (autoInvalidate) state.invalidate();
		const time = offset.current + state.clock.elapsedTime;
		inner.current.rotation.x = (Math.cos((time / 4) * speed) / 8) * rotationIntensity;
		inner.current.rotation.y = (Math.sin((time / 4) * speed) / 8) * rotationIntensity;
		inner.current.rotation.z = (Math.sin((time / 4) * speed) / 20) * rotationIntensity;
		const base = Math.sin((time / 4) * speed) / 10;
		inner.current.position.y = THREE.MathUtils.mapLinear(
			base,
			-0.1,
			0.1,
			floatingRange[0] ?? -0.1,
			floatingRange[1] ?? 0.1,
		) *
		floatIntensity;
		inner.current.updateMatrix();
	});
	<group {...props}>
		<group ref={mergedRef} matrixAutoUpdate={false}>{children}</group>
	</group>
}

const easeInExpo = (value: number) => (value === 0 ? 0 : Math.pow(2, 10 * value - 10));

export type BackdropProps =
	ThreeElements['group'] & {
		floor?: number;
		segments?: number;
		receiveShadow?: boolean;
	};

export function Backdrop({
	children,
	floor = 0.25,
	segments = 20,
	receiveShadow,
	...props
}: BackdropProps) @{
	const geometry = useRef<THREE.PlaneGeometry | null>(null);
	useLayoutEffect(() => {
		if (!geometry.current) return;
		let index = 0;
		const offset = segments / segments / 2;
		const position = geometry.current.attributes.position as THREE.BufferAttribute;
		for (let x = 0; x < segments + 1; x++) {
			for (let y = 0; y < segments + 1; y++) {
				position.setXYZ(
					index++,
					x / segments - offset + (x === 0 ? -floor : 0),
					y / segments - offset,
					easeInExpo(x / segments),
				);
			}
		}
		position.needsUpdate = true;
		geometry.current.computeVertexNormals();
	}, [segments, floor]);
	<group {...props}>
		<mesh receiveShadow={receiveShadow} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
			<planeGeometry ref={geometry} args={[1, 1, segments, segments]} />
			{children}
		</mesh>
	</group>
}

const boundingBox = new THREE.Box3();
const boundingBoxSize = new THREE.Vector3();

export type BBAnchorProps =
	ThreeElements['group'] & {
		anchor: THREE.Vector3 | [number, number, number];
	};

export function BBAnchor({ anchor, ...props }: BBAnchorProps) @{
	const ref = useRef<THREE.Group | null>(null);
	const parentRef = useRef<THREE.Object3D | null>(null);
	useEffect(() => {
		if (ref.current?.parent?.parent) {
			parentRef.current = ref.current.parent;
			ref.current.parent.parent.add(ref.current);
		}
	}, []);
	useFrame(() => {
		if (!parentRef.current || !ref.current) return;
		boundingBox.setFromObject(parentRef.current);
		boundingBox.getSize(boundingBoxSize);
		ref.current.position.set(
			parentRef.current.position.x +
				(boundingBoxSize.x * (Array.isArray(anchor) ? anchor[0] : anchor.x)) / 2,
			parentRef.current.position.y +
				(boundingBoxSize.y * (Array.isArray(anchor) ? anchor[1] : anchor.y)) / 2,
			parentRef.current.position.z +
				(boundingBoxSize.z * (Array.isArray(anchor) ? anchor[2] : anchor.z)) / 2,
		);
	});
	<group ref={ref} {...props} />
}
