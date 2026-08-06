// The ported half of the <Go> preview: the fit maths and the fit/responsive
// decision, adapted from @lynx-js/go-web (see src/components/go/lynx-view/
// UPSTREAM.md).
//
// These are the two pieces that must stay behaviourally equal to upstream so
// the directory can go back there, and the hysteresis in particular is easy to
// break in a way no screenshot would catch.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { playAutoGesture } from '../src/components/go/lynx-view/auto-gesture.ts';
import {
	computeFrameOffset,
	computeScaleRange,
	lerpFitScale,
} from '../src/components/go/lynx-view/fit.ts';
import {
	resolveWebPreviewMode,
	resolveWebPreviewModeWithHysteresis,
} from '../src/components/go/lynx-view/mode.ts';
import type { WebPreviewMode } from '../src/components/go/lynx-view/mode.ts';
import { LYNX_EXAMPLES } from '../src/content/lynx-examples.ts';

const PHONE = { designWidth: 375, designHeight: 812 };
const THRESHOLDS = { fitThresholdScale: 1, fitMinScale: 0.5 };

function args(
	containerWidth: number,
	containerHeight: number,
	webPreviewMode: WebPreviewMode = 'auto',
) {
	return { webPreviewMode, ...PHONE, ...THRESHOLDS, containerWidth, containerHeight };
}

describe('fit maths', () => {
	it('brackets the scale range with contain below cover', () => {
		const range = computeScaleRange({
			containerWidth: 248,
			containerHeight: 536,
			baseWidth: 375,
			baseHeight: 812,
		});
		expect(range.contain).toBeLessThanOrEqual(range.cover);
		// Contain fits both axes; cover fills the binding one.
		expect(375 * range.contain).toBeLessThanOrEqual(248 + 0.001);
		expect(812 * range.contain).toBeLessThanOrEqual(536 + 0.001);
		expect(Math.max(375 * range.cover, 0)).toBeGreaterThanOrEqual(248 - 0.001);
	});

	it('rejects a base frame it cannot scale', () => {
		expect(() =>
			computeScaleRange({
				containerWidth: 100,
				containerHeight: 100,
				baseWidth: 0,
				baseHeight: 812,
			}),
		).toThrow(RangeError);
	});

	it('interpolates contain to cover across the unit interval', () => {
		const range = { contain: 0.5, cover: 0.8 };
		expect(lerpFitScale(range, 0)).toBe(0.5);
		expect(lerpFitScale(range, 1)).toBeCloseTo(0.8);
		expect(lerpFitScale(range, 0.5)).toBeCloseTo(0.65);
	});

	it('centres a scaled frame by translating back half its scaled size', () => {
		expect(
			computeFrameOffset({ baseWidth: 375, baseHeight: 812, scale: 0.5, ax: 0.5, ay: 0.5 }),
		).toEqual({ offsetX: -93.75, offsetY: -203 });
	});
});

describe('web preview mode', () => {
	it('honours an explicit choice regardless of size', () => {
		expect(resolveWebPreviewMode(args(2000, 2000, 'fit')).mode).toBe('fit');
		expect(resolveWebPreviewMode(args(10, 10, 'responsive')).mode).toBe('responsive');
	});

	it('falls back to responsive when it cannot measure', () => {
		expect(resolveWebPreviewMode(args(0, 0)).reason).toBe('invalid_dims');
		expect(resolveWebPreviewMode(args(Number.NaN, 500)).mode).toBe('responsive');
	});

	it('uses the phone frame for a container narrower than the design width', () => {
		// The docs panel: 248 x 536 CSS pixels.
		const resolved = resolveWebPreviewMode(args(248, 536));
		expect(resolved.mode).toBe('fit');
		expect(resolved.reason).toBe('width_bound');
	});

	it('uses the phone frame for a container too short to be worth re-basing', () => {
		expect(resolveWebPreviewMode(args(600, 300)).reason).toBe('height_bound');
	});

	it('re-bases onto the container once it is comfortably larger', () => {
		expect(resolveWebPreviewMode(args(600, 900)).mode).toBe('responsive');
	});
});

