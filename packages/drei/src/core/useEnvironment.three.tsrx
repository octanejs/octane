import { useLoader, useThree } from '@octanejs/three';
import { useLayoutEffect } from '@octanejs/three/renderer';
import {
	CubeReflectionMapping,
	EquirectangularReflectionMapping,
	type CubeTexture,
	type Loader,
	type Texture,
} from 'three';
import {
	defaultEnvironmentFiles,
	environmentExtension,
	environmentLoader,
	type EnvironmentLoaderProps,
	resolveEnvironmentOptions,
} from './environment-loader.js';
import { slotDefault } from './compiler-slot.js';

export function useEnvironment(options: Partial<EnvironmentLoaderProps> = {}) {
	options = slotDefault(options, {});
	const { files, path, colorSpace, extensions } = resolveEnvironmentOptions(options);
	const { extension, isCubemap, multiple } = environmentExtension(files);
	const loader = environmentLoader(extension);
	if (!loader) throw new Error(`useEnvironment: Unrecognized file extension: ${files}`);
	const gl = useThree((state) => state.gl);

	useLayoutEffect(() => {
		if (extension !== 'webp' && extension !== 'jpg' && extension !== 'jpeg') return;
		const clearGainmapTexture = () => useLoader.clear(
			loader as any,
			(multiple ? [files] : files) as any,
		);
		const canvas = gl.domElement as EventTarget;
		canvas.addEventListener('webglcontextlost', clearGainmapTexture, { once: true });
	}, [files, gl.domElement]);

	const loaderResult = useLoader(loader as any, (multiple ? [files] : files) as any, (
		concreteLoader: any,
	) => {
		if (extension === 'webp' || extension === 'jpg' || extension === 'jpeg') {
			concreteLoader.setRenderer(gl);
		}
		concreteLoader.setPath?.(path);
		extensions?.(concreteLoader as Loader);
	}) as Texture | Texture[];
	let texture: Texture | CubeTexture = multiple
		? (loaderResult as Texture[])[0]
		: loaderResult as Texture;
	if (extension === 'jpg' || extension === 'jpeg' || extension === 'webp') {
		texture = (texture as any).renderTarget?.texture;
	}
	texture.mapping = isCubemap ? CubeReflectionMapping : EquirectangularReflectionMapping;
	texture.colorSpace = colorSpace ?? (isCubemap ? 'srgb' : 'srgb-linear');
	return texture;
}

type PreloadOptions = Omit<EnvironmentLoaderProps, 'encoding'>;
useEnvironment.preload = (preloadOptions?: PreloadOptions) => {
	const { files, path, extensions } = resolveEnvironmentOptions({
		files: defaultEnvironmentFiles,
		...preloadOptions,
	});
	const { extension, multiple } = environmentExtension(files);
	if (extension === 'webp' || extension === 'jpg' || extension === 'jpeg') {
		throw new Error('useEnvironment: Preloading gainmaps is not supported');
	}
	const loader = environmentLoader(extension);
	if (!loader) throw new Error(`useEnvironment: Unrecognized file extension: ${files}`);
	useLoader.preload(loader as any, (multiple ? [files] : files) as any, (concreteLoader: any) => {
		concreteLoader.setPath?.(path);
		extensions?.(concreteLoader as Loader);
	});
};

useEnvironment.clear = (clearOptions?: Pick<EnvironmentLoaderProps, 'files' | 'preset'>) => {
	const { files } = resolveEnvironmentOptions({ files: defaultEnvironmentFiles, ...clearOptions });
	const { extension, multiple } = environmentExtension(files);
	const loader = environmentLoader(extension);
	if (!loader) throw new Error(`useEnvironment: Unrecognized file extension: ${files}`);
	useLoader.clear(loader as any, (multiple ? [files] : files) as any);
};
