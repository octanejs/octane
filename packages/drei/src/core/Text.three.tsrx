/** @jsxImportSource @octanejs/three/intrinsics */
/// <reference path="../troika-three-text.d.ts" />
import { type ThreeElements, type ThreeRef, useThree } from '@octanejs/three';
import { use, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from '@octanejs/three/renderer';
import type { OctaneNode } from 'octane';
import type { ColorRepresentation } from 'three';
import { Text as TextMeshImpl, preloadFont } from 'troika-three-text';
import { forEachOctaneChild } from './octane-element.js';
import { resourcePromise } from './resource.js';

export type TextProps = Omit<ThreeElements['mesh'], 'ref'> & {
	children: OctaneNode;
	characters?: string;
	color?: ColorRepresentation;
	fontSize?: number;
	fontWeight?: number | string;
	fontStyle?: 'italic' | 'normal';
	maxWidth?: number;
	lineHeight?: number;
	letterSpacing?: number;
	textAlign?: 'left' | 'right' | 'center' | 'justify';
	font?: string;
	anchorX?: number | 'left' | 'center' | 'right';
	anchorY?: number | 'top' | 'top-baseline' | 'middle' | 'bottom-baseline' | 'bottom';
	clipRect?: [number, number, number, number];
	depthOffset?: number;
	direction?: 'auto' | 'ltr' | 'rtl';
	overflowWrap?: 'normal' | 'break-word';
	whiteSpace?: 'normal' | 'overflowWrap' | 'nowrap';
	outlineWidth?: number | string;
	outlineOffsetX?: number | string;
	outlineOffsetY?: number | string;
	outlineBlur?: number | string;
	outlineColor?: ColorRepresentation;
	outlineOpacity?: number;
	strokeWidth?: number | string;
	strokeColor?: ColorRepresentation;
	strokeOpacity?: number;
	fillOpacity?: number;
	sdfGlyphSize?: number;
	debugSDF?: boolean;
	glyphGeometryDetail?: number;
	onSync?: (troika: any) => void;
};

function loadTroikaFont(font?: string, characters?: string): Promise<void> {
	return new Promise((resolve) => preloadFont({ font, characters }, resolve));
}

function splitTextChildren(children: OctaneNode): [OctaneNode[], string] {
	const nodes: OctaneNode[] = [];
	let text = '';
	forEachOctaneChild(children, (child) => {
		if (typeof child === 'string' || typeof child === 'number') text += child;
		else nodes.push(child);
	});
	return [nodes, text];
}

export function Text({
	sdfGlyphSize = 64,
	anchorX = 'center',
	anchorY = 'middle',
	font,
	fontSize = 1,
	children,
	characters,
	onSync,
	ref,
	...props
}: TextProps & { ref?: ThreeRef<any> }) @{
	const invalidate = useThree((state) => state.invalidate);
	const [troikaMesh] = useState(() => new TextMeshImpl());
	const [nodes, text] = useMemo(() => splitTextChildren(children), [children]);
	use(resourcePromise(loadTroikaFont, ['troika-text', font, characters]));
	useLayoutEffect(() => void troikaMesh.sync(() => {
		invalidate();
		onSync?.(troikaMesh);
	}));
	useEffect(() => () => troikaMesh.dispose(), [troikaMesh]);
	const localRef = useRef<any>(null);
	useImperativeHandle((ref ?? null) as any, () => localRef.current, []);
	<primitive
		object={troikaMesh}
		ref={localRef}
		font={font}
		text={text}
		anchorX={anchorX}
		anchorY={anchorY}
		fontSize={fontSize}
		sdfGlyphSize={sdfGlyphSize}
		{...(props as any)}
	>
		{nodes}
	</primitive>
}
