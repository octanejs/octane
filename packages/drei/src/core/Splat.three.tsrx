/** @jsxImportSource @octanejs/three/intrinsics */
import { extend, useFrame, useLoader, useThree } from '@octanejs/three';
import { useLayoutEffect, useRef } from '@octanejs/three/renderer';
import * as THREE from 'three';
import {
	SplatLoader,
	SplatMaterial,
	type SharedState,
	type SplatProps,
	type TargetMesh,
} from './splat-resource.js';

export type { SharedState, SplatMaterialType, SplatProps, TargetMesh } from './splat-resource.js';

const SplatMaterialElement = extend(SplatMaterial);

export function Splat({
	src,
	toneMapped = false,
	alphaTest = 0,
	alphaHash = false,
	chunkSize = 25000,
	...props
}: SplatProps) @{
	const ref = useRef<TargetMesh | null>(null);
	const gl = useThree((state) => state.gl) as unknown as THREE.WebGLRenderer;
	const camera = useThree((state) => state.camera);
	const shared = useLoader(SplatLoader, src, (loader) => {
		loader.gl = gl;
		loader.chunkSize = chunkSize;
	}) as SharedState;
	useLayoutEffect(() => {
		if (!ref.current) return;
		return shared.connect(ref.current);
	}, [src]);
	useFrame(() => { if (ref.current) shared.update(ref.current, camera, alphaHash); });
	<mesh ref={ref} frustumCulled={false} {...props as any}>
		<SplatMaterialElement {...({
			key: `${src}/${alphaTest}/${alphaHash}${SplatMaterial.key}`,
			transparent: !alphaHash,
			depthTest: true,
			alphaTest: alphaHash ? 0 : alphaTest,
			centerAndScaleTexture: shared.centerAndScaleTexture,
			covAndColorTexture: shared.covAndColorTexture,
			depthWrite: alphaHash ? true : alphaTest > 0,
			blending: alphaHash ? THREE.NormalBlending : THREE.CustomBlending,
			blendSrcAlpha: THREE.OneFactor,
			alphaHash: Boolean(alphaHash),
			toneMapped,
		} as any)} />
	</mesh>
}
