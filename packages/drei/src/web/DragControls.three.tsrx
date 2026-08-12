/** @jsxImportSource @octanejs/three/intrinsics */
import { type ThreeElements, type ThreeRef, useThree } from '@octanejs/three';
import { useImperativeHandle, useLayoutEffect, useRef } from '@octanejs/three/renderer';
import type { DragConfig } from '@use-gesture/core/types';
import type { OctaneNode } from 'octane';
import * as THREE from 'three';
import { useGesture } from './useGesture.js';

const initialModelPosition = new THREE.Vector3();
const mousePosition2D = new THREE.Vector2();
const mousePosition3D = new THREE.Vector3();
const dragOffset = new THREE.Vector3();
const dragPlaneNormal = new THREE.Vector3();
const dragPlane = new THREE.Plane();

type ControlsProto = { enabled: boolean };

export type DragControlsProps = Omit<ThreeElements['group'], 'ref' | 'children' | 'matrix'> & {
	autoTransform?: boolean;
	matrix?: THREE.Matrix4;
	axisLock?: 'x' | 'y' | 'z';
	dragLimits?: [[number, number] | undefined, [number, number] | undefined, [number, number] | undefined];
	onHover?: (hovering: boolean) => void;
	onDragStart?: (origin: THREE.Vector3) => void;
	onDrag?: (localMatrix: THREE.Matrix4, deltaLocalMatrix: THREE.Matrix4, worldMatrix: THREE.Matrix4, deltaWorldMatrix: THREE.Matrix4) => void;
	onDragEnd?: () => void;
	children: OctaneNode;
	dragConfig?: DragConfig;
};

export function DragControls({
	autoTransform = true, matrix, axisLock, dragLimits, onHover, onDragStart, onDrag, onDragEnd, children, dragConfig, ref: forwardedRef, ...props
}: DragControlsProps & { ref?: ThreeRef<THREE.Group> }) @{
	const defaultControls = useThree((state) => (state as any).controls) as ControlsProto | undefined;
	const { camera, size, raycaster, invalidate } = useThree();
	const ref = useRef<THREE.Group | null>(null);
	const bind = useGesture({
		onHover: ({ hovering }: any) => onHover?.(hovering ?? false),
		onDragStart: ({ event }: any) => {
			if (defaultControls) defaultControls.enabled = false;
			const { point } = event;
			ref.current!.matrix.decompose(initialModelPosition, new THREE.Quaternion(), new THREE.Vector3());
			mousePosition3D.copy(point);
			dragOffset.copy(mousePosition3D).sub(initialModelPosition);
			onDragStart?.(initialModelPosition);
			invalidate();
		},
		onDrag: ({ xy: [dragX, dragY], intentional }: any) => {
			if (!intentional) return;
			const normalizedMouseX = ((dragX - size.left) / size.width) * 2 - 1;
			const normalizedMouseY = -((dragY - size.top) / size.height) * 2 + 1;
			mousePosition2D.set(normalizedMouseX, normalizedMouseY);
			raycaster.setFromCamera(mousePosition2D, camera);
			if (!axisLock) camera.getWorldDirection(dragPlaneNormal).negate();
			else dragPlaneNormal.set(axisLock === 'x' ? 1 : 0, axisLock === 'y' ? 1 : 0, axisLock === 'z' ? 1 : 0);
			dragPlane.setFromNormalAndCoplanarPoint(dragPlaneNormal, mousePosition3D);
			raycaster.ray.intersectPlane(dragPlane, mousePosition3D);
			const previousLocalMatrix = ref.current!.matrix.clone();
			const previousWorldMatrix = ref.current!.matrixWorld.clone();
			const intendedNewPosition = new THREE.Vector3(mousePosition3D.x - dragOffset.x, mousePosition3D.y - dragOffset.y, mousePosition3D.z - dragOffset.z);
			if (dragLimits) {
				intendedNewPosition.x = dragLimits[0] ? THREE.MathUtils.clamp(intendedNewPosition.x, ...dragLimits[0]) : intendedNewPosition.x;
				intendedNewPosition.y = dragLimits[1] ? THREE.MathUtils.clamp(intendedNewPosition.y, ...dragLimits[1]) : intendedNewPosition.y;
				intendedNewPosition.z = dragLimits[2] ? THREE.MathUtils.clamp(intendedNewPosition.z, ...dragLimits[2]) : intendedNewPosition.z;
			}
			const localMatrix = autoTransform ? ref.current!.matrix : new THREE.Matrix4().copy(ref.current!.matrix);
			localMatrix.setPosition(intendedNewPosition);
			const deltaLocalMatrix = localMatrix.clone().multiply(previousLocalMatrix.invert());
			const deltaWorldMatrix = localMatrix.clone().multiply(previousWorldMatrix.invert());
			onDrag?.(localMatrix, deltaLocalMatrix, ref.current!.matrixWorld, deltaWorldMatrix);
			invalidate();
		},
		onDragEnd: () => {
			if (defaultControls) defaultControls.enabled = true;
			onDragEnd?.();
			invalidate();
		},
	}, { drag: { filterTaps: true, threshold: 1, ...(typeof dragConfig === 'object' ? dragConfig : {}) } });
	useImperativeHandle((forwardedRef ?? null) as any, () => ref.current!, []);
	useLayoutEffect(() => { if (matrix) ref.current!.matrix = matrix; }, [matrix]);
	<group ref={ref} {...((bind?.() ?? {}) as any)} matrix={matrix as any} matrixAutoUpdate={false} {...props}>{children}</group>
}
