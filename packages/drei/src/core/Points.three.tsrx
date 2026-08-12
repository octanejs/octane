/** @jsxImportSource @octanejs/three/intrinsics */
import {
	extend,
	type ThreeElement,
	type ThreeElements,
	type ThreeRef,
	useFrame,
} from '@octanejs/three';
import {
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from '@octanejs/three/renderer';
import { createContext, type OctaneNode, useContext } from 'octane';
import * as THREE from 'three';

type PointRef = { current: PositionPoint | null };
type PointsRef = { current: THREE.Points | null };

type Api = {
	getParent: () => PointsRef;
	subscribe: (ref: PointRef) => () => void;
};

export type PointsInstancesProps = Omit<ThreeElements['points'], 'ref'> & {
	range?: number;
	limit?: number;
	children?: OctaneNode;
};

const inverseMatrix = new THREE.Matrix4();
const ray = new THREE.Ray();
const sphere = new THREE.Sphere();
const worldPosition = new THREE.Vector3();

export class PositionPoint extends THREE.Group {
	size = 0;
	color = new THREE.Color('white');
	instance: PointsRef = { current: null };
	instanceKey: PointRef = { current: null };

	get geometry(): THREE.BufferGeometry | undefined {
		return this.instance.current?.geometry;
	}

	override raycast(raycaster: THREE.Raycaster, intersects: THREE.Intersection[]): void {
		const parent = this.instance.current;
		if (!parent?.geometry) return;
		const instances = parent.userData.instances as PointRef[];
		const instanceId = instances.indexOf(this.instanceKey);
		if (instanceId === -1 || instanceId > parent.geometry.drawRange.count) return;

		const threshold = raycaster.params.Points?.threshold ?? 1;
		sphere.set(this.getWorldPosition(worldPosition), threshold);
		if (!raycaster.ray.intersectsSphere(sphere)) return;

		inverseMatrix.copy(parent.matrixWorld).invert();
		ray.copy(raycaster.ray).applyMatrix4(inverseMatrix);

		const localThreshold = threshold / ((this.scale.x + this.scale.y + this.scale.z) / 3);
		const rayPointDistanceSq = ray.distanceSqToPoint(this.position);
		if (rayPointDistanceSq < localThreshold * localThreshold) {
			const intersectPoint = new THREE.Vector3();
			ray.closestPointToPoint(this.position, intersectPoint);
			intersectPoint.applyMatrix4(this.matrixWorld);
			const distance = raycaster.ray.origin.distanceTo(intersectPoint);
			if (distance < raycaster.near || distance > raycaster.far) return;
			intersects.push({
				distance,
				distanceToRay: Math.sqrt(rayPointDistanceSq),
				point: intersectPoint,
				index: instanceId,
				face: null,
				object: this,
			});
		}
	}
}

const PositionPointElement = extend(PositionPoint);
const PointsContext = createContext<Api | null>(null);
const parentMatrix = new THREE.Matrix4();
const localPosition = new THREE.Vector3();

function assignRef<T>(ref: ThreeRef<T> | undefined, value: T | null): void {
	if (Array.isArray(ref)) for (const item of ref) assignRef(item, value);
	else if (typeof ref === 'function') ref(value);
	else if (ref && 'current' in ref) ref.current = value;
}

function PointsInstances({
	children,
	range,
	limit = 1000,
	ref,
	...props
}: PointsInstancesProps & { ref?: ThreeRef<THREE.Points> }) @{
	const parentRef = useRef<THREE.Points | null>(null);
	const [refs, setRefs] = useState<PointRef[]>([]);
	const [[positions, colors, sizes]] = useState(() => [
		new Float32Array(limit * 3),
		Float32Array.from({ length: limit * 3 }, () => 1),
		Float32Array.from({ length: limit }, () => 1),
	]);
	const mergedRef = useMemo(
		() => (value: THREE.Points | null) => {
			parentRef.current = value;
			assignRef(ref, value);
		},
		[ref],
	);
	const api = useMemo<Api>(() => ({
		getParent: () => parentRef,
		subscribe(pointRef) {
			setRefs((current) => [...current, pointRef]);
			return () => setRefs((current) => current.filter((item) => item.current !== pointRef.current));
		},
	}), []);

	useEffect(() => {
		const position = parentRef.current?.geometry.attributes.position;
		if (position) position.needsUpdate = true;
	});
	useFrame(() => {
		const parent = parentRef.current;
		if (!parent) return;
		parent.updateMatrix();
		parent.updateMatrixWorld();
		parentMatrix.copy(parent.matrixWorld).invert();
		parent.geometry.drawRange.count = Math.min(limit, range ?? limit, refs.length);
		for (let index = 0; index < refs.length; index++) {
			const point = refs[index]?.current;
			if (!point) continue;
			point.getWorldPosition(localPosition).applyMatrix4(parentMatrix);
			localPosition.toArray(positions, index * 3);
			parent.geometry.attributes.position!.needsUpdate = true;
			point.matrixWorldNeedsUpdate = true;
			point.color.toArray(colors, index * 3);
			parent.geometry.attributes.color!.needsUpdate = true;
			sizes.set([point.size], index);
			parent.geometry.attributes.size!.needsUpdate = true;
		}
	});

	<points
		userData={{ instances: refs }}
		matrixAutoUpdate={false}
		ref={mergedRef}
		raycast={() => null}
		{...props as any}
	>
		<bufferGeometry>
			<bufferAttribute attach="attributes-position" args={[positions, 3]} usage={THREE.DynamicDrawUsage} />
			<bufferAttribute attach="attributes-color" args={[colors, 3]} usage={THREE.DynamicDrawUsage} />
			<bufferAttribute attach="attributes-size" args={[sizes, 1]} usage={THREE.DynamicDrawUsage} />
		</bufferGeometry>
		<PointsContext.Provider value={api}>{children}</PointsContext.Provider>
	</points>
}

type PointProps = ThreeElement<typeof PositionPoint>;

export function Point({ children, ref, ...props }: PointProps & {
	ref?: ThreeRef<PositionPoint>;
}) @{
	const group = useRef<PositionPoint | null>(null);
	const api = useContext(PointsContext);
	if (!api) throw new Error('Point must be used inside Points component.');
	const mergedRef = useMemo(
		() => (value: PositionPoint | null) => {
			group.current = value;
			assignRef(ref, value);
		},
		[ref],
	);
	useLayoutEffect(() => api.subscribe(group), [api]);
	<PositionPointElement
		instance={api.getParent()}
		instanceKey={group}
		ref={mergedRef}
		{...props as any}
	>
		{children}
	</PositionPointElement>
}

export type PointsBuffersProps = Omit<ThreeElements['points'], 'ref'> & {
	positions: Float32Array;
	colors?: Float32Array;
	sizes?: Float32Array;
	stride?: 2 | 3;
};

export function PointsBuffer({
	children,
	positions,
	colors,
	sizes,
	stride = 3,
	ref,
	...props
}: PointsBuffersProps & { ref?: ThreeRef<THREE.Points> }) @{
	const pointsRef = useRef<THREE.Points | null>(null);
	const mergedRef = useMemo(
		() => (value: THREE.Points | null) => {
			pointsRef.current = value;
			assignRef(ref, value);
		},
		[ref],
	);
	useFrame(() => {
		const attributes = pointsRef.current?.geometry.attributes;
		if (!attributes) return;
		attributes.position!.needsUpdate = true;
		if (colors) attributes.color!.needsUpdate = true;
		if (sizes) attributes.size!.needsUpdate = true;
	});
	<points ref={mergedRef} {...props as any}>
		<bufferGeometry>
			<bufferAttribute attach="attributes-position" args={[positions, stride]} usage={THREE.DynamicDrawUsage} />
			@if (colors) {
				<bufferAttribute attach="attributes-color" args={[colors, stride]} count={colors.length / stride} usage={THREE.DynamicDrawUsage} />
			}
			@if (sizes) {
				<bufferAttribute attach="attributes-size" args={[sizes, 1]} count={sizes.length / stride} usage={THREE.DynamicDrawUsage} />
			}
		</bufferGeometry>
		{children}
	</points>
}

export function Points(props: (PointsBuffersProps | PointsInstancesProps) & {
	ref?: ThreeRef<THREE.Points>;
}) @{
	@if ((props as PointsBuffersProps).positions instanceof Float32Array) {
		<PointsBuffer {...props as PointsBuffersProps} />
	} @else {
		<PointsInstances {...props as PointsInstancesProps} />
	}
}
