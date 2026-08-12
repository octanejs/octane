import type { Texture } from 'three';
import { type EnvironmentLoaderProps, useEnvironment } from '../src/index.js';

const options: EnvironmentLoaderProps = {
	files: '/studio.hdr',
	path: '/environments/',
	preset: 'sunset',
	colorSpace: 'srgb-linear',
	extensions: (loader) => void loader,
};
const texture: Texture = useEnvironment(options);
const defaultTexture: Texture = useEnvironment();
useEnvironment.preload({ files: '/studio.hdr' });
useEnvironment.clear({ preset: 'sunset' });
void [texture, defaultTexture];

// @ts-expect-error Presets are restricted to the public preset names.
const invalid: EnvironmentLoaderProps = { preset: 'ocean' };
void invalid;
