import {
	GradientTexture,
	GradientType,
	MatcapTexture,
	NormalTexture,
	useMatcapTexture,
	useNormalTexture,
	type GradientTextureProps,
} from '../src/index.js';
import type { Texture } from 'three';

const gradient: GradientTextureProps = {
	stops: [0, 1],
	colors: ['red', '#00ff00'],
	type: GradientType.Radial,
	outerCircleRadius: 'auto',
};
const matcap: [Texture, string, number] = useMatcapTexture('ABC123', 256);
const normal: [Texture, string, number] = useNormalTexture(2, {
	repeat: [2, 3],
	offset: [0.5, 0.25],
	anisotropy: 4,
});
GradientTexture;
MatcapTexture;
NormalTexture;
gradient;
matcap;
normal;

// @ts-expect-error gradient stops are numeric
const invalidGradient: GradientTextureProps = { stops: ['start'], colors: ['red'] };
// @ts-expect-error matcap format is numeric
useMatcapTexture(1, 'small');
// @ts-expect-error normal anisotropy is numeric
useNormalTexture(1, { anisotropy: 'maximum' });
