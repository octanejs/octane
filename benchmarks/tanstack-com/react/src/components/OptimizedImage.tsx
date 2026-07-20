import * as React from 'react';
import { getOptimizedImageUrl, type ImageOptimizationOptions } from '~/utils/optimizedImage';

type OptimizedImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> &
	ImageOptimizationOptions & {
		src: string;
	};

export function OptimizedImage({
	fit,
	format,
	height,
	quality,
	src,
	width,
	alt = '',
	loading = 'lazy',
	decoding = 'async',
	...props
}: OptimizedImageProps) {
	const optimizedSrc = React.useMemo(
		() => getOptimizedImageUrl(src, { fit, format, height, quality, width }),
		[fit, format, height, quality, src, width],
	);

	return (
		<img
			src={optimizedSrc}
			width={width}
			height={height}
			alt={alt}
			loading={loading}
			decoding={decoding}
			{...props}
		/>
	);
}
