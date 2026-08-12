/** @jsxImportSource @octanejs/three/intrinsics */
import {
	type ThreeElements,
	type ThreeEvent,
	type ThreeRef,
	useFrame,
	useThree,
} from '@octanejs/three';
import {
	useCallback,
	useContext,
	useImperativeHandle,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from '@octanejs/three/renderer';
import type { OctaneNode } from 'octane';
import * as THREE from 'three';
import { Html } from '@octanejs/drei';
import { Line } from '../../core/lines.three.tsrx';
import { calculateScaleFactor } from '../../core/calculateScaleFactor.js';
import { PivotAnnotation } from './annotation.tsrx';
import { context, type Limits, type OnDragStartProps, type PivotContext } from './context.js';

const mL0 = new THREE.Matrix4(), mW0 = new THREE.Matrix4(), mP = new THREE.Matrix4(), mPInv = new THREE.Matrix4();
const mW = new THREE.Matrix4(), mL = new THREE.Matrix4(), mL0Inv = new THREE.Matrix4(), mdL = new THREE.Matrix4(), mG = new THREE.Matrix4();
const bb = new THREE.Box3(), bbObj = new THREE.Box3(), vCenter = new THREE.Vector3(), vSize = new THREE.Vector3();
const vAnchorOffset = new THREE.Vector3(), vPosition = new THREE.Vector3(), vScale = new THREE.Vector3();
const xDir = new THREE.Vector3(1, 0, 0), yDir = new THREE.Vector3(0, 1, 0), zDir = new THREE.Vector3(0, 0, 1);
const upV = new THREE.Vector3(0, 1, 0), scratch1 = new THREE.Vector3(), scratch2 = new THREE.Vector3();
const offsetMatrix = new THREE.Matrix4(), rotationMatrix = new THREE.Matrix4(), scaleMatrix = new THREE.Matrix4();
const ray = new THREE.Ray(), intersection = new THREE.Vector3(), scaleVector = new THREE.Vector3();

export type PivotControlsProps =
	Omit<ThreeElements['group'], 'children' | 'ref' | 'scale' | 'rotation'> & {
		ref?: ThreeRef<THREE.Group>;
		enabled?: boolean;
		scale?: number;
		lineWidth?: number;
		fixed?: boolean;
		offset?: [number, number, number];
		rotation?: [number, number, number];
		matrix?: THREE.Matrix4;
		anchor?: [number, number, number];
		autoTransform?: boolean;
		activeAxes?: [boolean, boolean, boolean];
		disableAxes?: boolean;
		disableSliders?: boolean;
		disableRotations?: boolean;
		disableScaling?: boolean;
		translationLimits?: Limits;
		rotationLimits?: Limits;
		scaleLimits?: Limits;
		axisColors?: [string | number, string | number, string | number];
		hoveredColor?: string | number;
		annotations?: boolean;
		annotationsClass?: string;
		onDragStart?: (props: OnDragStartProps) => void;
		onDrag?: (local: THREE.Matrix4, deltaLocal: THREE.Matrix4, world: THREE.Matrix4, deltaWorld: THREE.Matrix4) => void;
		onDragEnd?: () => void;
		depthTest?: boolean;
		renderOrder?: number;
		opacity?: number;
		visible?: boolean;
		userData?: Record<string, any>;
		children?: OctaneNode;
	};

function captureTarget(event: ThreeEvent<PointerEvent>, capture: boolean): void {
	const target = event.target as unknown as {
		setPointerCapture(id: number): void;
		releasePointerCapture(id: number): void;
	};
	if (capture) target.setPointerCapture(event.pointerId);
	else target.releasePointerCapture(event.pointerId);
}

function Annotation({
	position,
	divRef,
	className,
}: {
	position: [number, number, number];
	divRef: { current: HTMLDivElement | null };
	className?: string;
}) @{
	<Html position={position}>
		<PivotAnnotation ref={divRef} className={className} />
	</Html>
}

function directionMatrix(direction: THREE.Vector3): THREE.Matrix4 {
	return new THREE.Matrix4().makeRotationFromQuaternion(
		new THREE.Quaternion().setFromUnitVectors(upV, direction.clone().normalize()),
	);
}

export function calculateOffset(
	clickPoint: THREE.Vector3,
	normal: THREE.Vector3,
	rayStart: THREE.Vector3,
	rayDir: THREE.Vector3,
): number {
	const e1 = normal.dot(normal), e2 = normal.dot(clickPoint) - normal.dot(rayStart), e3 =
		normal.dot(rayDir);
	if (e3 === 0) return -e2 / e1;
	scratch1.copy(rayDir).multiplyScalar(e1 / e3).sub(normal);
	scratch2.copy(rayDir).multiplyScalar(e2 / e3).add(rayStart).sub(clickPoint);
	return -scratch1.dot(scratch2) / scratch1.dot(scratch1);
}

function AxisArrow({ direction, axis }: { direction: THREE.Vector3; axis: 0 | 1 | 2 }) @{
	const config = useContext(context), controls = useThree((state) => state.controls) as {
		enabled: boolean;
	} | undefined;
	const divRef = useRef<HTMLDivElement | null>(null), objectRef = useRef<THREE.Group | null>(null);
	const clickInfo = useRef<{ clickPoint: THREE.Vector3; dir: THREE.Vector3 } | null>(
		null,
	), offset0 = useRef(0);
	const [hovered, setHovered] = useState(false);
	const matrix = useMemo(() => directionMatrix(direction), [direction]);
	const coneWidth = config.fixed ? (config.lineWidth / config.scale) * 1.6 : config.scale / 20;
	const coneLength = config.fixed ? 0.2 : config.scale / 5;
	const cylinderLength = config.fixed ? 1 - coneLength : config.scale - coneLength;
	const down = useCallback((event: ThreeEvent<PointerEvent>) => {
		if (config.annotations && divRef.current) {
			divRef.current.innerText = config.translation.current[axis].toFixed(2);
			divRef.current.style.display = 'block';
		}
		event.stopPropagation();
		const rotation = new THREE.Matrix4().extractRotation(objectRef.current!.matrixWorld);
		const origin = new THREE.Vector3().setFromMatrixPosition(objectRef.current!.matrixWorld);
		const dir = direction.clone().applyMatrix4(rotation).normalize();
		clickInfo.current = { clickPoint: event.point.clone(), dir };
		offset0.current = config.translation.current[axis];
		config.onDragStart({ component: 'Arrow', axis, origin, directions: [dir] });
		if (controls) controls.enabled = false;
		captureTarget(event, true);
	}, [config, direction, axis, controls]);
	const move = useCallback((event: ThreeEvent<PointerEvent>) => {
		event.stopPropagation();
		if (!hovered) setHovered(true);
		if (!clickInfo.current) return;
		const { clickPoint, dir } = clickInfo.current;
		const [min, max] = config.translationLimits?.[axis] || [undefined, undefined];
		let offset = calculateOffset(clickPoint, dir, event.ray.origin, event.ray.direction);
		if (min !== undefined) offset = Math.max(offset, min - offset0.current);
		if (max !== undefined) offset = Math.min(offset, max - offset0.current);
		config.translation.current[axis] = offset0.current + offset;
		if (config.annotations && divRef.current) divRef.current.innerText =
			config.translation.current[axis].toFixed(2);
		config.onDrag(offsetMatrix.makeTranslation(dir.x * offset, dir.y * offset, dir.z * offset));
	}, [config, axis, hovered]);
	const up = useCallback((event: ThreeEvent<PointerEvent>) => {
		if (divRef.current && config.annotations) divRef.current.style.display = 'none';
		event.stopPropagation();
		clickInfo.current = null;
		config.onDragEnd();
		if (controls) controls.enabled = true;
		captureTarget(event, false);
	}, [config, controls]);
	const color = hovered ? config.hoveredColor : config.axisColors[axis];
	<group ref={objectRef}>
		<group
			matrix={matrix}
			matrixAutoUpdate={false}
			onPointerDown={down}
			onPointerMove={move}
			onPointerUp={up}
			onPointerOut={(event) => {
				event.stopPropagation();
				setHovered(false);
			}}
		>
			@if (config.annotations) {
				<Annotation
					position={[0, -coneLength, 0]}
					divRef={divRef}
					className={config.annotationsClass}
				/>
			}
			<mesh
				visible={false}
				position={[0, (cylinderLength + coneLength) / 2, 0]}
				userData={config.userData}
			>
				<cylinderGeometry
					args={[coneWidth * 1.4, coneWidth * 1.4, cylinderLength + coneLength, 8, 1]}
				/>
			</mesh>
			<Line
				{...{ raycast: () => null } as any}
				transparent
				depthTest={config.depthTest}
				points={[0, 0, 0, 0, cylinderLength, 0] as any}
				lineWidth={config.lineWidth}
				side={THREE.DoubleSide}
				color={color as any}
				opacity={config.opacity}
				polygonOffset
				renderOrder={config.renderOrder}
				polygonOffsetFactor={-10}
				fog={false}
			/>
			<mesh
				{...{ raycast: () => null } as any}
				position={[0, cylinderLength + coneLength / 2, 0]}
				renderOrder={config.renderOrder}
			>
				<coneGeometry args={[coneWidth, coneLength, 24, 1]} />
				<meshBasicMaterial
					transparent
					depthTest={config.depthTest}
					color={color}
					opacity={config.opacity}
					polygonOffset
					polygonOffsetFactor={-10}
					fog={false}
				/>
			</mesh>
		</group>
	</group>
}

function decompose(e1: THREE.Vector3, e2: THREE.Vector3, offset: THREE.Vector3): [number, number] {
	const i1 =
		Math.abs(e1.x) >= Math.abs(e1.y) && Math.abs(e1.x) >= Math.abs(e1.z)
			? 0
			: Math.abs(e1.y) >= Math.abs(e1.x) && Math.abs(e1.y) >= Math.abs(e1.z)
				? 1
				: 2;
	const order = [0, 1, 2].sort(
		(a, b) => Math.abs(e2.getComponent(b)) - Math.abs(e2.getComponent(a)),
	);
	const i2 =
		i1 === order[0] ? order[1] : order[0];
	const a1 = e1.getComponent(i1), a2 = e1.getComponent(i2), b1 = e2.getComponent(i1), b2 =
		e2.getComponent(i2), c1 = offset.getComponent(i1), c2 = offset.getComponent(i2);
	const y = (c2 - c1 * (a2 / a1)) / (b2 - b1 * (a2 / a1));
	return [(c1 - y * b1) / a1, y];
}

function PlaneSlider({
	dir1,
	dir2,
	axis,
}: {
	dir1: THREE.Vector3;
	dir2: THREE.Vector3;
	axis: 0 | 1 | 2;
}) @{
	const config = useContext(context), controls = useThree((state) => state.controls) as {
		enabled: boolean;
	} | undefined;
	const divRef = useRef<HTMLDivElement | null>(null), objectRef = useRef<THREE.Group | null>(
		null,
	), offsetX0 = useRef(0), offsetY0 = useRef(0);
	const clickInfo = useRef<
		{ clickPoint: THREE.Vector3; e1: THREE.Vector3; e2: THREE.Vector3; plane: THREE.Plane } | null
	>(null);
	const [hovered, setHovered] = useState(false);
	const matrix = useMemo(() => {
		const a = dir1.clone().normalize(), b = dir2.clone().normalize();
		return new THREE.Matrix4().makeBasis(a, b, a.clone().cross(b));
	}, [dir1, dir2]);
	const pos1 = config.fixed ? 1 / 7 : config.scale / 7, length = config.fixed
		? 0.225
		: config.scale * 0.225, color = hovered ? config.hoveredColor : config.axisColors[axis];
	const points = useMemo(
		() => [
			new THREE.Vector3(),
			new THREE.Vector3(0, length, 0),
			new THREE.Vector3(length, length, 0),
			new THREE.Vector3(length, 0, 0),
			new THREE.Vector3(),
		],
		[length],
	);
	const down = useCallback((event: ThreeEvent<PointerEvent>) => {
		if (config.annotations && divRef.current) {
			divRef.current.innerText = `${config.translation.current[(axis + 1) % 3].toFixed(
				2,
			)}, ${config.translation.current[(axis + 2) % 3].toFixed(2)}`;
			divRef.current.style.display = 'block';
		}
		event.stopPropagation();
		const origin = new THREE.Vector3().setFromMatrixPosition(objectRef.current!.matrixWorld);
		const e1 = new THREE.Vector3().setFromMatrixColumn(
			objectRef.current!.matrixWorld,
			0,
		).normalize(), e2 = new THREE.Vector3().setFromMatrixColumn(
			objectRef.current!.matrixWorld,
			1,
		).normalize(), normal = new THREE.Vector3().setFromMatrixColumn(
			objectRef.current!.matrixWorld,
			2,
		).normalize();
		clickInfo.current = {
			clickPoint: event.point.clone(),
			e1,
			e2,
			plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, origin),
		};
		offsetX0.current = config.translation.current[(axis + 1) % 3];
		offsetY0.current = config.translation.current[(axis + 2) % 3];
		config.onDragStart({ component: 'Slider', axis, origin, directions: [e1, e2, normal] });
		if (controls) controls.enabled = false;
		captureTarget(event, true);
	}, [config, controls, axis]);
	const move = useCallback((event: ThreeEvent<PointerEvent>) => {
		event.stopPropagation();
		if (!hovered) setHovered(true);
		if (!clickInfo.current) return;
		const { clickPoint, e1, e2, plane } = clickInfo.current;
		ray.copy(event.ray);
		if (ray.intersectPlane(plane, intersection) === null) {
			ray.direction.negate();
			ray.intersectPlane(plane, intersection);
		}
		intersection.sub(clickPoint);
		let [x, y] = decompose(e1, e2, intersection);
		const [minX, maxX] =
			config.translationLimits?.[(axis + 1) % 3] || [undefined, undefined], [minY, maxY] =
			config.translationLimits?.[(axis + 2) % 3] || [undefined, undefined];
		if (minX !== undefined) x = Math.max(x, minX - offsetX0.current);
		if (maxX !== undefined) x = Math.min(x, maxX - offsetX0.current);
		if (minY !== undefined) y = Math.max(y, minY - offsetY0.current);
		if (maxY !== undefined) y = Math.min(y, maxY - offsetY0.current);
		config.translation.current[(axis + 1) % 3] = offsetX0.current + x;
		config.translation.current[(axis + 2) % 3] = offsetY0.current + y;
		if (config.annotations && divRef.current) divRef.current.innerText =
			`${config.translation.current[(axis + 1) % 3].toFixed(
				2,
			)}, ${config.translation.current[(axis + 2) % 3].toFixed(2)}`;
		config.onDrag(
			offsetMatrix.makeTranslation(x * e1.x + y * e2.x, x * e1.y + y * e2.y, x * e1.z + y * e2.z),
		);
	}, [config, axis, hovered]);
	const up = useCallback((event: ThreeEvent<PointerEvent>) => {
		if (config.annotations && divRef.current) divRef.current.style.display = 'none';
		event.stopPropagation();
		clickInfo.current = null;
		config.onDragEnd();
		if (controls) controls.enabled = true;
		captureTarget(event, false);
	}, [config, controls]);
	<group ref={objectRef} matrix={matrix} matrixAutoUpdate={false}>
		@if (config.annotations) {
			<Annotation position={[0, 0, 0]} divRef={divRef} className={config.annotationsClass} />
		}
		<group position={[pos1 * 1.7, pos1 * 1.7, 0]}>
			<mesh
				visible
				onPointerDown={down}
				onPointerMove={move}
				onPointerUp={up}
				onPointerOut={(event) => {
					event.stopPropagation();
					setHovered(false);
				}}
				scale={length}
				userData={config.userData}
				renderOrder={config.renderOrder}
			>
				<planeGeometry />
				<meshBasicMaterial
					transparent
					depthTest={config.depthTest}
					color={color}
					polygonOffset
					polygonOffsetFactor={-10}
					side={THREE.DoubleSide}
					fog={false}
				/>
			</mesh>
			<Line
				position={[-length / 2, -length / 2, 0]}
				transparent
				depthTest={config.depthTest}
				points={points}
				lineWidth={config.lineWidth}
				color={color as any}
				opacity={config.opacity}
				polygonOffset
				polygonOffsetFactor={-10}
				userData={config.userData}
				fog={false}
				renderOrder={config.renderOrder}
			/>
		</group>
	</group>
}

