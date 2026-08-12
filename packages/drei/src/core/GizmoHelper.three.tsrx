/** @jsxImportSource @octanejs/three/intrinsics */
import { type ThreeElements, useFrame, useThree } from '@octanejs/three';
import { useCallback, useEffect, useMemo, useRef } from '@octanejs/three/renderer';
import { createContext, type OctaneNode, useContext } from 'octane';
import { Group, Matrix4, Object3D, OrthographicCamera as OrthographicCameraImpl, Quaternion, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsType } from 'three-stdlib';
import { Hud } from './Hud.three.tsrx';
import { OrthographicCamera } from './cameras.three.tsrx';

type GizmoHelperContext = { tweenCamera: (direction: Vector3) => void };
const GizmoContext = createContext<GizmoHelperContext>({} as GizmoHelperContext);

export const useGizmoContext = () => useContext(GizmoContext);

const turnRate = 2 * Math.PI;
const dummy = new Object3D();
const matrix = new Matrix4();
const q1 = new Quaternion();
const q2 = new Quaternion();
const target = new Vector3();
const targetPosition = new Vector3();

type ControlsProto = {
	update(delta?: number): void;
	target: Vector3;
	getTarget?(target: Vector3): Vector3;
	setPosition?(x: number, y: number, z: number): void;
};

export type GizmoHelperProps = ThreeElements['group'] & {
	alignment?: 'top-left' | 'top-right' | 'bottom-right' | 'bottom-left' | 'bottom-center' | 'center-right' | 'center-left' | 'center-center' | 'top-center';
	margin?: [number, number];
	renderPriority?: number;
	autoClear?: boolean;
	onUpdate?: () => void;
	onTarget?: () => Vector3;
	children?: OctaneNode;
};

function isOrbitControls(controls: ControlsProto | undefined): controls is ControlsProto & OrbitControlsType {
	return Boolean(controls && 'minPolarAngle' in controls);
}

function isCameraControls(controls: ControlsProto | undefined): controls is ControlsProto & Required<Pick<ControlsProto, 'getTarget' | 'setPosition'>> {
	return Boolean(controls && 'getTarget' in controls);
}

function getControlsTarget(controls: ControlsProto | undefined, destination: Vector3): Vector3 | undefined {
	return controls?.getTarget ? controls.getTarget(destination) : controls?.target;
}

export function GizmoHelper({
	alignment = 'bottom-right',
	margin = [80, 80],
	renderPriority = 1,
	onUpdate,
	onTarget,
	children,
}: GizmoHelperProps) @{
	const size = useThree((state) => state.size);
	const mainCamera = useThree((state) => state.camera);
	const defaultControls = useThree((state) => state.controls as unknown as ControlsProto | undefined);
	const invalidate = useThree((state) => state.invalidate);
	const gizmo = useRef<Group | null>(null);
	const virtualCamera = useRef<OrthographicCameraImpl | null>(null);
	const animating = useRef(false);
	const radius = useRef(0);
	const focusPoint = useRef(new Vector3());
	const defaultUp = useRef(new Vector3());
	useEffect(() => {
		defaultUp.current.copy(mainCamera.up);
		dummy.up.copy(mainCamera.up);
	}, [mainCamera]);
	const tweenCamera = useCallback((direction: Vector3) => {
		animating.current = true;
		if (defaultControls || onTarget) {
			focusPoint.current = onTarget?.() ?? getControlsTarget(defaultControls, focusPoint.current) ?? focusPoint.current;
		}
		radius.current = mainCamera.position.distanceTo(target);
		q1.copy(mainCamera.quaternion);
		targetPosition.copy(direction).multiplyScalar(radius.current).add(target);
		dummy.lookAt(targetPosition);
		q2.copy(dummy.quaternion);
		invalidate();
	}, [defaultControls, mainCamera, onTarget, invalidate]);
	useFrame((_state, delta) => {
		if (!virtualCamera.current || !gizmo.current) return;
		if (animating.current) {
			if (q1.angleTo(q2) < 0.01) {
				animating.current = false;
				if (isOrbitControls(defaultControls)) mainCamera.up.copy(defaultUp.current);
			} else {
				q1.rotateTowards(q2, delta * turnRate);
				mainCamera.position.set(0, 0, 1).applyQuaternion(q1).multiplyScalar(radius.current).add(focusPoint.current);
				mainCamera.up.set(0, 1, 0).applyQuaternion(q1).normalize();
				mainCamera.quaternion.copy(q1);
				if (isCameraControls(defaultControls)) defaultControls.setPosition(mainCamera.position.x, mainCamera.position.y, mainCamera.position.z);
				if (onUpdate) onUpdate(); else defaultControls?.update(delta);
				invalidate();
			}
		}
		matrix.copy(mainCamera.matrix).invert();
		gizmo.current.quaternion.setFromRotationMatrix(matrix);
	});
	const context = useMemo(() => ({ tweenCamera }), [tweenCamera]);
	const [marginX, marginY] = margin;
	const x = alignment.endsWith('-center') ? 0 : alignment.endsWith('-left') ? -size.width / 2 + marginX : size.width / 2 - marginX;
	const y = alignment.startsWith('center-') ? 0 : alignment.startsWith('top-') ? size.height / 2 - marginY : -size.height / 2 + marginY;
	<Hud renderPriority={renderPriority}>
		<GizmoContext.Provider value={context}>
			<OrthographicCamera makeDefault ref={virtualCamera} position={[0, 0, 200]} />
			<group ref={gizmo} position={[x, y, 0]}>{children}</group>
		</GizmoContext.Provider>
	</Hud>
}
