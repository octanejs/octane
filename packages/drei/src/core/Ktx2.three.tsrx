/** @jsxImportSource @octanejs/three/intrinsics */
import { useLoader, useThree } from '@octanejs/three';
import { useEffect } from '@octanejs/three/renderer';
import type { Texture } from 'three';
import { KTX2Loader } from 'three-stdlib';
import { slotDefault } from './compiler-slot.js';
import { IsObject } from './Texture.three.tsrx';
import { resolveRenderChildren, type RenderChildren } from './octane-children.js';

const cdn = 'https://cdn.jsdelivr.net/gh/pmndrs/drei-assets@master';

export function useKTX2<Url extends string[] | string | Record<string, string>>(
	input: Url,
	basisPath = `${cdn}/basis/`,
): Url extends any[] ? Texture[] : Url extends object ? { [key in keyof Url]: Texture } : Texture {
	basisPath = slotDefault(basisPath, `${cdn}/basis/`);
	const gl = useThree((state) => state.gl);
	const textures = useLoader(KTX2Loader, IsObject(input) ? Object.values(input) : input, (
		loader,
	) => {
		loader.detectSupport(gl as unknown as Parameters<KTX2Loader['detectSupport']>[0]);
		loader.setTranscoderPath(basisPath);
	});

	useEffect(() => {
		const array = Array.isArray(textures) ? textures : [textures];
		for (const texture of array) gl.initTexture(texture);
	}, [gl, textures]);

	if (!IsObject(input)) return textures as any;
	const keys = Object.keys(input);
	const keyed: Record<string, Texture> = {};
	for (const [index, key] of keys.entries()) {
		keyed[key] = (textures as unknown as Texture[])[index];
	}
	return keyed as any;
}

useKTX2.preload = (url: string[] | string, basisPath = `${cdn}/basis/`) => useLoader.preload(
	KTX2Loader,
	url,
	(loader) => loader.setTranscoderPath(basisPath),
);
useKTX2.clear = (input: string | string[]) => useLoader.clear(KTX2Loader, input);

export function Ktx2({
	children,
	input,
	basisPath,
}: {
	children?: RenderChildren<ReturnType<typeof useKTX2>>;
	input: Parameters<typeof useKTX2>[0];
	basisPath?: Parameters<typeof useKTX2>[1];
}) @{
	const texture = useKTX2(input, basisPath);
	<>
		{resolveRenderChildren(children, texture)}
	</>
}
