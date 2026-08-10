import {
	checkIfFrameIsEmpty as reactCheckIfFrameIsEmpty,
	getFirstFrame as reactGetFirstFrame,
} from '@react-three/drei/core/useSpriteLoader.js';
import { describe, expect, it } from 'vitest';
import { checkIfFrameIsEmpty, getFirstFrame, type FrameData } from '../src/index.js';

function frame(x: number): FrameData {
	return {
		frame: { x, y: 0, w: 16, h: 16 },
		rotated: false,
		trimmed: false,
		spriteSourceSize: { x: 0, y: 0, w: 16, h: 16 },
		sourceSize: { w: 16, h: 16 },
	};
}

describe('sprite-loader utilities', () => {
	it('matches array, named-record, and default-record first-frame selection', () => {
		const arrayFrames = [frame(1), frame(2)];
		const recordFrames = { idle: [frame(3)], run: [frame(4)] };
		expect(getFirstFrame(arrayFrames)).toBe(reactGetFirstFrame(arrayFrames));
		expect(getFirstFrame(recordFrames)).toBe(reactGetFirstFrame(recordFrames));
		expect(getFirstFrame(recordFrames, 'run')).toBe(reactGetFirstFrame(recordFrames, 'run'));
	});

	it('matches alpha-channel empty-frame detection at byte boundaries', () => {
		const cases = [
			new Uint8ClampedArray(),
			new Uint8ClampedArray([255, 255, 255, 0]),
			new Uint8ClampedArray([0, 0, 0, 0, 1, 2, 3, 1]),
			new Uint8ClampedArray([0, 0, 0, 0, 255, 255, 255, 0]),
		];
		for (const pixels of cases) {
			expect(checkIfFrameIsEmpty(pixels)).toBe(reactCheckIfFrameIsEmpty(pixels));
		}
	});
});
