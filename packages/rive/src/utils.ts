import type { UseRiveOptions } from './types.ts';

const defaultOptions = {
	useDevicePixelRatio: true,
	fitCanvasToArtboardHeight: false,
	useOffscreenRenderer: true,
	shouldResizeCanvasToContainer: true,
};

export function getOptions(opts: Partial<UseRiveOptions>) {
	return Object.assign({}, defaultOptions, opts);
}