function angleBetween(
	clickPoint: THREE.Vector3,
	hit: THREE.Vector3,
	origin: THREE.Vector3,
	e1: THREE.Vector3,
	e2: THREE.Vector3,
): number {
	const click = scratch1.copy(clickPoint).sub(origin), current = scratch2.copy(hit).sub(origin);
	return Math.atan2(current.dot(e2) / e2.dot(e2), current.dot(e1) / e1.dot(e1)) -
		Math.atan2(click.dot(e2) / e2.dot(e2), click.dot(e1) / e1.dot(e1));
}
function minimizeAngle(value: number): number {
	let result =
		value -
		(Math.floor(value / (2 * Math.PI)) + (Math.floor(value / (2 * Math.PI)) < 0 ? 1 : 0)) * 2 *
			Math.PI;
	if (Math.abs(result) < 1e-6) return 0;
	if (result < 0) result += 2 * Math.PI;
	return result;
}

function AxisRotator({
	dir1,
	dir2,
	axis,
}: {
	dir1: THREE.Vector3;
	dir2: THREE.Vector3;
	axis: 0 | 1 | 2;
}) @{
	const config = useContext(context), controls = useThree((state) => state.controls) as {
		enabled: boolean;
	} | undefined;
	const divRef = useRef<HTMLDivElement | null>(null), objectRef = useRef<THREE.Group | null>(
		null,
	), angle0 = useRef(0), angle = useRef(0);
	const clickInfo = useRef<
		| {
				clickPoint: THREE.Vector3;
				origin: THREE.Vector3;
				e1: THREE.Vector3;
				e2: THREE.Vector3;
				normal: THREE.Vector3;
				plane: THREE.Plane;
		  }
		| null
	>(null);
	const [hovered, setHovered] = useState(false);
	const matrix = useMemo(() => {
		const a = dir1.clone().normalize(), b = dir2.clone().normalize();
		return new THREE.Matrix4().makeBasis(a, b, a.clone().cross(b));
	}, [dir1, dir2]);
	const r = config.fixed ? 0.65 : config.scale * 0.65;
	const arc = useMemo(
		() => Array.from(
			{ length: 33 },
			(_, index) => new THREE.Vector3(Math.cos(index * Math.PI / 64) * r, Math.sin(
				index * Math.PI / 64,
			) *
				r, 0),
		),
		[r],
	);
	const down = useCallback((event: ThreeEvent<PointerEvent>) => {
		if (config.annotations && divRef.current) {
			divRef.current.innerText = `${(angle.current * 180 / Math.PI).toFixed(0)}º`;
			divRef.current.style.display = 'block';
		}
		event.stopPropagation();
		const origin = new THREE.Vector3().setFromMatrixPosition(objectRef.current!.matrixWorld), e1 =
			new THREE.Vector3().setFromMatrixColumn(objectRef.current!.matrixWorld, 0).normalize(), e2 =
			new THREE.Vector3().setFromMatrixColumn(
				objectRef.current!.matrixWorld,
				1,
			).normalize(), normal = new THREE.Vector3().setFromMatrixColumn(
			objectRef.current!.matrixWorld,
			2,
		).normalize();
		clickInfo.current = {
			clickPoint: event.point.clone(),
			origin,
			e1,
			e2,
			normal,
			plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, origin),
		};
		config.onDragStart({ component: 'Rotator', axis, origin, directions: [e1, e2, normal] });
		if (controls) controls.enabled = false;
		captureTarget(event, true);
	}, [config, controls, axis]);
	const move = useCallback((event: ThreeEvent<PointerEvent>) => {
		event.stopPropagation();
		if (!hovered) setHovered(true);
		if (!clickInfo.current) return;
		const info = clickInfo.current;
		ray.copy(event.ray);
		if (ray.intersectPlane(info.plane, intersection) === null) {
			ray.direction.negate();
			ray.intersectPlane(info.plane, intersection);
		}
		let delta = angleBetween(info.clickPoint, intersection, info.origin, info.e1, info.e2);
		if (event.shiftKey) delta = Math.round(delta * 180 / Math.PI / 10) * 10 * Math.PI / 180;
		const [min, max] = config.rotationLimits?.[axis] || [undefined, undefined];
		if (min !== undefined && max !== undefined && max - min < 2 * Math.PI) {
			delta = minimizeAngle(delta);
			if (delta > Math.PI) delta -= 2 * Math.PI;
			delta = THREE.MathUtils.clamp(delta, min - angle0.current, max - angle0.current);
			angle.current = angle0.current + delta;
		} else {
			angle.current = minimizeAngle(angle0.current + delta);
			if (angle.current > Math.PI) angle.current -= 2 * Math.PI;
		}
		if (config.annotations && divRef.current) divRef.current.innerText = `${(angle.current * 180 /
			Math.PI).toFixed(0)}º`;
		rotationMatrix.makeRotationAxis(info.normal, delta);
		rotationMatrix.setPosition(
			scratch1.copy(info.origin).applyMatrix4(rotationMatrix).sub(info.origin).negate(),
		);
		config.onDrag(rotationMatrix);
	}, [config, axis, hovered]);
	const up = useCallback((event: ThreeEvent<PointerEvent>) => {
		if (config.annotations && divRef.current) divRef.current.style.display = 'none';
		event.stopPropagation();
		angle0.current = angle.current;
		clickInfo.current = null;
		config.onDragEnd();
		if (controls) controls.enabled = true;
		captureTarget(event, false);
	}, [config, controls]);
	<group
		ref={objectRef}
		onPointerDown={down}
		onPointerMove={move}
		onPointerUp={up}
		onPointerOut={(event) => {
			event.stopPropagation();
			setHovered(false);
		}}
		matrix={matrix}
		matrixAutoUpdate={false}
	>
		@if (config.annotations) {
			<Annotation position={[r, r, 0]} divRef={divRef} className={config.annotationsClass} />
		}
		<Line
			points={arc}
			lineWidth={config.lineWidth * 4}
			visible={false}
			userData={config.userData}
		/>
		<Line
			{...{ raycast: () => null } as any}
			transparent
			depthTest={config.depthTest}
			points={arc}
			lineWidth={config.lineWidth}
			side={THREE.DoubleSide}
			color={(hovered ? config.hoveredColor : config.axisColors[axis]) as any}
			opacity={config.opacity}
			polygonOffset
			polygonOffsetFactor={-10}
			renderOrder={config.renderOrder}
			fog={false}
		/>
	</group>
}

