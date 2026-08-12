/** @jsxImportSource @octanejs/three/intrinsics */
import { type ThreeRef, useThree } from '@octanejs/three';
import { use, useEffect, useLayoutEffect, useRef } from '@octanejs/three/renderer';
import type Hls from 'hls.js';
import { Events } from 'hls.js';
import * as THREE from 'three';
import { slotDefault } from './compiler-slot.js';
import { resolveRenderChildren, type RenderChildren } from './octane-children.js';
import { resourcePromise } from './resource.js';
import { getHls, IS_BROWSER } from './video-texture-resource.js';

export type UseVideoTextureOptions = {
	unsuspend?: keyof HTMLVideoElementEventMap;
	start?: boolean;
	hls?: Parameters<typeof getHls>[0];
	onVideoFrame?: VideoFrameRequestCallback;
} & Partial<Omit<HTMLVideoElement, 'children' | 'src' | 'srcObject'>>;

function useVideoFrame(video: HTMLVideoElement, callbackValue?: VideoFrameRequestCallback): void {
	useEffect(() => {
		if (!callbackValue || !video.requestVideoFrameCallback) return;
		let handle: ReturnType<HTMLVideoElement['requestVideoFrameCallback']>;
		const callback: VideoFrameRequestCallback = (...args) => {
			callbackValue(...args);
			handle = video.requestVideoFrameCallback(callback);
		};
		video.requestVideoFrameCallback(callback);
		return () => video.cancelVideoFrameCallback(handle);
	}, [video, callbackValue]);
}

export function useVideoTexture(
	srcOrSrcObject: HTMLVideoElement['src' | 'srcObject'],
	options: UseVideoTextureOptions = {},
): THREE.VideoTexture {
	const {
		unsuspend = 'loadedmetadata',
		start = true,
		hls: hlsConfig = {},
		crossOrigin = 'anonymous',
		muted = true,
		loop = true,
		playsInline = true,
		onVideoFrame,
		...videoProps
	} = slotDefault(options, {});
	const gl = useThree((state) => state.gl);
	const hlsRef = useRef<Hls | null>(null);
	const texture = use(
		resourcePromise(
			() =>
				new Promise<THREE.VideoTexture>(async (resolve) => {
					let src: string | undefined;
					let srcObject: MediaProvider | null | undefined;
					if (typeof srcOrSrcObject === 'string') src = srcOrSrcObject;
					else srcObject = srcOrSrcObject;
					const video = Object.assign(document.createElement('video'), {
						src,
						srcObject,
						crossOrigin,
						loop,
						muted,
						playsInline,
						...videoProps,
					});
					if (src && IS_BROWSER && src.endsWith('.m3u8')) {
						const hls = (hlsRef.current = await getHls(hlsConfig));
						if (hls) {
							hls.on(Events.MEDIA_ATTACHED, () => void hls.loadSource(src));
							hls.attachMedia(video);
						}
					}
					const value = new THREE.VideoTexture(video);
					value.colorSpace = gl.outputColorSpace as THREE.ColorSpace;
					video.addEventListener(unsuspend, () => resolve(value));
				}),
			[srcOrSrcObject],
		),
	);
	const video = texture.source.data as HTMLVideoElement;
	useVideoFrame(video, onVideoFrame);
	useEffect(() => {
		if (start) void texture.image.play();
		return () => {
			if (hlsRef.current) {
				hlsRef.current.destroy();
				hlsRef.current = null;
			}
		};
	}, [texture, start]);
	return texture;
}

export type VideoTextureProps = {
	children?: RenderChildren<THREE.VideoTexture>;
	src: Parameters<typeof useVideoTexture>[0];
	ref?: ThreeRef<THREE.VideoTexture>;
} & Parameters<typeof useVideoTexture>[1];

function assignRef<T>(ref: ThreeRef<T> | undefined, value: T | null): void {
	if (Array.isArray(ref)) for (const item of ref) assignRef(item, value);
	else if (typeof ref === 'function') ref(value);
	else if (ref && 'current' in ref) ref.current = value;
}

export function VideoTexture({ children, src, ref, ...config }: VideoTextureProps) @{
	const texture = useVideoTexture(src, config);
	useEffect(() => () => void texture.dispose(), [texture]);
	useLayoutEffect(() => {
		assignRef(ref, texture);
		return () => assignRef(ref, null);
	}, [ref, texture]);
	<>
		{resolveRenderChildren(children, texture)}
	</>
}
