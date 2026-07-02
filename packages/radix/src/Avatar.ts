// Ported from @radix-ui/react-avatar (source:
// .radix-primitives/packages/react/avatar/src/avatar.tsx). Image renders only once its
// src has LOADED (probed off-DOM via `new Image()`); Fallback renders (optionally after
// `delayMs`) whenever the image hasn't loaded. The dev-only multiple-Image warning
// machinery is not ported (repo policy: skip React's dev-warning surface).
import {
	createElement,
	useEffect,
	useEffectEvent,
	useLayoutEffect,
	useRef,
	useState,
} from 'octane';

import { createContextScope } from './context';
import { S, subSlot } from './internal';
import { Primitive } from './Primitive';

type ImageLoadingStatus = 'idle' | 'loading' | 'loaded' | 'error';

const [createAvatarContext, createAvatarScope] = createContextScope('Avatar');
export { createAvatarScope };
const [AvatarProvider, useAvatarContext] = createAvatarContext<{
	imageLoadingStatus: ImageLoadingStatus;
	setImageLoadingStatus: (s: ImageLoadingStatus) => void;
}>('Avatar');

export function Root(props: any): any {
	const slot = S('Avatar.Root');
	const { __scopeAvatar, ...avatarProps } = props ?? {};
	const [imageLoadingStatus, setImageLoadingStatus] = useState<ImageLoadingStatus>(
		'idle',
		subSlot(slot, 'status'),
	);
	return createElement(AvatarProvider, {
		scope: __scopeAvatar,
		imageLoadingStatus,
		setImageLoadingStatus,
		children: createElement(Primitive.span, avatarProps),
	});
}

export function Image(props: any): any {
	const slot = S('Avatar.Image');
	const { __scopeAvatar, src, onLoadingStatusChange, ...imageProps } = props ?? {};
	const context = useAvatarContext('AvatarImage', __scopeAvatar);
	const imageLoadingStatus = useImageLoadingStatus(
		src,
		{
			referrerPolicy: imageProps.referrerPolicy,
			crossOrigin: imageProps.crossOrigin,
			loadingStatus: context.imageLoadingStatus,
			setLoadingStatus: context.setImageLoadingStatus,
		},
		slot,
	);
	const handleLoadingStatusChange = useEffectEvent(
		(status: ImageLoadingStatus) => {
			onLoadingStatusChange?.(status);
		},
		subSlot(slot, 'cb'),
	);
	const loadingStatusRef = useRef<ImageLoadingStatus>(imageLoadingStatus, subSlot(slot, 'prev'));
	useLayoutEffect(
		() => {
			const previousLoadingStatus = loadingStatusRef.current;
			loadingStatusRef.current = imageLoadingStatus;
			if (imageLoadingStatus !== previousLoadingStatus) {
				handleLoadingStatusChange(imageLoadingStatus);
			}
		},
		[imageLoadingStatus],
		subSlot(slot, 'e:change'),
	);
	return imageLoadingStatus === 'loaded'
		? createElement(Primitive.img, { ...imageProps, src })
		: null;
}

export function Fallback(props: any): any {
	const slot = S('Avatar.Fallback');
	const { __scopeAvatar, delayMs, ...fallbackProps } = props ?? {};
	const context = useAvatarContext('AvatarFallback', __scopeAvatar);
	const [canRender, setCanRender] = useState(delayMs === undefined, subSlot(slot, 'can'));
	useEffect(
		() => {
			if (delayMs !== undefined) {
				const timerId = window.setTimeout(() => setCanRender(true), delayMs);
				return () => window.clearTimeout(timerId);
			}
		},
		[delayMs],
		subSlot(slot, 'e:delay'),
	);
	return canRender && context.imageLoadingStatus !== 'loaded'
		? createElement(Primitive.span, fallbackProps)
		: null;
}

function useImageLoadingStatus(
	src: string | undefined,
	{
		loadingStatus,
		setLoadingStatus,
		referrerPolicy,
		crossOrigin,
	}: {
		referrerPolicy?: string;
		crossOrigin?: string;
		loadingStatus: ImageLoadingStatus;
		setLoadingStatus: (s: ImageLoadingStatus) => void;
	},
	slot: symbol,
): ImageLoadingStatus {
	useLayoutEffect(
		() => {
			if (!src) {
				setLoadingStatus('error');
				return;
			}
			const image = new window.Image();
			const handleLoad = (event: Event): void => {
				const img = event.currentTarget as HTMLImageElement;
				setLoadingStatus(getImageLoadingStatus(img));
			};
			const handleError = (): void => setLoadingStatus('error');
			image.addEventListener('load', handleLoad);
			image.addEventListener('error', handleError);
			if (referrerPolicy) {
				(image as any).referrerPolicy = referrerPolicy;
			}
			image.crossOrigin = crossOrigin ?? null;
			image.src = src;

			setLoadingStatus(getImageLoadingStatus(image));
			return () => {
				image.removeEventListener('load', handleLoad);
				image.removeEventListener('error', handleError);
				setLoadingStatus('idle');
			};
		},
		[src, crossOrigin, referrerPolicy],
		subSlot(slot, 'e:load'),
	);
	return loadingStatus;
}

function getImageLoadingStatus(image: HTMLImageElement): ImageLoadingStatus {
	return image.complete ? (image.naturalWidth > 0 ? 'loaded' : 'error') : 'loading';
}

export { Root as Avatar, Image as AvatarImage, Fallback as AvatarFallback };
