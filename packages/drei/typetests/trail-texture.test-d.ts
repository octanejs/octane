import { TrailTexture, type TrailTextureProps, useTrailTexture } from '../src/index.js';

const props: TrailTextureProps = {
	size: 128,
	blend: 'screen',
	children: ([texture, onMove]) => {
		texture;
		onMove;
		return null;
	},
};
TrailTexture;
useTrailTexture;
props;

// @ts-expect-error size is numeric
const invalidSize: TrailTextureProps = { size: 'large' };
// @ts-expect-error blend is a canvas composite operation
const invalidBlend: TrailTextureProps = { blend: 'sparkle' };
