/** @jsxImportSource @octanejs/three/intrinsics */
import { useFrame, type ThreeElements, useThree } from '@octanejs/three';
import { createContext, type OctaneNode, useContext } from 'octane';
import { useLayoutEffect, useMemo, useRef, useState } from '@octanejs/three/renderer';
import * as THREE from 'three';

export type SizeProps = {
	box: THREE.Box3;
	size: THREE.Vector3;
	center: THREE.Vector3;
	distance: number;
};

export type BoundsApi = {
	getSize: () => SizeProps;
	refresh(object?: THREE.Object3D | THREE.Box3): BoundsApi;
	reset(): BoundsApi;
	moveTo(position: THREE.Vector3 | [number, number, number]): BoundsApi;
	lookAt({
		target,
		up,
	}: {
		target?: THREE.Vector3 | [number, number, number];
		up?: THREE.Vector3 | [number, number, number];
	}): BoundsApi;
	to({
		position,
		target,
	}: {
		position: [number, number, number];
		target: [number, number, number];
	}): BoundsApi;
	fit(): BoundsApi;
	clip(): BoundsApi;
};

export type BoundsProps =
	Omit<ThreeElements['group'], 'ref'> & {
		maxDuration?: number;
		margin?: number;
		observe?: boolean;
		fit?: boolean;
		clip?: boolean;
		interpolateFunc?: (time: number) => number;
		onFit?: (data: SizeProps) => void;
	};

type Controls = {
	update(): void;
	target: THREE.Vector3;
	maxDistance: number;
	addEventListener(event: string, callback: (event: any) => void): void;
	removeEventListener(event: string, callback: (event: any) => void): void;
};

type Origin = { camPos: THREE.Vector3; camRot: THREE.Quaternion; camZoom: number };
type Goal = {
	camPos: THREE.Vector3 | undefined;
	camRot: THREE.Quaternion | undefined;
	camZoom: number | undefined;
	camUp: THREE.Vector3 | undefined;
	target: THREE.Vector3 | undefined;
};

const NONE = 0;
const START = 1;
const ACTIVE = 2;

const isOrthographic = (camera: THREE.Camera): camera is THREE.OrthographicCamera => Boolean(
	camera && (camera as THREE.OrthographicCamera).isOrthographicCamera,
);
const isBox3 = (value: unknown): value is THREE.Box3 => Boolean(
	value && (value as THREE.Box3).isBox3,
);
const defaultInterpolation = (time: number) => 1 - Math.exp(-5 * time) + 0.007 * time;

const BoundsContext = createContext<BoundsApi>(null!);

