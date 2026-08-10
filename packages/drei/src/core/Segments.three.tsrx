/** @jsxImportSource @octanejs/three/intrinsics */
import { type Color, type ThreeRef, type Vector3 as Vector3Prop, useFrame } from '@octanejs/three';
import { useLayoutEffect, useMemo, useRef, useState } from '@octanejs/three/renderer';
import { createContext, useContext } from 'octane';
import type { OctaneNode } from 'octane';
import * as THREE from 'three';
import { Line2, LineMaterial, type LineMaterialParameters, LineSegmentsGeometry } from 'three-stdlib';

export type SegmentsProps = LineMaterialParameters & {
	limit?: number;
	lineWidth?: number;
	children: OctaneNode;
};

export class SegmentObject {
	color = new THREE.Color('white');
	start = new THREE.Vector3();
	end = new THREE.Vector3();
}

type SegmentRef = { current: SegmentObject | null };
type SegmentsApi = { subscribe(ref: SegmentRef): () => void };
const SegmentsContext = createContext<SegmentsApi | null>(null);

function assignRef<T>(ref: ThreeRef<T> | undefined, value: T | null): void {
	if (Array.isArray(ref)) for (const item of ref) assignRef(item, value);
	else if (typeof ref === 'function') ref(value);
	else if (ref && 'current' in ref) ref.current = value;
}

export function Segments({
	limit = 1000,
	lineWidth = 1,
	children,
	ref,
	...rest
}: SegmentsProps & { ref?: ThreeRef<Line2> }) @{
	const [segments, setSegments] = useState<SegmentRef[]>([]);
	const [line] = useState(() => new Line2());
	const [material] = useState(() => new LineMaterial());
	const [geometry] = useState(() => new LineSegmentsGeometry());
	const [resolution] = useState(() => new THREE.Vector2(512, 512));
	const [positions] = useState<number[]>(() => Array(limit * 6).fill(0));
	const [colors] = useState<number[]>(() => Array(limit * 6).fill(0));
	const api = useMemo<SegmentsApi>(() => ({
		subscribe(segmentRef) {
			setSegments((current) => [...current, segmentRef]);
			return () => setSegments((current) => current.filter((item) => item.current !== segmentRef.current));
		},
	}), []);
	useFrame(() => {
		for (let index = 0; index < limit; index++) {
			const segment = segments[index]?.current;
			if (!segment) continue;
			positions[index * 6] = segment.start.x;
			positions[index * 6 + 1] = segment.start.y;
			positions[index * 6 + 2] = segment.start.z;
			positions[index * 6 + 3] = segment.end.x;
			positions[index * 6 + 4] = segment.end.y;
			positions[index * 6 + 5] = segment.end.z;
			colors[index * 6] = segment.color.r;
			colors[index * 6 + 1] = segment.color.g;
			colors[index * 6 + 2] = segment.color.b;
			colors[index * 6 + 3] = segment.color.r;
			colors[index * 6 + 4] = segment.color.g;
			colors[index * 6 + 5] = segment.color.b;
		}
		geometry.setColors(colors);
		geometry.setPositions(positions);
		line.computeLineDistances();
	});
	const mergedRef = useMemo(() => (value: Line2 | null) => assignRef(ref, value), [ref]);
	<primitive object={line} ref={mergedRef as any}>
		<primitive object={geometry} attach="geometry" />
		<primitive
			object={material}
			attach="material"
			vertexColors={true}
			resolution={resolution}
			linewidth={lineWidth}
			{...rest as any}
		/>
		<SegmentsContext.Provider value={api}>{children}</SegmentsContext.Provider>
	</primitive>
}

export type SegmentProps = {
	start: Vector3Prop;
	end: Vector3Prop;
	color?: Color;
};

function normalizePosition(position: SegmentProps['start']): THREE.Vector3 {
	if (position instanceof THREE.Vector3) return position;
	return new THREE.Vector3(...(typeof position === 'number'
		? [position, position, position] as [number, number, number]
		: position));
}

export function Segment({ color, start, end, ref }: SegmentProps & {
	ref?: ThreeRef<SegmentObject>;
}) @{
	const api = useContext(SegmentsContext);
	if (!api) throw new Error('Segment must used inside Segments component.');
	const objectRef = useRef<SegmentObject | null>(null);
	const [object] = useState(() => new SegmentObject());
	const mergedRef = useMemo(
		() => (value: SegmentObject | null) => { objectRef.current = value; assignRef(ref, value); },
		[ref],
	);
	useLayoutEffect(() => api.subscribe(objectRef), [api]);
	<primitive
		object={object}
		ref={mergedRef as any}
		color={color}
		start={normalizePosition(start)}
		end={normalizePosition(end)}
	/>
}
