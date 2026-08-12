import type Hls from 'hls.js';

export const IS_BROWSER =
	typeof window !== 'undefined' &&
	typeof window.document?.createElement === 'function' &&
	typeof window.navigator?.userAgent === 'string';

let hlsModule: typeof import('hls.js') | null = null;

export async function getHls(...args: ConstructorParameters<typeof Hls>): Promise<Hls | null> {
	hlsModule ??= await import('hls.js');
	const Ctor = hlsModule.default;
	return Ctor.isSupported() ? new Ctor(...args) : null;
}
