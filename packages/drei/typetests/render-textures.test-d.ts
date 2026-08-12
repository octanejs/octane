import {
	RenderCubeTexture,
	RenderTexture,
	type RenderCubeTextureApi,
	type RenderCubeTextureProps,
	type RenderTextureProps,
} from '@octanejs/drei';

const texture: RenderTextureProps = { children: null, width: 64, samples: 4, frames: 2 };
const cube: RenderCubeTextureProps = {
	children: null,
	resolution: 128,
	flip: true,
	near: 0.1,
	far: 100,
};
const api = {} as RenderCubeTextureApi;
void texture;
void cube;
void api;
void RenderTexture;
void RenderCubeTexture;

// @ts-expect-error children are required
const missingChildren: RenderTextureProps = {};
void missingChildren;
