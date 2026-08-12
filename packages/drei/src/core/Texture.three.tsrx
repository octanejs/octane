/** @jsxImportSource @octanejs/three/intrinsics */
import { useLoader, useThree } from '@octanejs/three';
import { useEffect, useLayoutEffect, useMemo } from '@octanejs/three/renderer';
import { Texture as ThreeTexture, TextureLoader } from 'three';
import { slotDefault } from './compiler-slot.js';
import { resolveRenderChildren, type RenderChildren } from './octane-children.js';

export const IsObject = (url: unknown): url is Record<string, string> =>
	url === Object(url) && !Array.isArray(url) && typeof url !== 'function';

type TextureArray<T> = T extends string[] ? ThreeTexture[] : never;
type TextureRecord<T> =
	T extends Record<string, string> ? { [key in keyof T]: ThreeTexture } : never;
type SingleTexture<T> = T extends string ? ThreeTexture : never;

export type MappedTextureType<T extends string[] | string | Record<string, string>> =
	TextureArray<T> | TextureRecord<T> | SingleTexture<T>;

export function useTexture<Url extends string[] | string | Record<string, string>>(
	input: Url,
	onLoad?: (texture: MappedTextureType<Url>) => void,
): MappedTextureType<Url> {
	onLoad = slotDefault(onLoad, undefined);
	const gl = useThree((state) => state.gl);
	const textures = useLoader(
		TextureLoader,
		IsObject(input) ? Object.values(input) : input,
	) as MappedTextureType<Url>;

	useLayoutEffect(() => {
		onLoad?.(textures);
	}, [onLoad]);

	useEffect(() => {
		if (!('initTexture' in gl)) return;
		let textureArray: ThreeTexture[] = [];
		if (Array.isArray(textures)) textureArray = textures;
		else if (textures instanceof ThreeTexture) textureArray = [textures];
		else if (IsObject(textures)) textureArray = Object.values(textures);
		for (const texture of textureArray) {
			if (texture instanceof ThreeTexture) gl.initTexture(texture);
		}
	}, [gl, textures]);

	return useMemo(() => {
		if (!IsObject(input)) return textures;
		const keyed = {} as MappedTextureType<Url>;
		let index = 0;
		for (const key in input) {
			(keyed as Record<string, ThreeTexture>)[key] = (textures as ThreeTexture[])[index++];
		}
		return keyed;
	}, [input, textures]);
}

useTexture.preload = (url: string | string[]) => useLoader.preload(TextureLoader, url);
useTexture.clear = (input: string | string[]) => useLoader.clear(TextureLoader, input);

export function Texture({
	children,
	input,
	onLoad,
}: {
	children?: RenderChildren<ReturnType<typeof useTexture>>;
	input: Parameters<typeof useTexture>[0];
	onLoad?: Parameters<typeof useTexture>[1];
}) @{
	const texture = useTexture(input, onLoad);
	<>
		{resolveRenderChildren(children, texture)}
	</>
}
