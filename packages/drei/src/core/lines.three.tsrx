/** @jsxImportSource @octanejs/three/intrinsics */
import {
	type ThreeElement,
	type ThreeElements,
	type ThreeRef,
	type Vector2 as FiberVector2,
	type Vector3 as FiberVector3,
	useThree,
} from '@octanejs/three';
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from '@octanejs/three/renderer';
import {
	CatmullRomCurve3,
	Color,
	type ColorRepresentation,
	CubicBezierCurve3,
	EdgesGeometry,
	type BufferAttribute,
	type BufferGeometry,
	type Mesh,
	QuadraticBezierCurve3,
	Vector2,
	Vector3,
	Vector4,
} from 'three';
import {
	Line2,
	LineGeometry,
	LineMaterial,
	type LineMaterialParameters,
	LineSegments2,
	LineSegmentsGeometry,
} from 'three-stdlib';

function assignRef<T>(ref: ThreeRef<T> | undefined, value: T | null): void {
	if (Array.isArray(ref)) for (const item of ref) assignRef(item, value);
	else if (typeof ref === 'function') ref(value);
	else if (ref && 'current' in ref) ref.current = value;
}

export type LineProps =
	Omit<
		{
			points: ReadonlyArray<FiberVector2 | FiberVector3>;
			vertexColors?: ReadonlyArray<
				Color | [number, number, number] | [number, number, number, number]
			>;
			lineWidth?: number;
			segments?: boolean;
		} & Omit<LineMaterialParameters, 'vertexColors' | 'color'> & Omit<
			ThreeElement<typeof Line2>,
			'ref' | 'args'
		> & Omit<ThreeElement<typeof LineMaterial>, 'ref' | 'color' | 'vertexColors' | 'args'> & {
			color?: ColorRepresentation;
		},
		'ref'
	>;

export function Line({
	points,
	color = 0xffffff,
	vertexColors,
	linewidth,
	lineWidth,
	segments,
	dashed,
	ref,
	...rest
}: LineProps & { ref?: ThreeRef<Line2 | LineSegments2> }) @{
	const size = useThree((state) => state.size);
	const line = useMemo(() => (segments ? new LineSegments2() : new Line2()), [segments]);
	const [material] = useState(() => new LineMaterial());
	const itemSize =
		(vertexColors?.[0] as number[] | undefined)?.length === 4 ? 4 : 3;
	const geometry = useMemo(() => {
		const value = segments ? new LineSegmentsGeometry() : new LineGeometry();
		const positions = points.map((point) => {
			const array = Array.isArray(point);
			return point instanceof Vector3 || point instanceof Vector4
				? [point.x, point.y, point.z]
				: point instanceof Vector2
					? [point.x, point.y, 0]
					: array && point.length === 3
						? [point[0], point[1], point[2]]
						: array && point.length === 2
							? [point[0], point[1], 0]
							: point;
		});
		value.setPositions(positions.flat() as number[]);
		if (vertexColors) {
			color = 0xffffff;
			const values = vertexColors.map((value) => value instanceof Color ? value.toArray() : value);
			value.setColors(values.flat(), itemSize);
		}
		return value;
	}, [points, segments, vertexColors, itemSize]);
	const mergedRef = useMemo(() => (value: Line2 | LineSegments2 | null) => assignRef(ref, value), [
		ref,
	]);
	useLayoutEffect(() => {
		line.computeLineDistances();
	}, [points, line]);
	useLayoutEffect(() => {
		if (dashed) material.defines.USE_DASH = '';
		else delete material.defines.USE_DASH;
		material.needsUpdate = true;
	}, [dashed, material]);
	useEffect(
		() => () => {
			geometry.dispose();
			material.dispose();
		},
		[geometry],
	);
	<primitive object={line} ref={mergedRef as any} {...rest as any}>
		<primitive object={geometry} attach="geometry" />
		<primitive
			object={material}
			attach="material"
			color={color}
			vertexColors={Boolean(vertexColors)}
			resolution={[size.width, size.height]}
			linewidth={linewidth ?? lineWidth ?? 1}
			dashed={dashed}
			transparent={itemSize === 4}
			{...rest as any}
		/>
	</primitive>
}

export type QuadraticBezierLineRef =
	Line2 & {
		setPoints(start: Vector3 | [number, number, number], end: | Vector3
		| [number, number, number], mid: Vector3 | [number, number, number]): void;
	};

export type QuadraticBezierLineProps =
	Omit<LineProps, 'points' | 'ref' | 'segments'> & {
		start: Vector3 | [number, number, number];
		end: Vector3 | [number, number, number];
		mid?: Vector3 | [number, number, number];
		segments?: number;
	};

const quadraticOffset = new Vector3();

export function QuadraticBezierLine({
	start = [0, 0, 0],
	end = [0, 0, 0],
	mid,
	segments = 20,
	ref,
	...rest
}: QuadraticBezierLineProps & { ref?: ThreeRef<QuadraticBezierLineRef> }) @{
	const localRef = useRef<QuadraticBezierLineRef | null>(null);
	const [curve] = useState(
		() => new QuadraticBezierCurve3(undefined as any, undefined as any, undefined as any),
	);
	const getPoints = useCallback((
		from: Vector3 | [number, number, number],
		to: Vector3 | [number, number, number],
		middle?: Vector3 | [number, number, number],
		count = 20,
	) => {
		if (from instanceof Vector3) curve.v0.copy(from);
		else curve.v0.set(...from);
		if (to instanceof Vector3) curve.v2.copy(to);
		else curve.v2.set(...to);
		if (middle instanceof Vector3) curve.v1.copy(middle);
		else if (Array.isArray(middle)) curve.v1.set(...middle);
		else {
			curve.v1.copy(
				curve.v0.clone().add(curve.v2.clone().sub(curve.v0)).add(
					quadraticOffset.set(0, curve.v0.y - curve.v2.y, 0),
				),
			);
		}
		return curve.getPoints(count);
	}, []);
	useLayoutEffect(() => {
		if (!localRef.current) return;
		localRef.current.setPoints = (from, to, middle) => {
			const values = getPoints(from, to, middle);
			localRef.current?.geometry?.setPositions(values.flatMap((point) => point.toArray()));
		};
	});
	const points = useMemo(() => getPoints(start, end, mid, segments), [start, end, mid, segments]);
	const mergedRef = useMemo(
		() => (value: QuadraticBezierLineRef | null) => {
			localRef.current = value;
			assignRef(ref, value);
		},
		[ref],
	);
	<Line ref={mergedRef as any} points={points} {...rest as any} />
}

