import * as THREE from 'three';
import { SpriteAnimator, type SpriteAnimatorProps, useSpriteAnimator } from '../src/index.js';

const props: SpriteAnimatorProps = {
	startFrame: 0,
	endFrame: 7,
	fps: 24,
	frameName: 'walk',
	textureDataURL: '/walk.json',
	textureImageURL: '/walk.png',
	loop: true,
	numberOfFrames: 8,
	autoPlay: false,
	animationNames: ['walk'],
	onStart: ({ currentFrame }) => currentFrame.toFixed(),
	onEnd: ({ currentFrameName }) => currentFrameName.toUpperCase(),
	onLoopEnd: ({ currentFrame }) => currentFrame.valueOf(),
	onFrame: ({ currentFrameName, currentFrame }) => `${currentFrameName}:${currentFrame}`,
	play: true,
	pause: true,
	flipX: true,
	alphaTest: 0.25,
	asSprite: false,
	offset: 0.5,
	playBackwards: true,
	resetOnEnd: true,
	instanceItems: [[0, 0, 0], new THREE.Vector3(1, 2, 3)],
	maxItems: 4,
	spriteDataset: null,
	canvasRenderingContext2DSettings: { willReadFrequently: true },
	roundFramePosition: true,
	meshProps: { frustumCulled: false, renderOrder: 2 },
	position: [1, 2, 3],
};
SpriteAnimator;
useSpriteAnimator()?.hasEnded.valueOf();
props;

// @ts-expect-error fps is numeric
const invalidFps: SpriteAnimatorProps = { fps: '24' };
// @ts-expect-error sprite instance positions require three axes
const invalidInstances: SpriteAnimatorProps = { instanceItems: [[1, 2]] };
// @ts-expect-error frame callbacks receive structured event data
const invalidCallback: SpriteAnimatorProps = { onFrame: (frame: number) => frame };
