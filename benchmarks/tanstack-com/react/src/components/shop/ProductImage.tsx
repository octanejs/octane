import { twMerge } from 'tailwind-merge';
import { shopifyImageUrl } from '~/utils/shopify-format';

type ShopifyImageFields = {
	url: string;
	altText?: string | null;
	width?: number | null;
	height?: number | null;
};

type ProductImageProps = {
	image: ShopifyImageFields | null | undefined;
	alt: string;
	/** Intrinsic width rendered for layout. The srcset still covers multiple DPRs. */
	width: number;
	/**
	 * Viewport widths this image occupies, for correct `sizes` hinting.
	 * Default assumes 1–4 column grid. Override for hero/PDP placements.
	 */
	sizes?: string;
	loading?: 'eager' | 'lazy';
	className?: string;
};

/**
 * Responsive Shopify CDN image. Emits a srcset with DPR-aware widths so
 * retina gets sharper pixels and mobile doesn't download desktop-sized
 * assets. Shopify's CDN serves WebP on-the-fly via `?format=webp`.
 */
export function ProductImage({
	image,
	alt,
	width,
	sizes = '(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 100vw',
	loading = 'lazy',
	className,
}: ProductImageProps) {
	if (!image) return null;
	const aspect = image.width && image.height ? image.width / image.height : 1;
	const height = Math.round(width / aspect);

	// Provide 1x, 1.5x, 2x, 3x variants bounded by the image's intrinsic width.
	const multipliers = [1, 1.5, 2, 3];
	const srcset = multipliers
		.map((m) => Math.round(width * m))
		.filter((w, i, arr) => w <= (image.width ?? w) && arr.indexOf(w) === i)
		.map((w) => `${shopifyImageUrl(image.url, { width: w, format: 'webp' })} ${w}w`)
		.join(', ');

	return (
		<img
			src={shopifyImageUrl(image.url, { width, format: 'webp' })}
			srcSet={srcset}
			sizes={sizes}
			alt={image.altText ?? alt}
			width={width}
			height={height}
			loading={loading}
			decoding="async"
			className={twMerge('h-full w-full object-cover', className)}
		/>
	);
}
