/** @jsxImportSource @octanejs/three/intrinsics */
import { extend, type ThreeElements, type ThreeRef } from '@octanejs/three';
import { useImperativeHandle, useLayoutEffect, useMemo, useRef } from '@octanejs/three/renderer';
import type { OctaneNode } from 'octane';
import * as THREE from 'three';
import { mergeVertices, TextGeometry, type TextGeometryParameters } from 'three-stdlib';
import { useFont, type FontData } from './useFont.three.tsrx';
import { forEachOctaneChild } from './octane-element.js';

const RenamedTextGeometry = extend(TextGeometry);

export type Text3DProps = Omit<ThreeElements['mesh'], 'ref'> & {
	font: FontData | string;
	bevelSegments?: number;
	smooth?: number;
	letterSpacing?: number;
	lineHeight?: number;
	children?: OctaneNode;
} & Omit<TextGeometryParameters, 'font'>;

const textTypes = new Set(['string', 'number']);

function splitTextChildren(children: OctaneNode): [string, ...OctaneNode[]] {
	let label = '';
	const rest: OctaneNode[] = [];
	forEachOctaneChild(children, (child) => {
		if (textTypes.has(typeof child)) label += String(child);
		else rest.push(child);
	});
	return [label, ...rest];
}

export function Text3D({
	font: fontInput,
	letterSpacing = 0,
	lineHeight = 1,
	size = 1,
	height = 0.2,
	bevelThickness = 0.1,
	bevelSize = 0.01,
	bevelEnabled = false,
	bevelOffset = 0,
	bevelSegments = 4,
	curveSegments = 8,
	smooth,
	children,
	ref,
	...props
}: Text3DProps & { ref?: ThreeRef<THREE.Mesh> }) @{
	const mesh = useRef<THREE.Mesh | null>(null);
	const font = useFont(fontInput);
	const options = useMemo(() => ({
		font,
		size,
		height,
		bevelThickness,
		bevelSize,
		bevelEnabled,
		bevelSegments,
		bevelOffset,
		curveSegments,
		letterSpacing,
		lineHeight,
	}), [
		font,
		size,
		height,
		bevelThickness,
		bevelSize,
		bevelEnabled,
		bevelSegments,
		bevelOffset,
		curveSegments,
		letterSpacing,
		lineHeight,
	]);
	const [label, ...rest] = useMemo(() => splitTextChildren(children), [children]);
	const args = useMemo(() => [label, options] as const, [label, options]);
	useLayoutEffect(() => {
		if (smooth && mesh.current) {
			mesh.current.geometry = mergeVertices(mesh.current.geometry as any, smooth) as any;
			mesh.current.geometry.computeVertexNormals();
		}
	}, [args, smooth]);
	useImperativeHandle((ref ?? null) as any, () => mesh.current!, []);
	<mesh {...props} ref={mesh}>
		<RenamedTextGeometry args={args as any} />
		{rest}
	</mesh>
}
