/** @jsxImportSource @octanejs/three/intrinsics */
import { type ThreeElements, type ThreeRef } from '@octanejs/three';
import { useCallback, useImperativeHandle, useMemo, useState } from '@octanejs/three/renderer';
import type { OctaneNode } from 'octane';
import { MeshNormalMaterial, MeshStandardMaterial, type ColorRepresentation, type Group } from 'three';
import { Center } from './Center.three.tsrx';
import { Text3D } from './Text3D.three.tsrx';

export type ExampleProps = {
	font: string;
	color?: ColorRepresentation;
	debug?: boolean;
	bevelSize?: number;
	children?: OctaneNode;
} & Omit<ThreeElements['group'], 'ref'>;

export type ExampleApi = {
	incr: (x?: number) => void;
	decr: (x?: number) => void;
};

export function Example({
	font,
	color = '#cbcbcb',
	bevelSize = 0.04,
	debug = false,
	children,
	ref,
	...props
}: ExampleProps & { ref?: ThreeRef<ExampleApi> }) @{
	const [counter, setCounter] = useState(0);
	const incr = useCallback((x = 1) => setCounter(counter + x), [counter]);
	const decr = useCallback((x = 1) => setCounter(counter - x), [counter]);
	const api = useMemo<ExampleApi>(() => ({ incr, decr }), [incr, decr]);
	useImperativeHandle((ref ?? null) as any, () => api, [api]);
	const material = useMemo(
		() => debug
			? new MeshNormalMaterial({ wireframe: true })
			: new MeshStandardMaterial({ color }),
		[debug, color],
	);
	<group {...props}>
		@try {
			<Center top cacheKey={JSON.stringify({ counter, font })}>
				<Text3D
					bevelEnabled
					bevelSize={bevelSize}
					font={font}
					material={material}
					children={counter}
				/>
			</Center>
		} @pending {}
		{children}
	</group>
}