export function Bounds({
	children,
	maxDuration = 1,
	margin = 1.2,
	observe,
	fit,
	clip,
	interpolateFunc = defaultInterpolation,
	onFit,
}: BoundsProps) @{
	const ref = useRef<THREE.Group | null>(null);
	const state = useThree();
	const controls = useThree((value) => value.controls as unknown as Controls | undefined);
	const onFitRef = useRef<((data: SizeProps) => void) | undefined>(onFit);
	onFitRef.current = onFit;
	const origin = useRef<Origin>({
		camPos: new THREE.Vector3(),
		camRot: new THREE.Quaternion(),
		camZoom: 1,
	});
	const goal = useRef<Goal>({
		camPos: undefined,
		camRot: undefined,
		camZoom: undefined,
		camUp: undefined,
		target: undefined,
	});
	const animationState = useRef(NONE);
	const time = useRef(0);
	const [box] = useState(() => new THREE.Box3());
	const api = useMemo<BoundsApi>(() => {
		function getSize() {
			const boxSize = box.getSize(new THREE.Vector3());
			const center = box.getCenter(new THREE.Vector3());
			const maxSize = Math.max(boxSize.x, boxSize.y, boxSize.z);
			const fitHeightDistance = isOrthographic(state.camera)
				? maxSize * 4
				: maxSize / (2 * Math.atan((Math.PI * state.camera.fov) / 360));
			const fitWidthDistance = isOrthographic(state.camera)
				? maxSize * 4
				: fitHeightDistance / state.camera.aspect;
			return {
				box,
				size: boxSize,
				center,
				distance: margin * Math.max(fitHeightDistance, fitWidthDistance),
			};
		}
		return {
			getSize,
			refresh(object?: THREE.Object3D | THREE.Box3) {
				if (isBox3(object)) box.copy(object);
				else {
					const target = object || ref.current;
					if (!target) return this;
					target.updateWorldMatrix(true, true);
					box.setFromObject(target);
				}
				if (box.isEmpty()) {
					const max = state.camera.position.length() || 10;
					box.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(max, max, max));
				}
				origin.current.camPos.copy(state.camera.position);
				origin.current.camRot.copy(state.camera.quaternion);
				if (isOrthographic(state.camera)) origin.current.camZoom = state.camera.zoom;
				goal.current.camPos = undefined;
				goal.current.camRot = undefined;
				goal.current.camZoom = undefined;
				goal.current.camUp = undefined;
				goal.current.target = undefined;
				return this;
			},
			reset() {
				const { center, distance } = getSize();
				const direction = state.camera.position.clone().sub(center).normalize();
				goal.current.camPos = center.clone().addScaledVector(direction, distance);
				goal.current.target = center.clone();
				const matrix = new THREE.Matrix4().lookAt(
					goal.current.camPos,
					goal.current.target,
					state.camera.up,
				);
				goal.current.camRot = new THREE.Quaternion().setFromRotationMatrix(matrix);
				animationState.current = START;
				time.current = 0;
				return this;
			},
			moveTo(position) {
				goal.current.camPos = Array.isArray(position)
					? new THREE.Vector3(...position)
					: position.clone();
				animationState.current = START;
				time.current = 0;
				return this;
			},
			lookAt({ target, up }) {
				goal.current.target = Array.isArray(target)
					? new THREE.Vector3(...target)
					: target!.clone();
				goal.current.camUp = up
					? Array.isArray(up)
						? new THREE.Vector3(...up)
						: up.clone()
					: state.camera.up.clone();
				const matrix = new THREE.Matrix4().lookAt(
					goal.current.camPos || state.camera.position,
					goal.current.target,
					goal.current.camUp,
				);
				goal.current.camRot = new THREE.Quaternion().setFromRotationMatrix(matrix);
				animationState.current = START;
				time.current = 0;
				return this;
			},
			to({ position, target }) {
				return this.moveTo(position).lookAt({ target });
			},
			fit() {
				if (!isOrthographic(state.camera)) return this.reset();
				let maxHeight = 0;
				let maxWidth = 0;
				const vertices = [
					new THREE.Vector3(box.min.x, box.min.y, box.min.z),
					new THREE.Vector3(box.min.x, box.max.y, box.min.z),
					new THREE.Vector3(box.min.x, box.min.y, box.max.z),
					new THREE.Vector3(box.min.x, box.max.y, box.max.z),
					new THREE.Vector3(box.max.x, box.max.y, box.max.z),
					new THREE.Vector3(box.max.x, box.max.y, box.min.z),
					new THREE.Vector3(box.max.x, box.min.y, box.max.z),
					new THREE.Vector3(box.max.x, box.min.y, box.min.z),
				];
				const position = goal.current.camPos || state.camera.position;
				const target = goal.current.target || controls?.target;
				const up = goal.current.camUp || state.camera.up;
				const inverse =
					target
						? new THREE.Matrix4().lookAt(position, target, up).setPosition(position).invert()
						: state.camera.matrixWorldInverse;
				for (const vertex of vertices) {
					vertex.applyMatrix4(inverse);
					maxHeight = Math.max(maxHeight, Math.abs(vertex.y));
					maxWidth = Math.max(maxWidth, Math.abs(vertex.x));
				}
				maxHeight *= 2;
				maxWidth *= 2;
				const zoomForHeight = (state.camera.top - state.camera.bottom) / maxHeight;
				const zoomForWidth = (state.camera.right - state.camera.left) / maxWidth;
				goal.current.camZoom = Math.min(zoomForHeight, zoomForWidth) / margin;
				animationState.current = START;
				time.current = 0;
				onFitRef.current?.(this.getSize());
				return this;
			},
			clip() {
				const { distance } = getSize();
				state.camera.near = distance / 100;
				state.camera.far = distance * 100;
				state.camera.updateProjectionMatrix();
				if (controls) {
					controls.maxDistance = distance * 10;
					controls.update();
				}
				state.invalidate();
				return this;
			},
		};
	}, [box, state.camera, controls, margin, state.invalidate]);
	useLayoutEffect(() => {
		if (!controls) return;
		const callback = () => {
			if (goal.current.target && animationState.current !== NONE) {
				const front = new THREE.Vector3().setFromMatrixColumn(state.camera.matrix, 2);
				const distance0 = origin.current.camPos.distanceTo(controls.target);
				const distance1 = (goal.current.camPos || origin.current.camPos).distanceTo(
					goal.current.target,
				);
				const distance = (1 - time.current) * distance0 + time.current * distance1;
				controls.target.copy(state.camera.position).addScaledVector(front, -distance);
				controls.update();
			}
			animationState.current = NONE;
		};
		controls.addEventListener('start', callback);
		return () => controls.removeEventListener('start', callback);
	}, [controls]);
	const count = useRef(0);
	useLayoutEffect(() => {
		if (observe || count.current++ === 0) {
			api.refresh();
			if (fit) api.reset().fit();
			if (clip) api.clip();
		}
	}, [state.size, clip, fit, observe, state.camera, controls]);
	useFrame((_, delta) => {
		if (animationState.current === START) {
			animationState.current = ACTIVE;
			state.invalidate();
		} else if (animationState.current === ACTIVE) {
			time.current += delta / maxDuration;
			if (time.current >= 1) {
				if (goal.current.camPos) state.camera.position.copy(goal.current.camPos);
				if (goal.current.camRot) state.camera.quaternion.copy(goal.current.camRot);
				if (goal.current.camUp) state.camera.up.copy(goal.current.camUp);
				if (goal.current.camZoom && isOrthographic(state.camera)) {
					state.camera.zoom = goal.current.camZoom;
				}
				state.camera.updateMatrixWorld();
				state.camera.updateProjectionMatrix();
				if (controls && goal.current.target) {
					controls.target.copy(goal.current.target);
					controls.update();
				}
				animationState.current = NONE;
			} else {
				const amount = interpolateFunc(time.current);
				if (goal.current.camPos) {
					state.camera.position.lerpVectors(origin.current.camPos, goal.current.camPos, amount);
				}
				if (goal.current.camRot) {
					state.camera.quaternion.slerpQuaternions(
						origin.current.camRot,
						goal.current.camRot,
						amount,
					);
				}
				if (goal.current.camUp) state.camera.up.set(0, 1, 0).applyQuaternion(
					state.camera.quaternion,
				);
				if (goal.current.camZoom && isOrthographic(state.camera)) {
					state.camera.zoom = (1 - amount) * origin.current.camZoom + amount * goal.current.camZoom;
				}
				state.camera.updateMatrixWorld();
				state.camera.updateProjectionMatrix();
			}
			state.invalidate();
		}
	});
	<group ref={ref}>
		<BoundsContext.Provider value={api}>{children as OctaneNode}</BoundsContext.Provider>
	</group>
}

export function useBounds(): BoundsApi {
	return useContext(BoundsContext);
}
