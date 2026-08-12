import { GainMapLoader, HDRJPGLoader } from '@monogrid/gainmap-js';
import { CubeTextureLoader, type ColorSpace, type Loader } from 'three';
import { EXRLoader, RGBELoader } from 'three-stdlib';

export const CUBEMAP_ROOT =
	'https://raw.githack.com/pmndrs/drei-assets/456060a26bbeb8fdf79326f224b6d99b8bcce736/hdri/';
export const defaultEnvironmentFiles = [
	'/px.png',
	'/nx.png',
	'/py.png',
	'/ny.png',
	'/pz.png',
	'/nz.png',
];

export const environmentPresets = {
	apartment: 'lebombo_1k.hdr',
	city: 'potsdamer_platz_1k.hdr',
	dawn: 'kiara_1_dawn_1k.hdr',
	forest: 'forest_slope_1k.hdr',
	lobby: 'st_fagans_interior_1k.hdr',
	night: 'dikhololo_night_1k.hdr',
	park: 'rooitou_park_1k.hdr',
	studio: 'studio_small_03_1k.hdr',
	sunset: 'venice_sunset_1k.hdr',
	warehouse: 'empty_warehouse_01_1k.hdr',
};

type Preset = keyof typeof environmentPresets;

export interface EnvironmentLoaderProps {
	files?: string | string[];
	path?: string;
	preset?: Preset;
	extensions?: (loader: Loader) => void;
	colorSpace?: ColorSpace;
}

export function validateEnvironmentPreset(preset: string): asserts preset is Preset {
	if (!(preset in environmentPresets)) {
		throw new Error(`Preset must be one of: ${Object.keys(environmentPresets).join(', ')}`);
	}
}

export function resolveEnvironmentOptions(options: Partial<EnvironmentLoaderProps> = {}) {
	let files = options.files ?? defaultEnvironmentFiles;
	let path = options.path ?? '';
	if (options.preset) {
		validateEnvironmentPreset(options.preset);
		files = environmentPresets[options.preset];
		path = CUBEMAP_ROOT;
	}
	return { ...options, files, path };
}

export function environmentExtension(files: string | string[]) {
	const multiple = Array.isArray(files);
	const isCubemap = multiple && files.length === 6;
	const isGainmap = multiple && files.length === 3 && files.some((file) => file.endsWith('json'));
	const firstEntry = multiple ? files[0] : files;
	const extension: string | undefined = isCubemap
		? 'cube'
		: isGainmap
			? 'webp'
			: firstEntry.startsWith('data:application/exr')
				? 'exr'
				: firstEntry.startsWith('data:application/hdr')
					? 'hdr'
					: firstEntry.startsWith('data:image/jpeg')
						? 'jpg'
						: firstEntry.split('.').pop()?.split('?').shift()?.toLowerCase();
	return { extension, isCubemap, isGainmap, multiple };
}

export function environmentLoader(extension: string | undefined) {
	return extension === 'cube'
		? CubeTextureLoader
		: extension === 'hdr'
			? RGBELoader
			: extension === 'exr'
				? EXRLoader
				: extension === 'jpg' || extension === 'jpeg'
					? HDRJPGLoader
					: extension === 'webp'
						? GainMapLoader
						: null;
}
