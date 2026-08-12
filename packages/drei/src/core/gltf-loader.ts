import { DRACOLoader, GLTFLoader, MeshoptDecoder } from 'three-stdlib';

export type Path = string | string[];
export type UseDraco = boolean | string;
export type UseMeshopt = boolean;
export type ExtendLoader = (loader: GLTFLoader) => void;

let dracoLoader: DRACOLoader | null = null;
let decoderPath = 'https://www.gstatic.com/draco/versioned/decoders/1.5.5/';

export function gltfExtensions(
	useDraco: UseDraco = true,
	useMeshopt: UseMeshopt = true,
	extendLoader?: ExtendLoader,
) {
	return (loader: GLTFLoader) => {
		extendLoader?.(loader);
		if (useDraco) {
			dracoLoader ??= new DRACOLoader();
			dracoLoader.setDecoderPath(typeof useDraco === 'string' ? useDraco : decoderPath);
			loader.setDRACOLoader(dracoLoader);
		}
		if (useMeshopt) {
			loader.setMeshoptDecoder(
				typeof MeshoptDecoder === 'function' ? MeshoptDecoder() : MeshoptDecoder,
			);
		}
	};
}

export function setGltfDecoderPath(path: string): void {
	decoderPath = path;
}
