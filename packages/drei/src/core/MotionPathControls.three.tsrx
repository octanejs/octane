/** @jsxImportSource @octanejs/three/intrinsics */
import { type ThreeElements, type ThreeRef, useFrame, useInstanceHandle, useThree } from '@octanejs/three';
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type RefObject } from '@octanejs/three/renderer';
import { createContext, type OctaneNode, useContext } from 'octane';
import { easing, misc } from 'maath';
import * as THREE from 'three';

export type MotionPathProps = ThreeElements['group'] & {
	curves?: THREE.Curve<THREE.Vector3>[];
	debug?: boolean;
	debugColor?: THREE.ColorRepresentation;
	object?: RefObject<THREE.Object3D>;
	focus?: [x: number, y: number, z: number] | RefObject<THREE.Object3D>;
	loop?: boolean;
	offset?: number;
	smooth?: boolean | number;
	eps?: number;
	damping?: number;
	focusDamping?: number;
	maxSpeed?: number;
	children?: OctaneNode;
};

type MotionState = {
	current: number;
	path: THREE.CurvePath<THREE.Vector3>;
	focus: RefObject<THREE.Object3D> | [number, number, number] | undefined;
	object: RefObject<THREE.Object3D>;
	offset: number;
	point: THREE.Vector3;
	tangent: THREE.Vector3;
	next: THREE.Vector3;
};

export type MotionPathRef = THREE.Group & { motion: MotionState };

function isObject3DRef(ref: unknown): ref is RefObject<THREE.Object3D> {
	return (ref as RefObject<THREE.Object3D> | undefined)?.current instanceof THREE.Object3D;
}

const MotionContext = createContext<MotionState>(null!);

export function useMotion() {
	const context = useContext(MotionContext);
	if (!context) throw new Error('useMotion hook must be used in a MotionPathControls component.');
	return context;
}

function Debug({ points = 50, color = 'black' }: { points?: number; color?: THREE.ColorRepresentation }) @{
	const { path } = useMotion();
	const [dots, setDots] = useState<THREE.Vector3[]>([]);
	const material = useMemo(() => new THREE.MeshBasicMaterial({ color }), [color]);
	const geometry = useMemo(() => new THREE.SphereGeometry(0.025, 16, 16), []);
	const last = useRef<THREE.Curve<THREE.Vector3>[]>([]);
	useEffect(() => {
		if (path.curves !== last.current) {
			setDots(path.getPoints(points));
			last.current = path.curves;
		}
	});
	<>
		@for (const dot of dots; key dots.indexOf(dot)) {
			<mesh material={material} geometry={geometry} position={[dot.x, dot.y, dot.z]} />
		}
	</>
}

export function MotionPathControls({
	children,
	curves = [],
	debug = false,
	debugColor = 'black',
	object,
	focus,
	loop = true,
	offset,
	smooth = false,
	eps = 0.00001,
	damping = 0.1,
	focusDamping = 0.1,
	maxSpeed = Infinity,
	ref,
	...props
}: MotionPathProps & { ref?: ThreeRef<MotionPathRef> }) @{
	const { camera } = useThree();
	const group = useRef<MotionPathRef | null>(null);
	const position = useRef(offset ?? 0);
	const path = useMemo(() => new THREE.CurvePath<THREE.Vector3>(), []);
	const state = useMemo<MotionState>(() => ({
		focus,
		object: isObject3DRef(object) ? object : { current: camera },
		path,
		current: position.current,
		offset: position.current,
		point: new THREE.Vector3(),
		tangent: new THREE.Vector3(),
		next: new THREE.Vector3(),
	}), [focus, object]);
	const instance = useInstanceHandle(group as any);
	useLayoutEffect(() => {
		path.curves = [];
		const nextCurves = curves.length > 0
			? curves
			: instance.current!.children.map((child) => child.object as unknown as THREE.Curve<THREE.Vector3>);
		for (const curve of nextCurves) path.add(curve);
		if (smooth) {
			const points = path.getPoints(typeof smooth === 'number' ? smooth : 1);
			path.curves = [new THREE.CatmullRomCurve3(points)];
		}
		path.updateArcLengths();
	});
	useImperativeHandle((ref ?? null) as any, () => Object.assign(group.current!, { motion: state }), [state]);
	useLayoutEffect(() => {
		position.current = misc.repeat(position.current, 1);
	}, [offset]);
	const vector = useMemo(() => new THREE.Vector3(), []);
	useFrame((_frameState, delta) => {
		const lastOffset = state.offset;
		easing.damp(position, 'current', offset !== undefined ? offset : state.current, damping, delta, maxSpeed, undefined, eps);
		state.offset = loop ? misc.repeat(position.current, 1) : misc.clamp(position.current, 0, 1);
		if (path.getCurveLengths().length === 0) return;
		path.getPointAt(state.offset, state.point);
		path.getTangentAt(state.offset, state.tangent).normalize();
		path.getPointAt(misc.repeat(position.current - (lastOffset - state.offset), 1), state.next);
		const target = isObject3DRef(object) ? object.current! : camera;
		target.position.copy(state.point);
		if (focus) {
			easing.dampLookAt(target, isObject3DRef(focus) ? focus.current!.getWorldPosition(vector) : focus, focusDamping, delta, maxSpeed, undefined, eps);
		}
	});
	<group ref={group as any} {...props}>
		<MotionContext.Provider value={state}>
			{children}
			@if (debug) {
				<Debug color={debugColor} />
			}
		</MotionContext.Provider>
	</group>
}
