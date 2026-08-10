/** @jsxImportSource @octanejs/three/intrinsics */
import {
	applyProps,
	extend,
	type Color as ColorProp,
	type ThreeElements,
	type ThreeRef,
	type Vector3 as Vector3Prop,
	useFrame,
} from '@octanejs/three';
import {
	useId,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from '@octanejs/three/renderer';
import { createContext, type OctaneNode, useContext } from 'octane';
import {
	BufferAttribute,
	Color,
	DynamicDrawUsage,
	Group,
	InstancedMesh,
	Material,
	Matrix4,
	MeshLambertMaterial,
	Quaternion,
	REVISION,
	type Texture,
	Vector3,
} from 'three';
import { useTexture } from './Texture.three.tsrx';

const CLOUD_URL = 'https://rawcdn.githack.com/pmndrs/drei-assets/9225a9f1fbd449d9411125c2f419b843d0308c9f/cloud.png';

type CloudState = {
	uuid: string;
	index: number;
	segments: number;
	dist: number;
	matrix: Matrix4;
	bounds: Vector3;
	position: Vector3;
	volume: number;
	length: number;
	ref: { current: Group | null };
	speed: number;
	growth: number;
	opacity: number;
	fade: number;
	density: number;
	rotation: number;
	rotationFactor: number;
	color: Color;
};

export type CloudsProps = Omit<ThreeElements['group'], 'ref'> & {
	texture?: string;
	limit?: number;
	range?: number;
	material?: typeof Material;
	frustumCulled?: boolean;
	children?: OctaneNode;
};

export type CloudProps = Omit<ThreeElements['group'], 'ref'> & {
	seed?: number;
	segments?: number;
	bounds?: Vector3Prop;
	concentrate?: 'random' | 'inside' | 'outside';
	scale?: Vector3Prop;
	volume?: number;
	smallestVolume?: number;
	distribute?: ((cloud: CloudState, index: number) => { point: Vector3; volume?: number }) | null;
	growth?: number;
	speed?: number;
	fade?: number;
	opacity?: number;
	color?: ColorProp;
};

const parentMatrix = new Matrix4();
const translation = new Vector3();
const rotation = new Quaternion();
const cameraPosition = new Vector3();
const cameraQuaternion = new Quaternion();
const workScale = new Vector3();
const CloudsContext = createContext<{ current: CloudState[] } | null>(null);

function assignRef<T>(ref: ThreeRef<T> | undefined, value: T | null): void {
	if (Array.isArray(ref)) for (const item of ref) assignRef(item, value);
	else if (typeof ref === 'function') ref(value);
	else if (ref && 'current' in ref) ref.current = value;
}

export function Clouds({
	children,
	material = MeshLambertMaterial,
	texture = CLOUD_URL,
	range,
	limit = 200,
	frustumCulled,
	ref,
	...props
}: CloudsProps & { ref?: ThreeRef<Group> }) @{
	const CloudMaterialElement = useMemo(() => {
		const CloudMaterial = class extends (material as typeof MeshLambertMaterial) {
			constructor() {
				super();
				const opaqueFragment = Number.parseInt(REVISION.replace(/\D+/g, ''), 10) >= 154
					? 'opaque_fragment'
					: 'output_fragment';
				this.onBeforeCompile = (shader) => {
					shader.vertexShader = `attribute float cloudOpacity;
               varying float vOpacity;
              ` + shader.vertexShader.replace(
						'#include <fog_vertex>',
						`#include <fog_vertex>
                 vOpacity = cloudOpacity;
                `,
					);
					shader.fragmentShader = `varying float vOpacity;
              ` + shader.fragmentShader.replace(
						`#include <${opaqueFragment}>`,
						`#include <${opaqueFragment}>
                 gl_FragColor = vec4(outgoingLight, diffuseColor.a * vOpacity);
                `,
					);
				};
			}
		};
		return extend(CloudMaterial);
	}, [material]);
	const instance = useRef<InstancedMesh | null>(null);
	const [clouds] = useState<CloudState[]>([]);
	const cloudsRef = useMemo(() => ({ current: clouds }), [clouds]);
	const opacities = useMemo(() => Float32Array.from({ length: limit }, () => 1), [limit]);
	const colors = useMemo(() => Float32Array.from({ length: limit * 3 }, () => 1), [limit]);
	const cloudTexture = useTexture(texture, undefined) as Texture;
	const quaternion = new Quaternion();
	const direction = new Vector3(0, 0, 1);
	const position = new Vector3();
	const mergedRef = useMemo(
		() => (value: Group | null) => assignRef(ref, value),
		[ref],
	);

	useFrame((state, delta) => {
		const mesh = instance.current;
		if (!mesh) return;
		parentMatrix.copy(mesh.matrixWorld).invert();
		state.camera.matrixWorld.decompose(cameraPosition, cameraQuaternion, workScale);
		for (const config of clouds) {
			if (!config.ref.current) continue;
			config.ref.current.matrixWorld.decompose(translation, rotation, workScale);
			translation.add(position.copy(config.position).applyQuaternion(rotation).multiply(workScale));
			rotation.copy(cameraQuaternion).multiply(
				quaternion.setFromAxisAngle(direction, (config.rotation += delta * config.rotationFactor)),
			);
			workScale.multiplyScalar(
				config.volume + ((1 + Math.sin(state.clock.elapsedTime * config.density * config.speed)) / 2) * config.growth,
			);
			config.matrix.compose(translation, rotation, workScale).premultiply(parentMatrix);
			config.dist = translation.distanceTo(cameraPosition);
		}
		clouds.sort((left, right) => right.dist - left.dist);
		for (let index = 0; index < clouds.length; index++) {
			const config = clouds[index]!;
			opacities[index] = config.opacity * (config.dist < config.fade - 1 ? config.dist / config.fade : 1);
			mesh.setMatrixAt(index, config.matrix);
			mesh.setColorAt(index, config.color);
		}
		mesh.geometry.attributes.cloudOpacity!.needsUpdate = true;
		mesh.instanceMatrix.needsUpdate = true;
		if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
	});

	useLayoutEffect(() => {
		const mesh = instance.current;
		if (!mesh) return;
		const count = Math.min(limit, range ?? limit, clouds.length);
		mesh.count = count;
		mesh.instanceMatrix.updateRanges[0] = { start: 0, count: count * 16 };
		if (mesh.instanceColor) mesh.instanceColor.updateRanges[0] = { start: 0, count: count * 3 };
		(mesh.geometry.attributes.cloudOpacity as BufferAttribute).updateRanges[0] = { start: 0, count };
	});

	let imageBounds = [cloudTexture.image?.width ?? 1, cloudTexture.image?.height ?? 1];
	const maximum = Math.max(imageBounds[0]!, imageBounds[1]!);
	imageBounds = [imageBounds[0]! / maximum, imageBounds[1]! / maximum];
	<group ref={mergedRef} {...props}>
		<CloudsContext.Provider value={cloudsRef}>
			{children}
			<instancedMesh
				matrixAutoUpdate={false}
				ref={instance}
				args={[null as any, null as any, limit]}
				frustumCulled={frustumCulled}
			>
				<instancedBufferAttribute usage={DynamicDrawUsage} attach="instanceColor" args={[colors, 3]} />
				<planeGeometry args={imageBounds as [number, number]}>
					<instancedBufferAttribute usage={DynamicDrawUsage} attach="attributes-cloudOpacity" args={[opacities, 1]} />
				</planeGeometry>
				<CloudMaterialElement map={cloudTexture} transparent={true} depthWrite={false} />
			</instancedMesh>
		</CloudsContext.Provider>
	</group>
}

export function CloudInstance({
	opacity = 1,
	speed = 0,
	bounds = [5, 1, 1],
	segments = 20,
	color = '#ffffff',
	fade = 10,
	volume = 6,
	smallestVolume = 0.25,
	distribute = null,
	growth = 4,
	concentrate = 'inside',
	seed = Math.random(),
	ref,
	...props
}: CloudProps & { ref?: ThreeRef<Group> }) @{
	const random = () => {
		const value = Math.sin(seed++) * 10000;
		return value - Math.floor(value);
	};
	const parent = useContext(CloudsContext);
	if (!parent) throw new Error('CloudInstance must be used inside Clouds component.');
	const group = useRef<Group | null>(null);
	const uuid = useId();
	const clouds = useMemo<CloudState[]>(() => Array.from({ length: segments }, (_, index) => ({
		segments,
		bounds: new Vector3(1, 1, 1),
		position: new Vector3(),
		uuid,
		index,
		ref: group,
		dist: 0,
		matrix: new Matrix4(),
		color: new Color(),
		rotation: index * (Math.PI / segments),
		volume: 0,
		length: 0,
		speed: 0,
		growth: 0,
		opacity: 0,
		fade: 0,
		density: 0,
		rotationFactor: 0,
	})), [segments, uuid]);
	const mergedRef = useMemo(
		() => (value: Group | null) => { group.current = value; assignRef(ref, value); },
		[ref],
	);

	useLayoutEffect(() => {
		for (let index = 0; index < clouds.length; index++) {
			const cloud = clouds[index]!;
			applyProps(cloud as any, {
				volume,
				color,
				speed,
				growth,
				opacity,
				fade,
				bounds,
				density: Math.max(0.5, random()),
				rotationFactor: Math.max(0.2, 0.5 * random()) * speed,
			});
			const distributed = distribute?.(cloud, index);
			if (distributed || segments > 1) {
				cloud.position.copy(cloud.bounds).multiply(distributed?.point ?? new Vector3(
					random() * 2 - 1,
					random() * 2 - 1,
					random() * 2 - 1,
				));
			}
			const xDifference = Math.abs(cloud.position.x);
			const yDifference = Math.abs(cloud.position.y);
			const zDifference = Math.abs(cloud.position.z);
			const maximum = Math.max(xDifference, yDifference, zDifference);
			cloud.length = 1;
			if (xDifference === maximum) cloud.length -= xDifference / cloud.bounds.x;
			if (yDifference === maximum) cloud.length -= yDifference / cloud.bounds.y;
			if (zDifference === maximum) cloud.length -= zDifference / cloud.bounds.z;
			cloud.volume = (distributed?.volume !== undefined
				? distributed.volume
				: Math.max(
					Math.max(0, smallestVolume),
					concentrate === 'random' ? random() : concentrate === 'inside' ? cloud.length : 1 - cloud.length,
				)) * volume;
		}
	}, [concentrate, bounds, fade, color, opacity, growth, volume, seed, segments, speed]);
	useLayoutEffect(() => {
		parent.current.push(...clouds);
		return () => {
			parent.current = parent.current.filter((item) => item.uuid !== uuid);
		};
	}, [clouds, parent, uuid]);
	<group ref={mergedRef} {...props} />
}

export function Cloud(props: CloudProps & { ref?: ThreeRef<Group> }) @{
	const parent = useContext(CloudsContext);
	@if (parent) {
		<CloudInstance {...props} />
	} @else {
		<Clouds><CloudInstance {...props} /></Clouds>
	}
}
