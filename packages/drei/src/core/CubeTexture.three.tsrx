/** @jsxImportSource @octanejs/three/intrinsics */
import { useLoader } from '@octanejs/three';
import { CubeTexture as ThreeCubeTexture, CubeTextureLoader, type Texture } from 'three';
import { resolveRenderChildren, type RenderChildren } from './octane-children.js';

export interface CubeTextureOptions {
	path: string;
}

export function useCubeTexture(files: string[], { path }: CubeTextureOptions): ThreeCubeTexture {
	const [cubeTexture] = useLoader(CubeTextureLoader, [files], (loader) => loader.setPath(path));
	return cubeTexture;
}

useCubeTexture.preload = (files: string[], { path }: CubeTextureOptions) => useLoader.preload(
	CubeTextureLoader,
	[files],
	(loader) => loader.setPath(path),
);

export type CubeTextureProps =
	CubeTextureOptions & {
		children?: RenderChildren<Texture>;
		files: Parameters<typeof useCubeTexture>[0];
	};

export function CubeTexture({ children, files, ...options }: CubeTextureProps) @{
	const texture = useCubeTexture(files, options);
	<>
		{resolveRenderChildren(children, texture)}
	</>
}
