/** @jsxImportSource @octanejs/three/intrinsics */
import {
	extend,
	type ThreeElement,
	type ThreeElements,
	type ThreeRef,
	useFrame,
	useInstanceHandle,
} from '@octanejs/three';
import {
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from '@octanejs/three/renderer';
import {
	createContext,
	type Context,
	type OctaneNode,
	useContext,
} from 'octane';
import {
	defineUniversalComponent,
	universalComponent,
	universalContext,
	type UniversalComponent,
	type UniversalRenderable,
} from 'octane/universal';
import * as THREE from 'three';
import { isOctaneChildrenBlock } from './octane-element.js';

type PositionMeshRef = { current: PositionMesh | null };
type InstancedMeshRef = { current: THREE.InstancedMesh | null };
type Api = {
	getParent: () => InstancedMeshRef;
	subscribe: <T extends PositionMesh>(ref: { current: T | null }) => () => void;
};

export type InstancesProps = Omit<ThreeElements['instancedMesh'], 'ref' | 'args'> & {
	context?: Context<Api | null>;
	range?: number;
	limit?: number;
	frames?: number;
	children?: OctaneNode | ((Instance: InstanceComponent) => OctaneNode);
};

export type InstanceProps = Omit<ThreeElement<typeof PositionMesh>, 'ref'> & {
	context?: Context<Api | null>;
};

export type InstancedAttributeProps = Omit<ThreeElements['instancedBufferAttribute'], 'ref' | 'args'> & {
	name: string;
	defaultValue: any;
	normalized?: boolean;
	usage?: number;
};

type InstanceComponent = UniversalComponent<InstanceProps & { ref?: ThreeRef<PositionMesh> }>;

const instanceLocalMatrix = new THREE.Matrix4();
const instanceWorldMatrix = new THREE.Matrix4();
const instanceIntersects: THREE.Intersection[] = [];
const raycastMesh = new THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>();

export class PositionMesh extends THREE.Group {
	color = new THREE.Color('white');
	instance: InstancedMeshRef = { current: null };
	instanceKey: PositionMeshRef = { current: null };

	get geometry(): THREE.BufferGeometry | undefined {
		return this.instance.current?.geometry;
	}

	override raycast(raycaster: THREE.Raycaster, intersects: THREE.Intersection[]): void {
		const parent = this.instance.current;
		if (!parent?.geometry || !parent.material) return;
		raycastMesh.geometry = parent.geometry;
		const instanceId = (parent.userData.instances as PositionMeshRef[]).indexOf(this.instanceKey);
		if (instanceId === -1 || instanceId > parent.count) return;
		parent.getMatrixAt(instanceId, instanceLocalMatrix);
		instanceWorldMatrix.multiplyMatrices(parent.matrixWorld, instanceLocalMatrix);
		raycastMesh.matrixWorld = instanceWorldMatrix;
		const material = Array.isArray(parent.material) ? parent.material[0] : parent.material;
		if (material) raycastMesh.material.side = material.side;
		raycastMesh.raycast(raycaster, instanceIntersects);
		for (const intersect of instanceIntersects) {
			intersect.instanceId = instanceId;
			intersect.object = this;
			intersects.push(intersect);
		}
		instanceIntersects.length = 0;
	}
}

const PositionMeshElement = extend(PositionMesh);
const globalContext = createContext<Api | null>(null);
const parentMatrix = new THREE.Matrix4();
const instanceMatrix = new THREE.Matrix4();
const tempMatrix = new THREE.Matrix4();
const translation = new THREE.Vector3();
const rotation = new THREE.Quaternion();
const scale = new THREE.Vector3();

function assignRef<T>(ref: ThreeRef<T> | undefined, value: T | null): void {
	if (Array.isArray(ref)) for (const item of ref) assignRef(item, value);
	else if (typeof ref === 'function') ref(value);
	else if (ref && 'current' in ref) ref.current = value;
}

export function Instance({ context, children, ref, ...props }: InstanceProps & {
	ref?: ThreeRef<PositionMesh>;
}) @{
	const group = useRef<PositionMesh | null>(null);
	const api = useContext(context ?? globalContext);
	if (!api) throw new Error('Instance must be used inside Instances component.');
	const mergedRef = useMemo(
		() => (value: PositionMesh | null) => {
			group.current = value;
			assignRef(ref, value);
		},
		[ref],
	);
	useLayoutEffect(() => api.subscribe(group), [api]);
	<PositionMeshElement
		instance={api.getParent()}
		instanceKey={group}
		ref={mergedRef}
		{...props as any}
	>
		{children}
	</PositionMeshElement>
}

export function Instances({
	context,
	children,
	range,
	limit = 1000,
	frames = Infinity,
	ref,
	...props
}: InstancesProps & { ref?: ThreeRef<THREE.InstancedMesh> }) @{
	const [{ localContext, LocalInstance }] = useState(() => {
		const local = createContext<Api | null>(null);
		const BoundInstance = defineUniversalComponent<InstanceProps & { ref?: ThreeRef<PositionMesh> }>(
			'three',
			(instanceProps) => universalComponent('three', Instance as any, { ...instanceProps, context: local }),
		);
		return { localContext: local, LocalInstance: BoundInstance };
	});
	const parentRef = useRef<THREE.InstancedMesh | null>(null);
	const [instances] = useState<PositionMeshRef[]>([]);
	const [[matrices, colors]] = useState(() => {
		const matrixArray = new Float32Array(limit * 16);
		for (let index = 0; index < limit; index++) tempMatrix.identity().toArray(matrixArray, index * 16);
		return [matrixArray, Float32Array.from({ length: limit * 3 }, () => 1)];
	});
	const mergedRef = useMemo(
		() => (value: THREE.InstancedMesh | null) => {
			parentRef.current = value;
			assignRef(ref, value);
		},
		[ref],
	);
	const api = useMemo<Api>(() => ({
		getParent: () => parentRef,
		subscribe(instanceRef) {
			instances.push(instanceRef);
			return () => {
				const index = instances.findIndex((item) => item.current === instanceRef.current);
				if (index !== -1) instances.splice(index, 1);
			};
		},
	}), [instances]);
	const iterations = useRef(0);

	useEffect(() => {
		if (parentRef.current) parentRef.current.instanceMatrix.needsUpdate = true;
	});
	useFrame(() => {
		const parent = parentRef.current;
		if (!parent || (frames !== Infinity && iterations.current >= frames)) return;
		parent.updateMatrix();
		parent.updateMatrixWorld();
		parentMatrix.copy(parent.matrixWorld).invert();
		const count = Math.min(limit, range ?? limit, instances.length);
		parent.count = count;
		parent.instanceMatrix.updateRanges[0] = { start: 0, count: count * 16 };
		if (parent.instanceColor) parent.instanceColor.updateRanges[0] = { start: 0, count: count * 3 };
		for (let index = 0; index < instances.length; index++) {
			const instance = instances[index]?.current;
			if (!instance) continue;
			instance.matrixWorld.decompose(translation, rotation, scale);
			instanceMatrix.compose(translation, rotation, scale).premultiply(parentMatrix);
			instanceMatrix.toArray(matrices, index * 16);
			parent.instanceMatrix.needsUpdate = true;
			instance.color.toArray(colors, index * 3);
			if (parent.instanceColor) parent.instanceColor.needsUpdate = true;
		}
		iterations.current++;
	});
	const providedChildren = typeof children === 'function' && !isOctaneChildrenBlock(children)
		? universalContext(localContext, api, children(LocalInstance) as UniversalRenderable)
		: universalContext(context ?? globalContext, api, children as UniversalRenderable);

	<instancedMesh
		userData={{ instances, limit, frames }}
		matrixAutoUpdate={false}
		ref={mergedRef}
		args={[null as any, null as any, 0]}
		raycast={() => null}
		{...props as any}
	>
		<instancedBufferAttribute attach="instanceMatrix" args={[matrices, 16]} usage={THREE.DynamicDrawUsage} />
		<instancedBufferAttribute attach="instanceColor" args={[colors, 3]} usage={THREE.DynamicDrawUsage} />
		{providedChildren}
	</instancedMesh>
}

export interface MergedProps extends Omit<InstancesProps, 'children'> {
	meshes: THREE.Mesh[] | Record<string, THREE.Object3D>;
	children: (...instances: [InstanceComponent & Record<string, InstanceComponent>, ...InstanceComponent[]]) => OctaneNode;
}

function renderRecursive(
	render: (args: unknown[]) => OctaneNode,
	components: Array<(children: (value: unknown) => UniversalRenderable) => UniversalRenderable>,
	results: unknown[] = [],
): UniversalRenderable {
	if (!components[0]) return render(results) as UniversalRenderable;
	const nextRender = (value: unknown) => renderRecursive(render, components.slice(1), [...results, value]);
	return components[0](nextRender);
}

export function Merged({ meshes, children, ref, ...props }: MergedProps & {
	ref?: ThreeRef<THREE.Group>;
}) @{
	const isArray = Array.isArray(meshes);
	if (!isArray) {
		for (const key of Object.keys(meshes)) if (!(meshes[key] as any).isMesh) delete meshes[key];
	}
	const meshValues = (isArray ? meshes : Object.values(meshes)) as THREE.Mesh[];
	const components = meshValues.map(({ geometry, material }) => (
		(child: (value: unknown) => UniversalRenderable) => universalComponent(
			'three',
			Instances as any,
			{ ...props, geometry, material, children: child },
			geometry.uuid,
		)
	));
	const render = (args: unknown[]) => isArray
		? children(...args as [InstanceComponent & Record<string, InstanceComponent>, ...InstanceComponent[]])
		: children(Object.keys(meshes).filter((key) => (meshes[key] as any).isMesh).reduce(
			(accumulator, key, index) => ({ ...accumulator, [key]: args[index] }),
			{},
		) as InstanceComponent & Record<string, InstanceComponent>);
	const rendered = typeof children === 'function' && !isOctaneChildrenBlock(children)
		? renderRecursive(render, components)
		: children as UniversalRenderable;
	<group ref={ref}>{rendered}</group>
}

export function createInstances<T = InstanceProps>() {
	const context = createContext<Api | null>(null);
	const BoundInstances = defineUniversalComponent<InstancesProps & { ref?: ThreeRef<THREE.InstancedMesh> }>(
		'three',
		(props) => universalComponent('three', Instances as any, { ...props, context }),
	);
	const BoundInstance = defineUniversalComponent<T & InstanceProps & { ref?: ThreeRef<PositionMesh & T> }>(
		'three',
		(props) => universalComponent('three', Instance as any, { ...props, context }),
	);
	return [BoundInstances, BoundInstance] as const;
}

export function InstancedAttribute({
	name,
	defaultValue,
	normalized,
	usage = THREE.DynamicDrawUsage,
	ref,
	...props
}: InstancedAttributeProps & { ref?: ThreeRef<THREE.InstancedBufferAttribute> }) @{
	const attributeRef = useRef<THREE.InstancedBufferAttribute | null>(null);
	const instance = useInstanceHandle(attributeRef);
	const mergedRef = useMemo(
		() => (value: THREE.InstancedBufferAttribute | null) => {
			attributeRef.current = value;
			assignRef(ref, value);
		},
		[ref],
	);
	let iterations = 0;
	useLayoutEffect(() => {
		const attribute = attributeRef.current;
		const parent = instance.current?.parent?.object as THREE.InstancedMesh | undefined;
		if (!attribute || !parent) return;
		parent.geometry.attributes[name] = attribute;
		const value = Array.isArray(defaultValue) ? defaultValue : [defaultValue];
		const array = Array.from({ length: parent.userData.limit }, () => value).flat();
		attribute.array = new Float32Array(array);
		attribute.itemSize = value.length;
		(attribute as any).count = array.length / attribute.itemSize;
		return () => { delete parent.geometry.attributes[name]; };
	}, [name]);
	useFrame(() => {
		const attribute = attributeRef.current;
		const parent = instance.current?.parent?.object as THREE.InstancedMesh | undefined;
		if (!attribute || !parent || (parent.userData.frames !== Infinity && iterations >= parent.userData.frames)) return;
		for (let index = 0; index < parent.userData.instances.length; index++) {
			const item = parent.userData.instances[index].current as Record<string, any>;
			const value = item[name];
			if (value === undefined) continue;
			attribute.set(
				Array.isArray(value) ? value : typeof value.toArray === 'function' ? value.toArray() : [value],
				index * attribute.itemSize,
			);
			attribute.needsUpdate = true;
		}
		iterations++;
	});
	<instancedBufferAttribute
		ref={mergedRef}
		args={[new Float32Array(0), 1]}
		usage={usage}
		normalized={normalized}
		{...props as any}
	/>
}