function ScalingSphere({ direction, axis }: { direction: THREE.Vector3; axis: 0 | 1 | 2 }) @{
	const config = useContext(context), size = useThree((state) => state.size), controls = useThree(
		(state) => state.controls,
	) as { enabled: boolean } | undefined;
	const divRef = useRef<HTMLDivElement | null>(null), objectRef = useRef<THREE.Group | null>(
		null,
	), meshRef = useRef<THREE.Mesh | null>(null), scale0 = useRef(1), scaleCurrent = useRef(1);
	const clickInfo = useRef<
		| {
				clickPoint: THREE.Vector3;
				dir: THREE.Vector3;
				localToWorld: THREE.Matrix4;
				worldToLocal: THREE.Matrix4;
				multiplier: number;
		  }
		| null
	>(null);
	const [hovered, setHovered] = useState(false);
	const position = config.fixed ? 1.2 : 1.2 * config.scale;
	const radius = config.fixed ? (config.lineWidth / config.scale) * 1.8 : config.scale / 22.5;
	const matrix = useMemo(() => directionMatrix(direction), [direction]);
	const down = useCallback((event: ThreeEvent<PointerEvent>) => {
		if (config.annotations && divRef.current) {
			divRef.current.innerText = scaleCurrent.current.toFixed(2);
			divRef.current.style.display = 'block';
		}
		event.stopPropagation();
		const rotation = new THREE.Matrix4().extractRotation(objectRef.current!.matrixWorld), origin =
			new THREE.Vector3().setFromMatrixPosition(objectRef.current!.matrixWorld), dir =
			direction.clone().applyMatrix4(rotation).normalize(), localToWorld =
			objectRef.current!.matrixWorld.clone();
		clickInfo.current = {
			clickPoint: event.point.clone(),
			dir,
			localToWorld,
			worldToLocal: localToWorld.clone().invert(),
			multiplier: config.fixed
				? 1 /
					calculateScaleFactor(
						objectRef.current!.getWorldPosition(scratch1),
						config.scale,
						event.camera,
						size,
					)
				: 1,
		};
		config.onDragStart({ component: 'Sphere', axis, origin, directions: [dir] });
		if (controls) controls.enabled = false;
		captureTarget(event, true);
	}, [config, controls, direction, axis, size]);
	const move = useCallback((event: ThreeEvent<PointerEvent>) => {
		event.stopPropagation();
		if (!hovered) setHovered(true);
		if (!clickInfo.current) return;
		const info = clickInfo.current, offsetLocal =
			calculateOffset(info.clickPoint, info.dir, event.ray.origin, event.ray.direction) *
			info.multiplier, offset = config.fixed ? offsetLocal : offsetLocal / config.scale;
		let upscale = Math.pow(2, offset * 0.2);
		if (event.shiftKey) upscale = Math.round(upscale * 10) / 10;
		const [min, max] = config.scaleLimits?.[axis] || [1e-5, undefined];
		upscale = Math.max(upscale, min / scale0.current);
		if (max !== undefined) upscale = Math.min(upscale, max / scale0.current);
		scaleCurrent.current = scale0.current * upscale;
		meshRef.current!.position.set(0, position + offsetLocal, 0);
		if (config.annotations && divRef.current) divRef.current.innerText =
			scaleCurrent.current.toFixed(2);
		scaleVector.set(1, 1, 1).setComponent(axis, upscale);
		config.onDrag(
			scaleMatrix.makeScale(scaleVector.x, scaleVector.y, scaleVector.z).premultiply(
				info.localToWorld,
			).multiply(info.worldToLocal),
		);
	}, [config, axis, hovered, position]);
	const up = useCallback((event: ThreeEvent<PointerEvent>) => {
		if (config.annotations && divRef.current) divRef.current.style.display = 'none';
		event.stopPropagation();
		scale0.current = scaleCurrent.current;
		clickInfo.current = null;
		meshRef.current!.position.set(0, position, 0);
		config.onDragEnd();
		if (controls) controls.enabled = true;
		captureTarget(event, false);
	}, [config, controls, position]);
	<group ref={objectRef}>
		<group
			matrix={matrix}
			matrixAutoUpdate={false}
			onPointerDown={down}
			onPointerMove={move}
			onPointerUp={up}
			onPointerOut={(event) => {
				event.stopPropagation();
				setHovered(false);
			}}
		>
			@if (config.annotations) {
				<Annotation
					position={[0, position / 2, 0]}
					divRef={divRef}
					className={config.annotationsClass}
				/>
			}
			<mesh
				ref={meshRef}
				position={[0, position, 0]}
				renderOrder={config.renderOrder}
				userData={config.userData}
			>
				<sphereGeometry args={[radius, 12, 12]} />
				<meshBasicMaterial
					transparent
					depthTest={config.depthTest}
					color={hovered ? config.hoveredColor : config.axisColors[axis]}
					opacity={config.opacity}
					polygonOffset
					polygonOffsetFactor={-10}
				/>
			</mesh>
		</group>
	</group>
}

