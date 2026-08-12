/** @jsxImportSource @octanejs/three/intrinsics */
import {
	createPortal,
	extend,
	type ThreeElement,
	type ThreeRef,
	useFrame,
	useInstanceHandle,
	useThree,
} from '@octanejs/three';
import {
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type RefObject,
} from '@octanejs/three/renderer';
import type { OctaneNode } from 'octane';
import { MeshLineGeometry as MeshLineGeometryImpl, MeshLineMaterial } from 'meshline';
import {
	type ColorRepresentation,
	Group,
	Mesh,
	Object3D,
	Vector2,
	Vector3,
} from 'three';

declare module '@octanejs/three' {
	interface ThreeElements {
		meshLineMaterial: ThreeElement<typeof MeshLineMaterial>;
	}
}

extend({ MeshLineMaterial });

type Settings = {
	width: number;
	length: number;
	decay: number;
	local: boolean;
	stride: number;
	interval: number;
};

export type TrailProps = {
	color?: ColorRepresentation;
	attenuation?: (width: number) => number;
	target?: RefObject<Object3D>;
	children?: OctaneNode;
} & Partial<Settings>;

const defaults: Partial<Settings> = {
	width: 0.2,
	length: 1,
	decay: 1,
	local: false,
	stride: 0,
	interval: 1,
};

const shiftLeft = (collection: Float32Array, steps = 1): Float32Array => {
	collection.set(collection.subarray(steps));
	collection.fill(-Infinity, -steps);
	return collection;
};

export function useTrail(
	target: Object3D | null,
	settings: Partial<Settings>,
): RefObject<Float32Array | null> {
	const { length, local, decay, interval, stride } = { ...defaults, ...settings } as Settings;
	const points = useRef<Float32Array | null>(null);
	const [worldPosition] = useState(() => new Vector3());
	const previousPosition = useRef(new Vector3());
	const frameCount = useRef(0);

	useLayoutEffect(() => {
		if (target) {
			points.current = Float32Array.from(
				{ length: length * 10 * 3 },
				(_, index) => target.position.getComponent(index % 3),
			);
		}
	}, [length, target]);
	useFrame(() => {
		if (!target || !points.current) return;
		if (frameCount.current === 0) {
			const newPosition = local ? target.position : target.getWorldPosition(worldPosition);
			for (let index = 0; index < decay; index++) {
				if (newPosition.distanceTo(previousPosition.current) < stride) continue;
				shiftLeft(points.current, 3);
				points.current.set(newPosition.toArray(), points.current.length - 3);
			}
			previousPosition.current.copy(newPosition);
		}
		frameCount.current++;
		frameCount.current %= interval;
	});
	return points;
}

export type MeshLineGeometry = Mesh & MeshLineGeometryImpl;

function assignRef<T>(ref: ThreeRef<T> | undefined, value: T | null): void {
	if (Array.isArray(ref)) for (const item of ref) assignRef(item, value);
	else if (typeof ref === 'function') ref(value);
	else if (ref && 'current' in ref) ref.current = value;
}

export function Trail({
	children,
	width = 0.2,
	length = 1,
	decay = 1,
	local = false,
	stride = 0,
	interval = 1,
	color = 'hotpink',
	attenuation,
	target,
	ref,
}: TrailProps & { ref?: ThreeRef<MeshLineGeometry> }) @{
	const size = useThree((state) => state.size);
	const scene = useThree((state) => state.scene);
	const anchorGroup = useRef<Group | null>(null);
	const anchorHandle = useInstanceHandle(anchorGroup);
	const [anchor, setAnchor] = useState<Object3D | null>(null);
	const points = useTrail(anchor, { length, decay, local, stride, interval });
	const [geometry] = useState(() => new MeshLineGeometryImpl());
	const material = useMemo(() => new MeshLineMaterial({
		lineWidth: 0.1 * width,
		color,
		sizeAttenuation: 1,
		resolution: new Vector2(size.width, size.height),
	} as any), [width, color, size]);
	const mergedRef = useMemo(
		() => (value: Mesh | null) => assignRef(ref, value as MeshLineGeometry | null),
		[ref],
	);

	useEffect(() => {
		const next = target?.current ?? anchorGroup.current?.children.find((object) => object instanceof Object3D);
		if (next) setAnchor(next);
	}, [points, target]);
	useLayoutEffect(() => {
		const override = anchorHandle.current?.children.find(
			(child) => (child.object as any)?.isMeshLineMaterial === true || child.object instanceof MeshLineMaterial,
		);
		if (override) material.setValues(override.props as any);
	}, [anchorHandle, material, children]);
	useEffect(() => {
		material.uniforms.resolution.value.set(size.width, size.height);
	}, [material, size]);
	useFrame(() => {
		if (points.current) geometry.setPoints(points.current as any, attenuation);
	});

	<group>
		{createPortal(
			<mesh ref={mergedRef} geometry={geometry as any} material={material as any} />,
			scene,
		)}
		<group ref={anchorGroup}>{children}</group>
	</group>
}
