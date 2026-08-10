/** @jsxImportSource @octanejs/three/intrinsics */
import type { ThreeRef } from '@octanejs/three';
import { use, useEffect } from '@octanejs/three/renderer';
import * as THREE from 'three';
import { VideoTexture, type VideoTextureProps } from '../core/VideoTexture.three.tsrx';
import { clearResource, resourcePromise } from '../core/resource.js';

export type ScreenVideoTextureProps = Omit<VideoTextureProps, 'src'> & {
	options?: DisplayMediaStreamOptions;
};

export function ScreenVideoTexture({
	options = { video: true },
	ref,
	children,
	...props
}: ScreenVideoTextureProps & { ref?: ThreeRef<THREE.VideoTexture> }) @{
	const mediaStream = use(
		resourcePromise(() => navigator.mediaDevices.getDisplayMedia(options), []),
	);
	useEffect(() => {
		return () => {
			mediaStream?.getTracks().forEach((track) => track.stop());
			clearResource([]);
		};
	}, [mediaStream]);
	<VideoTexture ref={ref} children={children} {...props as any} src={mediaStream} />
}

export type WebcamVideoTextureProps = Omit<VideoTextureProps, 'src'> & {
	constraints?: MediaStreamConstraints;
};

export function WebcamVideoTexture({
	constraints = { audio: false, video: { facingMode: 'user' } },
	ref,
	children,
	...props
}: WebcamVideoTextureProps & { ref?: ThreeRef<THREE.VideoTexture> }) @{
	const mediaStream = use(
		resourcePromise(() => navigator.mediaDevices.getUserMedia(constraints), []),
	);
	useEffect(() => {
		return () => {
			mediaStream?.getTracks().forEach((track) => track.stop());
			clearResource([]);
		};
	}, [mediaStream]);
	<VideoTexture ref={ref} children={children} {...props as any} src={mediaStream} />
}
