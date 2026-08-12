/** @jsxImportSource @octanejs/three/intrinsics */
import { extend, type ThreeElements, useFrame, useInstanceHandle, useThree } from '@octanejs/three';
import { useLayoutEffect, useMemo, useRef } from '@octanejs/three/renderer';
import * as THREE from 'three';
import { MeshBVH, MeshBVHUniformStruct, SAH } from 'three-mesh-bvh';
import { MeshRefractionMaterialImpl } from '../materials/MeshRefractionMaterial.js';

const MeshRefractionMaterialNode = extend(MeshRefractionMaterialImpl);

export type MeshRefractionMaterialProps = ThreeElements['shaderMaterial'] & {
	envMap: THREE.CubeTexture | THREE.Texture;
	bounces?: number;
	ior?: number;
	fresnel?: number;
	aberrationStrength?: number;
	color?: THREE.ColorRepresentation;
	fastChroma?: boolean;
};

const isCubeTexture = (texture: THREE.CubeTexture | THREE.Texture): texture is THREE.CubeTexture =>
	Boolean((texture as THREE.CubeTexture).isCubeTexture);

export function MeshRefractionMaterial({
	aberrationStrength = 0,
	fastChroma = true,
	envMap,
	...props
}: MeshRefractionMaterialProps) @{
	const material = useRef<InstanceType<typeof MeshRefractionMaterialImpl> | null>(null);
	const instance = useInstanceHandle(material);
	const size = useThree((state) => state.size);
	const defines = useMemo(() => {
		const result: Record<string, string> = {};
		const cubeMap = isCubeTexture(envMap);
		const image = cubeMap ? envMap.image[0] : envMap.image;
		const width = image?.width ?? 1024;
		const cubeSize = width / 4;
		const lodMax = Math.floor(Math.log2(cubeSize));
		const normalizedCubeSize = Math.pow(2, lodMax);
		const packedWidth = 3 * Math.max(normalizedCubeSize, 16 * 7);
		const packedHeight = 4 * normalizedCubeSize;
		if (cubeMap) result.ENVMAP_TYPE_CUBEM = '';
		result.CUBEUV_TEXEL_WIDTH = `${1 / packedWidth}`;
		result.CUBEUV_TEXEL_HEIGHT = `${1 / packedHeight}`;
		result.CUBEUV_MAX_MIP = `${lodMax}.0`;
		if (aberrationStrength > 0) result.CHROMATIC_ABERRATIONS = '';
		if (fastChroma) result.FAST_CHROMA = '';
		return result;
	}, [aberrationStrength, fastChroma]);
	useLayoutEffect(() => {
		const geometry = (instance.current?.parent?.object as THREE.Mesh | undefined)?.geometry;
		if (!geometry || !material.current) return;
		material.current.bvh = new MeshBVHUniformStruct();
		material.current.bvh.updateFrom(new MeshBVH(geometry.clone().toNonIndexed() as any, { strategy: SAH }));
	}, []);
	useFrame(({ camera }) => {
		if (!material.current) return;
		material.current.viewMatrixInverse = camera.matrixWorld;
		material.current.projectionMatrixInverse = camera.projectionMatrixInverse;
	});
	<MeshRefractionMaterialNode
		key={JSON.stringify(defines)}
		defines={defines}
		ref={material}
		resolution={[size.width, size.height]}
		aberrationStrength={aberrationStrength}
		envMap={envMap}
		{...(props as any)}
	/>
}
