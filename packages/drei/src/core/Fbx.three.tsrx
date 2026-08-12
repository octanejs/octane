/** @jsxImportSource @octanejs/three/intrinsics */
import { useLoader, type ThreeRef } from '@octanejs/three';
import type { Group } from 'three';
import { FBXLoader } from 'three-stdlib';
import { Clone, type CloneProps } from './Clone.three.tsrx';

export const useFBX = Object.assign(
	(path: string): Group => useLoader(FBXLoader, path) as unknown as Group,
	{
		preload(path: string) {
			useLoader.preload(FBXLoader, path);
		},
		clear(input: string | string[]) {
			useLoader.clear(FBXLoader, input);
		},
	},
);

export function Fbx({ path, ref, ...props }: { path: string; ref?: ThreeRef<Group> } & Omit<
	CloneProps,
	'object'
>) @{
	const fbx = useFBX(path);
	<Clone ref={ref} {...props} object={fbx.children[0]} />
}
