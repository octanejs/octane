import {
	ScreenVideoTexture,
	type ScreenVideoTextureProps,
	VideoTexture,
	type VideoTextureProps,
	WebcamVideoTexture,
	type WebcamVideoTextureProps,
	useVideoTexture,
} from '../src/index.js';

const video: VideoTextureProps = {
	src: '/movie.mp4',
	start: false,
	children: (texture) => texture,
};
const screen: ScreenVideoTextureProps = { options: { video: true } };
const webcam: WebcamVideoTextureProps = { constraints: { audio: false, video: true } };
VideoTexture;
ScreenVideoTexture;
WebcamVideoTexture;
useVideoTexture;
video;
screen;
webcam;

// @ts-expect-error src is required
const missingSource: VideoTextureProps = { start: true };
// @ts-expect-error start is boolean
const invalidStart: VideoTextureProps = { src: '/movie.mp4', start: 'yes' };
