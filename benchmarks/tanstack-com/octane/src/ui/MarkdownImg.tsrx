import { memo } from 'octane';
import { getOptimizedImageUrl } from '~/utils/optimizedImage';
import { getPublicImageDimensions } from '~/utils/publicImageDimensions';

const DEFAULT_TRANSFORM_WIDTH = 1200;

export type MarkdownImgProps =
	Record<string, any> & {
		priority?: boolean;
	};

export const MarkdownImg = memo(
	function MarkdownImg({
		alt,
		src,
		className,
		width,
		height,
		style,
		priority,
		children: _,
		...props
	}: MarkdownImgProps) {
		const sourceDimensions =
			src ? getPublicImageDimensions(src) : undefined;
		const providedWidth = parseDimension(width);
		const providedHeight = parseDimension(height);
		const inferredWidth =
			sourceDimensions && width === undefined
				? Math.min(sourceDimensions.width, 800)
				: providedWidth;
		const inferredHeight =
			sourceDimensions && height === undefined && inferredWidth
				? Math.round(inferredWidth * (sourceDimensions.height / sourceDimensions.width))
				: providedHeight;
		const resolvedWidth = width ?? inferredWidth;
		const resolvedHeight = height ?? inferredHeight;
		const numericWidth =
			typeof resolvedWidth === 'number'
				? resolvedWidth
				: parseDimension(width) ?? DEFAULT_TRANSFORM_WIDTH;
		const numericHeight =
			typeof resolvedHeight === 'number' ? resolvedHeight : parseDimension(height);
		const aspectRatio =
			numericWidth && numericHeight
				? `auto ${numericWidth} / ${numericHeight}`
				: src?.toLowerCase().endsWith('.svg')
					? 'auto 3 / 1'
					: 'auto 16 / 9';

		return <img
			{...props}
			src={src
				? getOptimizedImageUrl(src, {
						format: 'auto',
						height: numericHeight,
						quality: 80,
						width: numericWidth,
					})
				: undefined}
			alt={alt ?? ''}
			width={resolvedWidth}
			height={resolvedHeight}
			style={{
				aspectRatio,
				...style,
			}}
			class={`block max-w-full h-auto rounded-lg shadow-md ${className ?? ''}`}
			loading={priority ? 'eager' : 'lazy'}
			fetchPriority={priority ? 'high' : undefined}
			decoding="async"
		/>;
	},
);

function parseDimension(value: unknown) {
	if (typeof value === 'number') {
		return value;
	}

	if (typeof value !== 'string') {
		return undefined;
	}

	const parsed = Number(value);

	return Number.isFinite(parsed) ? parsed : undefined;
}
