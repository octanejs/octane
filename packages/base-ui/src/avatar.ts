// Ported from .base-ui/packages/react/src/avatar/ (v1.6.0): root/AvatarRoot,
// root/AvatarRootContext, root/stateAttributesMapping, image/AvatarImage,
// image/useImageLoadingStatus, fallback/AvatarFallback — plus its `index.parts` (the
// `Avatar` namespace).
//
// Displays a profile image with a graceful fallback. `Avatar.Root` (`<span>`) tracks the
// image load status via context; `Avatar.Image` (`<img>`) loads off-DOM and only mounts once
// loaded (through the transition system); `Avatar.Fallback` (`<span>`) shows until then.
// Base UI uses a PLAIN React context — ported as a plain octane createContext.
import {
	createContext,
	createElement,
	useContext,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'octane';

import { S, splitSlot, subSlot } from './internal';
import { useRenderElement, type RenderProp } from './utils/useRenderElement';
import type { StateAttributesMapping } from './utils/getStateAttributesProps';
import { useStableCallback } from './utils/useStableCallback';
import {
	useTransitionStatus,
	transitionStatusMapping,
	type TransitionStatus,
} from './utils/useTransitionStatus';
import { useOpenChangeComplete } from './utils/useOpenChangeComplete';
import { useTimeout } from './utils/useTimeout';

export type ImageLoadingStatus = 'idle' | 'loading' | 'loaded' | 'error';

// The avatar's `imageLoadingStatus` state is NOT surfaced as a data-* attribute.
const avatarStateAttributesMapping: StateAttributesMapping<{
	imageLoadingStatus: ImageLoadingStatus;
}> = {
	imageLoadingStatus: () => null,
};

const imageStateAttributesMapping = {
	...avatarStateAttributesMapping,
	...transitionStatusMapping,
};

// --- Context -----------------------------------------------------------------

export interface AvatarRootContextValue {
	imageLoadingStatus: ImageLoadingStatus;
	setImageLoadingStatus: (status: ImageLoadingStatus) => void;
}

const AvatarRootContext = createContext<AvatarRootContextValue | undefined>(undefined);

function useAvatarRootContext(): AvatarRootContextValue {
	const context = useContext(AvatarRootContext);
	if (context === undefined) {
		throw new Error(
			'Base UI: AvatarRootContext is missing. Avatar parts must be placed within <Avatar.Root>.',
		);
	}
	return context;
}

// --- Image load status hook --------------------------------------------------

function useImageLoadingStatus(...args: any[]): ImageLoadingStatus {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useImageLoadingStatus');
	const src = user[0] as string | undefined;
	const options = (user[1] as any) ?? {};
	const { referrerPolicy, crossOrigin, sizes, srcSet } = options;

	const [loadingStatus, setLoadingStatus] = useState<ImageLoadingStatus>(
		'idle',
		subSlot(slot, 'ls'),
	);

	useLayoutEffect(
		() => {
			if (!src && !srcSet) {
				setLoadingStatus('error');
				return undefined;
			}

			let isMounted = true;
			const image = new window.Image();

			const updateStatus = (status: ImageLoadingStatus) => () => {
				if (!isMounted) {
					return;
				}
				setLoadingStatus(status);
			};

			setLoadingStatus('loading');
			image.onload = updateStatus('loaded');
			image.onerror = updateStatus('error');
			if (referrerPolicy) {
				image.referrerPolicy = referrerPolicy;
			}
			image.crossOrigin = crossOrigin ?? null;
			if (sizes) {
				image.sizes = sizes;
			}
			if (srcSet) {
				image.srcset = srcSet;
			}
			if (src) {
				image.src = src;
			}

			// Fast path for cached/decoded images.
			if (image.complete) {
				setLoadingStatus(image.naturalWidth > 0 ? 'loaded' : 'error');
			}

			return () => {
				isMounted = false;
			};
		},
		[src, srcSet, sizes, crossOrigin, referrerPolicy],
		subSlot(slot, 'e:load'),
	);

	return loadingStatus;
}

// --- Root --------------------------------------------------------------------

export interface AvatarRootState {
	imageLoadingStatus: ImageLoadingStatus;
}

export interface AvatarRootProps {
	render?: RenderProp<AvatarRootState>;
	className?: string | ((state: AvatarRootState) => string | undefined);
	style?: Record<string, any> | ((state: AvatarRootState) => Record<string, any> | undefined);
	ref?: any;
	[key: string]: any;
}

function AvatarRoot(props: AvatarRootProps): any {
	const slot = S('AvatarRoot');
	const { className, render, style, ref, ...elementProps } = props;

	const [imageLoadingStatus, setImageLoadingStatus] = useState<ImageLoadingStatus>(
		'idle',
		subSlot(slot, 'ls'),
	);

	const state: AvatarRootState = { imageLoadingStatus };

	const contextValue: AvatarRootContextValue = useMemo(
		() => ({ imageLoadingStatus, setImageLoadingStatus }),
		[imageLoadingStatus, setImageLoadingStatus],
		subSlot(slot, 'ctx'),
	);

	const element = useRenderElement(
		'span',
		{ render, className, style },
		{ state, ref, props: elementProps, stateAttributesMapping: avatarStateAttributesMapping },
		subSlot(slot, 're'),
	);

	return createElement(AvatarRootContext.Provider, { value: contextValue, children: element });
}

// --- Image -------------------------------------------------------------------

export interface AvatarImageState extends AvatarRootState {
	transitionStatus: TransitionStatus;
}

function AvatarImage(props: any): any {
	const slot = S('AvatarImage');
	const {
		className,
		render,
		onLoadingStatusChange: onLoadingStatusChangeProp,
		style,
		ref,
		...elementProps
	} = props;

	const { setImageLoadingStatus } = useAvatarRootContext();
	const imageLoadingStatus = useImageLoadingStatus(
		elementProps.src,
		elementProps,
		subSlot(slot, 'ils'),
	);

	const isVisible = imageLoadingStatus === 'loaded';
	const { mounted, transitionStatus, setMounted } = useTransitionStatus(
		isVisible,
		subSlot(slot, 'ts'),
	);

	const imageRef = useRef<HTMLImageElement | null>(null, subSlot(slot, 'imgRef'));

	const handleLoadingStatusChange = useStableCallback(
		(status: ImageLoadingStatus) => {
			onLoadingStatusChangeProp?.(status);
			setImageLoadingStatus(status);
		},
		subSlot(slot, 'hlsc'),
	);

	useLayoutEffect(
		() => {
			if (imageLoadingStatus !== 'idle') {
				handleLoadingStatusChange(imageLoadingStatus);
			}
		},
		[imageLoadingStatus, handleLoadingStatusChange],
		subSlot(slot, 'e:status'),
	);

	useLayoutEffect(
		() => () => setImageLoadingStatus('idle'),
		[setImageLoadingStatus],
		subSlot(slot, 'e:reset'),
	);

	useOpenChangeComplete(
		{
			open: isVisible,
			ref: imageRef,
			onComplete() {
				if (!isVisible) {
					setMounted(false);
				}
			},
		},
		subSlot(slot, 'occ'),
	);

	const state: AvatarImageState = { imageLoadingStatus, transitionStatus };

	const element = useRenderElement(
		'img',
		{ render, className, style },
		{
			state,
			ref: [ref, imageRef],
			props: elementProps,
			stateAttributesMapping: imageStateAttributesMapping,
			enabled: mounted,
		},
		subSlot(slot, 're'),
	);

	if (!mounted) {
		return null;
	}

	return element;
}

// --- Fallback ----------------------------------------------------------------

function AvatarFallback(props: any): any {
	const slot = S('AvatarFallback');
	const { className, render, delay, style, ref, ...elementProps } = props;

	const { imageLoadingStatus } = useAvatarRootContext();
	const [delayPassed, setDelayPassed] = useState(delay === undefined, subSlot(slot, 'dp'));
	const timeout = useTimeout(subSlot(slot, 'to'));

	useEffect(
		() => {
			if (delay !== undefined) {
				timeout.start(delay, () => setDelayPassed(true));
			} else {
				// Once shown without a delay, keep it visible.
				setDelayPassed(true);
			}
			return timeout.clear;
		},
		[timeout, delay],
		subSlot(slot, 'e:delay'),
	);

	const state: AvatarRootState = { imageLoadingStatus };

	return useRenderElement(
		'span',
		{ render, className, style },
		{
			state,
			ref,
			props: elementProps,
			stateAttributesMapping: avatarStateAttributesMapping,
			enabled: imageLoadingStatus !== 'loaded' && (delay === undefined || delayPassed),
		},
		subSlot(slot, 're'),
	);
}

// --- Namespace (mirrors `export * as Avatar`) --------------------------------

export const Avatar = {
	Root: AvatarRoot,
	Image: AvatarImage,
	Fallback: AvatarFallback,
};
