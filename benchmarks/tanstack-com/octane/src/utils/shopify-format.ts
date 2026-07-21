/**
 * Browser-safe formatting helpers for Shopify Storefront API responses.
 * Intentionally framework-free — no React, no provider context required.
 */

export function formatMoney(amount: string | number, currencyCode: string) {
	return new Intl.NumberFormat(undefined, {
		style: 'currency',
		currency: currencyCode,
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(typeof amount === 'string' ? Number(amount) : amount);
}

type ShopifyImageOptions = {
	width?: number;
	height?: number;
	format?: 'webp' | 'jpg' | 'png';
	crop?: 'center' | 'top' | 'bottom' | 'left' | 'right';
};

const MAX_SHOPIFY_IMAGE_DIMENSION = 4096;

function clampImageDimension(value: number | undefined) {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return undefined;
	}

	return Math.min(MAX_SHOPIFY_IMAGE_DIMENSION, Math.max(1, Math.round(value)));
}

/**
 * Append Shopify CDN transform parameters to a product image URL.
 * Shopify's CDN serves resized/reformatted versions automatically without
 * any sign-up; we just need to add the right query params.
 */
export function shopifyImageUrl(url: string, opts: ShopifyImageOptions = {}) {
	let u: URL;
	try {
		u = new URL(url);
	} catch {
		return '';
	}

	if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password) {
		return '';
	}

	const width = clampImageDimension(opts.width);
	const height = clampImageDimension(opts.height);

	if (width) u.searchParams.set('width', String(width));
	if (height) u.searchParams.set('height', String(height));
	if (opts.format) u.searchParams.set('format', opts.format);
	if (opts.crop) u.searchParams.set('crop', opts.crop);
	return u.toString();
}
