import { createElement, useCallback, useEffect, useRef, useState } from 'octane';
import { useIcons } from './icon-context.tsrx';
import type { ExtraProps } from './markdown.tsrx';
import { useCn } from './prefix-context.tsrx';
import { useTranslations } from './translations-context.tsrx';
import type { DetailedHTMLProps, ImgHTMLAttributes, NativeEventHandler } from './types';
import { save } from './utils';

const fileExtensionPattern = /\.[^/.]+$/;

type ImageComponentProps =
	DetailedHTMLProps<ImgHTMLAttributes<HTMLImageElement>, HTMLImageElement> & ExtraProps;

export const ImageComponent = ({
	node,
	className,
	src,
	alt,
	onLoad: onLoadProp,
	onError: onErrorProp,
	...props
}: ImageComponentProps) => {
	const { DownloadIcon } = useIcons();
	const cn = useCn();
	const imgRef = useRef<HTMLImageElement | null>(null);
	const [imageState, setImageState] = useState({
		error: false,
		loaded: false,
		source: src,
	});
	const t = useTranslations();

	const imageLoaded = imageState.source === src && imageState.loaded;
	const imageError = imageState.source === src && imageState.error;
	const hasExplicitDimensions = props.width != null || props.height != null;
	const showDownload = (imageLoaded || hasExplicitDimensions) && !imageError;
	const showFallback = imageError && !hasExplicitDimensions;

	// Handle images already complete before Octane attaches event handlers (e.g. cached or SSR hydration)
	useEffect(() => {
		setImageState(
			(state) => state.source === src ? state : { error: false, loaded: false, source: src },
		);

		const img = imgRef.current;
		if (img?.complete) {
			const loaded = img.naturalWidth > 0;
			setImageState({ error: !loaded, loaded, source: src });
		}
	}, [src]);

	const handleLoad = useCallback<NativeEventHandler<HTMLImageElement>>((event) => {
		setImageState({ error: false, loaded: true, source: src });
		onLoadProp?.(event);
	}, [onLoadProp, src]);

	const handleError = useCallback<NativeEventHandler<HTMLImageElement>>((event) => {
		setImageState({ error: true, loaded: false, source: src });
		onErrorProp?.(event);
	}, [onErrorProp, src]);

	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: "Complex image download logic with multiple edge cases"
	const downloadImage = async () => {
		/* v8 ignore next */
		if (!src) {
			return;
		}

		try {
			const response = await fetch(src);
			const blob = await response.blob();

			// Extract filename from URL or use alt text with proper extension
			const urlPath = new URL(src, window.location.origin).pathname;
			const originalFilename = urlPath.split('/').pop() || '';
			const extension = originalFilename.split('.').pop();
			const hasExtension =
				originalFilename.includes('.') && extension !== undefined && extension.length <= 4;

			let filename = '';

			if (hasExtension) {
				filename = originalFilename;
			} else {
				// Determine extension from blob type
				const mimeType = blob.type;
				let fileExtension = 'png'; // default

				if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
					fileExtension = 'jpg';
				} else if (mimeType.includes('png')) {
					fileExtension = 'png';
				} else if (mimeType.includes('svg')) {
					fileExtension = 'svg';
				} else if (mimeType.includes('gif')) {
					fileExtension = 'gif';
				} else if (mimeType.includes('webp')) {
					fileExtension = 'webp';
				}

				const baseName = alt || originalFilename || 'image';
				filename = `${baseName.replace(fileExtensionPattern, '')}.${fileExtension}`;
			}

			save(filename, blob, blob.type);
		} catch {
			// CORS fallback: open image in new tab for manual save
			window.open(src, '_blank');
		}
	};

	if (!src) {
		return null;
	}

	const image = createElement('img', {
		...props,
		alt,
		className: cn('max-w-full rounded-lg', showFallback && 'hidden', className),
		'data-streamdown': 'image',
		onError: handleError,
		onLoad: handleLoad,
		ref: imgRef,
		src,
	});

	return <div className={cn('group relative my-4 inline-block')} data-streamdown="image-wrapper">
		{image}
		{showFallback &&
			<span
				className={cn('text-muted-foreground text-xs italic')}
				data-streamdown="image-fallback"
			>{t.imageNotAvailable}</span>}
		<div
			className={cn(
				'pointer-events-none absolute inset-0 hidden rounded-lg bg-black/10 group-hover:block',
			)}
		/>
		{showDownload &&
			<button
				className={cn(
					'absolute right-2 bottom-2 flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border bg-background/90 shadow-sm backdrop-blur-sm transition-all duration-200 hover:bg-background',
					'opacity-0 group-hover:opacity-100',
				)}
				onClick={downloadImage}
				title={t.downloadImage}
				type="button"
			>
				<DownloadIcon size={14} />
			</button>}
	</div>;
};