export type CubicBezierLineProps =
	Omit<LineProps, 'points' | 'ref' | 'segments'> & {
		start: Vector3 | [number, number, number];
		end: Vector3 | [number, number, number];
		midA: Vector3 | [number, number, number];
		midB: Vector3 | [number, number, number];
		segments?: number;
	};

export function CubicBezierLine({
	start,
	end,
	midA,
	midB,
	segments = 20,
	ref,
	...rest
}: CubicBezierLineProps & { ref?: ThreeRef<Line2> }) @{
	const points = useMemo(() => {
		const startVector =
			start instanceof Vector3 ? start : new Vector3(...start);
		const endVector =
			end instanceof Vector3 ? end : new Vector3(...end);
		const midAVector =
			midA instanceof Vector3 ? midA : new Vector3(...midA);
		const midBVector =
			midB instanceof Vector3 ? midB : new Vector3(...midB);
		return new CubicBezierCurve3(startVector, midAVector, midBVector, endVector).getPoints(
			segments,
		);
	}, [start, end, midA, midB, segments]);
	<Line ref={ref as any} points={points} {...rest as any} />
}

export type CatmullRomLineProps =
	Omit<LineProps, 'ref' | 'segments'> & {
		closed?: boolean;
		curveType?: 'centripetal' | 'chordal' | 'catmullrom';
		tension?: number;
		segments?: number;
	};

export function CatmullRomLine({
	points,
	closed = false,
	curveType = 'centripetal',
	tension = 0.5,
	segments = 20,
	vertexColors,
	ref,
	...rest
}: CatmullRomLineProps & { ref?: ThreeRef<Line2> }) @{
	const curve = useMemo(() => {
		const mapped = points.map(
			(point) => point instanceof Vector3
				? point
				: new Vector3(...point as [number, number, number]),
		);
		return new CatmullRomCurve3(mapped, closed, curveType, tension);
	}, [points, closed, curveType, tension]);
	const segmentedPoints = useMemo(() => curve.getPoints(segments), [curve, segments]);
	const interpolatedVertexColors = useMemo(() => {
		if (!vertexColors || vertexColors.length < 2) return undefined;
		if (vertexColors.length === segments + 1) return vertexColors;
		const mapped = vertexColors.map(
			(color) => color instanceof Color ? color : new Color(...color as [number, number, number]),
		);
		if (closed) mapped.push(mapped[0].clone());
		const values: Color[] = [mapped[0]];
		const divisions = segments / (mapped.length - 1);
		for (let index = 1; index < segments; index++) {
			const alpha = (index % divisions) / divisions;
			const colorIndex = Math.floor(index / divisions);
			values.push(mapped[colorIndex].clone().lerp(mapped[colorIndex + 1], alpha));
		}
		values.push(mapped[mapped.length - 1]);
		return values;
	}, [vertexColors, segments]);
	<Line
		ref={ref as any}
		points={segmentedPoints}
		vertexColors={interpolatedVertexColors}
		{...rest as any}
	/>
}

export type EdgesRef = Mesh<any, any>;
export type EdgesProps =
	Partial<ThreeElements['mesh']> & {
		threshold?: number;
		lineWidth?: number;
		geometry?: BufferGeometry;
		color?: ColorRepresentation;
	} & Omit<LineMaterialParameters, 'vertexColors' | 'color'>;

export function Edges({ threshold = 15, geometry: explicitGeometry, ref, ...props }: EdgesProps & {
	ref?: ThreeRef<EdgesRef>;
}) @{
	const localRef = useRef<LineSegments2 | null>(null);
	const points = useMemo(() => [0, 0, 0, 1, 0, 0], []);
	const memoizedGeometry = useRef<BufferGeometry | null>(null);
	const memoizedThreshold = useRef<number | null>(null);
	const mergedRef = useMemo(
		() => (value: LineSegments2 | null) => {
			localRef.current = value;
			assignRef(ref as ThreeRef<LineSegments2> | undefined, value);
		},
		[ref],
	);
	useLayoutEffect(() => {
		if (!localRef.current) return;
		const parent = localRef.current.parent as Mesh | null;
		const geometry = explicitGeometry ?? parent?.geometry;
		if (!geometry) return;
		if (memoizedGeometry.current === geometry && memoizedThreshold.current === threshold) return;
		memoizedGeometry.current = geometry;
		memoizedThreshold.current = threshold;
		const edgeGeometry = new EdgesGeometry(geometry, threshold);
		const values = (edgeGeometry.attributes.position as BufferAttribute).array as Float32Array;
		localRef.current.geometry.setPositions(values);
		localRef.current.geometry.attributes.instanceStart.needsUpdate = true;
		localRef.current.geometry.attributes.instanceEnd.needsUpdate = true;
		localRef.current.computeLineDistances();
	});
	<Line segments points={points} ref={mergedRef as any} raycast={() => null} {...props as any} />
}
