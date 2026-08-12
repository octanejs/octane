// Ported from react-spring v10.1.2 packages/shared/src/FrameLoop.ts.
import { raf } from '@react-spring/rafz';

export interface OpaqueAnimation {
	idle: boolean;
	priority: number;
	advance(dt: number): void;
}

const startQueue = new Set<OpaqueAnimation>();
let currentFrame: OpaqueAnimation[] = [];
let previousFrame: OpaqueAnimation[] = [];
let priority = 0;

export const frameLoop = {
	get idle(): boolean {
		return startQueue.size === 0 && currentFrame.length === 0;
	},
	start(animation: OpaqueAnimation): void {
		if (priority > animation.priority) {
			startQueue.add(animation);
			raf.onStart(flushStartQueue);
		} else {
			startSafely(animation);
			raf(advance);
		}
	},
	advance,
	sort(animation: OpaqueAnimation): void {
		if (priority) raf.onFrame(() => frameLoop.sort(animation));
		else {
			const index = currentFrame.indexOf(animation);
			if (index >= 0) {
				currentFrame.splice(index, 1);
				startUnsafely(animation);
			}
		}
	},
	clear(): void {
		currentFrame = [];
		previousFrame = [];
		startQueue.clear();
	},
};

function flushStartQueue(): void {
	startQueue.forEach(startSafely);
	startQueue.clear();
	raf(advance);
}

function startSafely(animation: OpaqueAnimation): void {
	if (!currentFrame.includes(animation)) startUnsafely(animation);
}

function startUnsafely(animation: OpaqueAnimation): void {
	const index = currentFrame.findIndex((other) => other.priority > animation.priority);
	currentFrame.splice(index < 0 ? currentFrame.length : index, 0, animation);
}

function advance(dt: number): boolean {
	const nextFrame = previousFrame;
	for (const animation of currentFrame) {
		priority = animation.priority;
		if (!animation.idle) {
			animation.advance(dt);
			if (!animation.idle) nextFrame.push(animation);
		}
	}
	priority = 0;
	previousFrame = currentFrame;
	previousFrame.length = 0;
	currentFrame = nextFrame;
	return currentFrame.length > 0;
}