export function PivotControls({
	enabled = true,
	matrix,
	onDragStart,
	onDrag,
	onDragEnd,
	autoTransform = true,
	anchor,
	disableAxes = false,
	disableSliders = false,
	disableRotations = false,
	disableScaling = false,
	activeAxes = [true, true, true],
	offset = [0, 0, 0],
	rotation = [0, 0, 0],
	scale = 1,
	lineWidth = 4,
	fixed = false,
	translationLimits,
	rotationLimits,
	scaleLimits,
	depthTest = true,
	renderOrder = 500,
	axisColors = ['#ff2060', '#20df80', '#2080ff'],
	hoveredColor = '#ffff40',
	annotations = false,
	annotationsClass,
	opacity = 1,
	visible = true,
	userData,
	children,
	ref: forwardedRef,
	...props
}: PivotControlsProps) @{
	const invalidate = useThree((state) => state.invalidate);
	const parentRef = useRef<THREE.Group | null>(null), ref = useRef<THREE.Group | null>(
		null,
	), gizmoRef = useRef<THREE.Group | null>(null), childrenRef = useRef<THREE.Group | null>(null);
	const translation = useRef<[number, number, number]>([0, 0, 0]), cameraScale = useRef(
		new THREE.Vector3(1, 1, 1),
	), gizmoScale = useRef(new THREE.Vector3(1, 1, 1));
	useLayoutEffect(() => {
		if (!anchor) return;
		childrenRef.current!.updateWorldMatrix(true, true);
		mPInv.copy(childrenRef.current!.matrixWorld).invert();
		bb.makeEmpty();
		childrenRef.current!.traverse((object: any) => {
			if (!object.geometry) return;
			if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
			mL.copy(object.matrixWorld).premultiply(mPInv);
			bbObj.copy(object.geometry.boundingBox).applyMatrix4(mL);
			bb.union(bbObj);
		});
		vCenter.copy(bb.max).add(bb.min).multiplyScalar(0.5);
		vSize.copy(bb.max).sub(bb.min).multiplyScalar(0.5);
		vAnchorOffset.copy(vSize).multiply(new THREE.Vector3(...anchor)).add(vCenter);
		vPosition.set(...offset).add(vAnchorOffset);
		gizmoRef.current!.position.copy(vPosition);
		invalidate();
	});
	const config = useMemo<PivotContext>(
		() => ({
			onDragStart: (info) => {
				mL0.copy(ref.current!.matrix);
				mW0.copy(ref.current!.matrixWorld);
				onDragStart?.(info);
				invalidate();
			},
			onDrag: (deltaWorld) => {
				mP.copy(parentRef.current!.matrixWorld);
				mPInv.copy(mP).invert();
				mW.copy(mW0).premultiply(deltaWorld);
				mL.copy(mW).premultiply(mPInv);
				mL0Inv.copy(mL0).invert();
				mdL.copy(mL).multiply(mL0Inv);
				if (autoTransform) ref.current!.matrix.copy(mL);
				onDrag?.(mL, mdL, mW, deltaWorld);
				invalidate();
			},
			onDragEnd: () => {
				onDragEnd?.();
				invalidate();
			},
			translation,
			translationLimits,
			rotationLimits,
			// Pinned parity: Drei 10.7.7 accepts scaleLimits but omits it from this provider.
			axisColors,
			hoveredColor,
			opacity,
			scale,
			lineWidth,
			fixed,
			depthTest,
			renderOrder,
			userData,
			annotations,
			annotationsClass,
		}),
		[
			onDragStart,
			onDrag,
			onDragEnd,
			translationLimits,
			rotationLimits,
			scaleLimits,
			depthTest,
			scale,
			lineWidth,
			fixed,
			...axisColors,
			hoveredColor,
			opacity,
			userData,
			autoTransform,
			annotations,
			annotationsClass,
			renderOrder,
		],
	);
	useFrame((state) => {
		if (fixed) cameraScale.current.setScalar(
			calculateScaleFactor(
				gizmoRef.current!.getWorldPosition(scratch1),
				scale,
				state.camera,
				state.size,
			),
		);
		if (matrix instanceof THREE.Matrix4) ref.current!.matrix = matrix;
		ref.current!.updateWorldMatrix(true, true);
		mG.makeRotationFromEuler(gizmoRef.current!.rotation).setPosition(
			gizmoRef.current!.position,
		).premultiply(ref.current!.matrixWorld);
		gizmoScale.current.setFromMatrixScale(mG);
		vScale.copy(cameraScale.current).divide(gizmoScale.current);
		if (
			Math.abs(gizmoRef.current!.scale.x - vScale.x) > 1e-4 ||
				Math.abs(gizmoRef.current!.scale.y - vScale.y) > 1e-4 ||
				Math.abs(gizmoRef.current!.scale.z - vScale.z) > 1e-4
		) {
			gizmoRef.current!.scale.copy(vScale);
			state.invalidate();
		}
	});
	useImperativeHandle((forwardedRef ?? null) as any, () => ref.current!, []);
	<context.Provider value={config}>
		<group ref={parentRef}>
			<group ref={ref} matrix={matrix} matrixAutoUpdate={false} {...props}>
				<group visible={visible} ref={gizmoRef} position={offset} rotation={rotation}>
					@if (enabled && !disableAxes && activeAxes[0]) {
						<AxisArrow axis={0} direction={xDir} />
					}
					@if (enabled && !disableAxes && activeAxes[1]) {
						<AxisArrow axis={1} direction={yDir} />
					}
					@if (enabled && !disableAxes && activeAxes[2]) {
						<AxisArrow axis={2} direction={zDir} />
					}
					@if (enabled && !disableSliders && activeAxes[0] && activeAxes[1]) {
						<PlaneSlider axis={2} dir1={xDir} dir2={yDir} />
					}
					@if (enabled && !disableSliders && activeAxes[0] && activeAxes[2]) {
						<PlaneSlider axis={1} dir1={zDir} dir2={xDir} />
					}
					@if (enabled && !disableSliders && activeAxes[2] && activeAxes[1]) {
						<PlaneSlider axis={0} dir1={yDir} dir2={zDir} />
					}
					@if (enabled && !disableRotations && activeAxes[0] && activeAxes[1]) {
						<AxisRotator axis={2} dir1={xDir} dir2={yDir} />
					}
					@if (enabled && !disableRotations && activeAxes[0] && activeAxes[2]) {
						<AxisRotator axis={1} dir1={zDir} dir2={xDir} />
					}
					@if (enabled && !disableRotations && activeAxes[2] && activeAxes[1]) {
						<AxisRotator axis={0} dir1={yDir} dir2={zDir} />
					}
					@if (enabled && !disableScaling && activeAxes[0]) {
						<ScalingSphere axis={0} direction={xDir} />
					}
					@if (enabled && !disableScaling && activeAxes[1]) {
						<ScalingSphere axis={1} direction={yDir} />
					}
					@if (enabled && !disableScaling && activeAxes[2]) {
						<ScalingSphere axis={2} direction={zDir} />
					}
				</group>
				<group ref={childrenRef}>{children}</group>
			</group>
		</group>
	</context.Provider>
}

export type { OnDragStartProps, PivotContext } from './context.js';
