export type ImageOptimizationOptions = {
	fit?: 'contain' | 'cover' | 'crop' | 'pad' | 'scale-down';
	format?: 'auto' | 'avif' | 'webp' | 'json';
	height?: number;
	quality?: number;
	width?: number;
};

const MAX_TRANSFORM_DIMENSION = 3840;

function clampInteger(value: number | undefined, min: number, max: number) {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return undefined;
	}

	return Math.min(max, Math.max(min, Math.round(value)));
}

export function getOptimizedImageUrl(src: string, options: ImageOptimizationOptions = {}) {
	if (!src.trim() || /^(?:javascript|vbscript):/i.test(src.trim())) {
		return '';
	}

	if (!shouldTransformImage(src)) {
		return src;
	}

	const transformOptions = createCloudflareTransformOptions(options);
	if (!transformOptions) {
		return src;
	}

	const transformOrigin = getTransformOrigin();
	const source = encodeURI(src).replace(/^\//, '');

	return `${transformOrigin}/cdn-cgi/image/${transformOptions}/${source}`;
}

export function getAbsoluteOptimizedImageUrl(src: string, options: ImageOptimizationOptions = {}) {
	const optimizedSrc = getOptimizedImageUrl(src, options);
	if (!optimizedSrc) {
		return '';
	}

	if (optimizedSrc.startsWith('http')) {
		return optimizedSrc;
	}

	const origin = __TANSTACK_SITE_URL__.replace(/\/$/, '');
	const path = optimizedSrc.startsWith('/') ? optimizedSrc : `/${optimizedSrc}`;

	return `${origin}${path}`;
}

function shouldTransformImage(src: string) {
	if (!__TANSTACK_ENABLE_IMAGE_TRANSFORMATIONS__) {
		return false;
	}

	const normalized = src.toLowerCase();

	return (
		src.startsWith('/') &&
		!src.startsWith('/cdn-cgi/image/') &&
		!normalized.startsWith('data:') &&
		!normalized.endsWith('.svg')
	);
}

function getTransformOrigin() {
	return __TANSTACK_SITE_URL__.replace(/\/$/, '');
}

function createCloudflareTransformOptions(options: ImageOptimizationOptions): string | undefined {
	const params: Array<string> = [];
	const width = clampInteger(options.width, 1, MAX_TRANSFORM_DIMENSION);
	const height = clampInteger(options.height, 1, MAX_TRANSFORM_DIMENSION);
	const quality = clampInteger(options.quality ?? 80, 1, 100) ?? 80;

	if (width) {
		params.push(`width=${width}`);
	}

	if (height) {
		params.push(`height=${height}`);
	}

	if (options.fit) {
		params.push(`fit=${options.fit}`);
	}

	params.push(`quality=${quality}`);
	params.push(`format=${options.format ?? 'auto'}`);

	return params.length > 0 ? params.join(',') : undefined;
}
