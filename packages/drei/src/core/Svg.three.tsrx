/** @jsxImportSource @octanejs/three/intrinsics */
import { type ThreeElements, type ThreeRef, useLoader } from '@octanejs/three';
import { useEffect, useMemo } from '@octanejs/three/renderer';
import { DoubleSide, type Object3D } from 'three';
import { SVGLoader } from 'three-stdlib';

export interface SvgProps extends Omit<ThreeElements['object3D'], 'ref'> {
	src: string;
	skipFill?: boolean;
	skipStrokes?: boolean;
	fillMaterial?: ThreeElements['meshBasicMaterial'];
	strokeMaterial?: ThreeElements['meshBasicMaterial'];
	fillMeshProps?: ThreeElements['mesh'];
	strokeMeshProps?: ThreeElements['mesh'];
}

export function Svg({
	src,
	skipFill,
	skipStrokes,
	fillMaterial,
	strokeMaterial,
	fillMeshProps,
	strokeMeshProps,
	ref,
	...props
}: SvgProps & { ref?: ThreeRef<Object3D> }) @{
	const url = !src.startsWith('<svg') ? src : `data:image/svg+xml;utf8,${src}`;
	const svg = useLoader(SVGLoader, url);
	const fillShapes = useMemo(() => svg.paths.map((path) => SVGLoader.createShapes(path)), [svg]);
	const strokeGeometries = useMemo(
		() => skipStrokes
			? []
			: svg.paths.map((path) =>
				path.userData?.style.stroke === undefined || path.userData.style.stroke === 'none'
					? null
					: path.subPaths.map((subPath) => SVGLoader.pointsToStroke(subPath.getPoints(), path.userData!.style)),
			),
		[svg, skipStrokes],
	);
	useEffect(() => () => {
		strokeGeometries.forEach((group) => group?.forEach((geometry) => geometry.dispose()));
	}, [strokeGeometries]);
	let renderOrder = 0;
	<object3D ref={ref as any} {...props}>
		<object3D scale={[1, -1, 1]}>
			@for (const path of svg.paths; key svg.paths.indexOf(path)) {
				<>
				@if (!skipFill && path.userData?.style.fill !== undefined && path.userData.style.fill !== 'none') {
					@for (const shape of fillShapes[svg.paths.indexOf(path)]!; key fillShapes[svg.paths.indexOf(path)]!.indexOf(shape)) {
						<mesh {...fillMeshProps} renderOrder={renderOrder++}>
							<shapeGeometry args={[shape as any]} />
							<meshBasicMaterial
								color={path.userData!.style.fill}
								opacity={path.userData!.style.fillOpacity}
								transparent
								side={DoubleSide}
								depthWrite={false}
								{...fillMaterial}
							/>
						</mesh>
					}
				}
				@if (!skipStrokes && path.userData?.style.stroke !== undefined && path.userData.style.stroke !== 'none') {
					@for (const subPath of path.subPaths; key path.subPaths.indexOf(subPath)) {
						<mesh geometry={strokeGeometries[svg.paths.indexOf(path)]?.[path.subPaths.indexOf(subPath)] as any} {...strokeMeshProps} renderOrder={renderOrder++}>
							<meshBasicMaterial
								color={path.userData!.style.stroke}
								opacity={path.userData!.style.strokeOpacity}
								transparent
								side={DoubleSide}
								depthWrite={false}
								{...strokeMaterial}
							/>
						</mesh>
					}
				}
				</>
			}
		</object3D>
	</object3D>
}