describe('web preview hysteresis', () => {
	// The band exists so a panel resizing across the boundary does not flip the
	// whole layout back and forth on every animation frame.
	it('holds fit across the band it entered on, then leaves above it', () => {
		const insideBand = resolveWebPreviewModeWithHysteresis(args(380, 900), 'fit', 'width');
		expect(insideBand.mode).toBe('fit');
		expect(insideBand.reason).toBe('hysteresis_hold');
		// Above 375 * 1.06 the fit path is abandoned.
		expect(resolveWebPreviewModeWithHysteresis(args(400, 900), 'fit', 'width').mode).toBe(
			'responsive',
		);
	});

	it('does not enter fit from responsive inside that same band', () => {
		expect(resolveWebPreviewModeWithHysteresis(args(380, 900), 'responsive', null).mode).toBe(
			'responsive',
		);
	});

	it('carries the entering axis through a hold so the bias keeps its shape', () => {
		expect(resolveWebPreviewModeWithHysteresis(args(380, 900), 'fit', 'width').fitKind).toBe(
			'width',
		);
		expect(resolveWebPreviewModeWithHysteresis(args(380, 900), 'fit', 'height').fitKind).toBe(
			'height',
		);
	});

	it('reports no fit axis once it resolves to responsive', () => {
		expect(
			resolveWebPreviewModeWithHysteresis(args(900, 1400), 'responsive', null).fitKind,
		).toBeNull();
	});
});

describe('the default viewport mode', () => {
	// The fit path scales the view with a CSS transform, and web-core measures
	// list cells with getBoundingClientRect — so under it a waterfall <list>
	// packs its cells by the scale factor and they overlap. `auto` picks fit for
	// any panel narrower than a phone, which is nearly every panel, so the
	// default has to be the one go-web itself documents.
	it('leaves a panel narrower than the design width on the responsive path', () => {
		expect(resolveWebPreviewMode(args(248, 537, 'responsive')).mode).toBe('responsive');
	});

	it('would have chosen the transform-scaled path under auto', () => {
		// Guards the reasoning above rather than the choice: if `auto` ever stops
		// resolving to fit here, the default is worth revisiting.
		expect(resolveWebPreviewMode(args(248, 537)).mode).toBe('fit');
	});
});

describe('automatic gesture playback', () => {
	const elementFromPointDescriptor = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		if (elementFromPointDescriptor) {
			Object.defineProperty(document, 'elementFromPoint', elementFromPointDescriptor);
		} else {
			Reflect.deleteProperty(document, 'elementFromPoint');
		}
		document.body.replaceChildren();
	});

	it('ends an active contact before stopping playback', async () => {
		vi.useFakeTimers();
		const host = document.createElement('div');
		const target = document.createElement('div');
		host.append(target);
		document.body.append(host);
		vi.spyOn(host, 'getBoundingClientRect').mockReturnValue(
			DOMRect.fromRect({ x: 0, y: 0, width: 375, height: 812 }),
		);
		Object.defineProperty(document, 'elementFromPoint', {
			configurable: true,
			value: () => target,
		});

		const events: string[] = [];
		for (const type of ['pointerdown', 'pointermove', 'pointerup']) {
			target.addEventListener(type, () => events.push(type));
		}
		const playback = playAutoGesture(host, {
			steps: [
				{
					path: [
						{ x: 0.8, y: 0.5 },
						{ x: 0.2, y: 0.5 },
					],
					durationMs: 320,
				},
			],
			loop: false,
			showPointer: false,
			startDelayMs: 0,
			stopOnUserInput: false,
		});

		await vi.advanceTimersByTimeAsync(1);
		expect(events.slice(0, 2)).toEqual(['pointerdown', 'pointermove']);
		playback.stop();
		expect(events.at(-1)).toBe('pointerup');
	});
});

describe('example manifest', () => {
	it('gives every example a distinct id and a repository directory', () => {
		const ids = LYNX_EXAMPLES.map((example) => example.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const example of LYNX_EXAMPLES) {
			expect(example.directory.startsWith('packages/'), example.id).toBe(true);
			expect(example.defaultFile.startsWith('src/'), example.id).toBe(true);
			expect(example.entry.length).toBeGreaterThan(0);
		}
	});
});
