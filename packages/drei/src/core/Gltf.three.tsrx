/** @jsxImportSource @octanejs/three/intrinsics */
import { type ObjectMap, useLoader, type ThreeRef } from '@octanejs/three';
import type { Group } from 'three';
import { GLTFLoader, type GLTF } from 'three-stdlib';
import { Clone, type CloneProps } from './Clone.three.tsrx';
import { slotDefault } from './compiler-slot.js';
import {
	type ExtendLoader,
	gltfExtensions,
	type Path,
	setGltfDecoderPath,
	type UseDraco,
	type UseMeshopt,
} from './gltf-loader.js';

type GltfResult = GLTF & ObjectMap;

export const useGLTF = Object.assign(
	<T extends Path,>(
		path: T,
		useDraco?: UseDraco,
		useMeshopt?: UseMeshopt,
		extendLoader?: ExtendLoader,
	): T extends any[] ? GltfResult[] : GltfResult => {
		useDraco = slotDefault(useDraco, undefined);
		useMeshopt = slotDefault(useMeshopt, undefined);
		extendLoader = slotDefault(extendLoader, undefined);
		return useLoader(
			GLTFLoader,
			path,
			gltfExtensions(useDraco, useMeshopt, extendLoader) as any,
		) as unknown as T extends any[] ? GltfResult[] : GltfResult;
	},
	{
		preload(path: Path, useDraco?: UseDraco, useMeshopt?: UseMeshopt, extendLoader?: ExtendLoader) {
			useLoader.preload(
				GLTFLoader,
				path,
				gltfExtensions(useDraco, useMeshopt, extendLoader) as any,
			);
		},
		clear(path: Path) {
			useLoader.clear(GLTFLoader, path);
		},
		setDecoderPath: setGltfDecoderPath,
	},
);

export type GltfProps =
	Omit<CloneProps, 'object'> & {
		src: string;
		useDraco?: UseDraco;
		useMeshOpt?: UseMeshopt;
		extendLoader?: ExtendLoader;
	};

export function Gltf({ src, useDraco, useMeshOpt, extendLoader, ref, ...props }: GltfProps & {
	ref?: ThreeRef<Group>;
}) @{
	const { scene } = useGLTF(src, useDraco, useMeshOpt, extendLoader);
	<Clone ref={ref} {...props} object={scene as unknown as Group} />
}
