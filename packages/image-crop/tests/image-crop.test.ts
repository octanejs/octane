import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { flushSync } from 'octane';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { mount } from '../../octane/tests/_helpers.ts';
import ReactCrop, {
	Component,
	ReactCrop as NamedReactCrop,
	centerCrop,
	makeAspectCrop,
} from '../src/index.ts';
import { type CropChange, ImageCropFixture } from './_fixtures/image-crop.tsrx';

afterEach(() => {
	vi.restoreAllMocks();
});

describe('@octanejs/image-crop', () => {
	it('renders the crop box, circular mask, rules, addon, and compatibility aliases', () => {
		const changes: CropChange[] = [];
		const view = mount(ImageCropFixture, {
			changes,
			initialCrop: { unit: '%', x: 15, y: 10, width: 40, height: 30 },
		});

		const root = view.find('.ReactCrop') as HTMLElement;
		const selection = view.find('.ReactCrop__crop-selection') as HTMLElement;

		expect(root.classList).toContain('ReactCrop--circular-crop');
		expect(root.classList).toContain('ReactCrop--rule-of-thirds');
		expect(selection.style.left).toBe('15%');
		expect(selection.style.top).toBe('10%');
		expect(selection.style.width).toBe('40%');
		expect(selection.style.height).toBe('30%');
		expect(view.find('.ReactCrop__crop-mask ellipse')).toBeInstanceOf(SVGElement);
		expect(view.findAll('.ReactCrop__rule-of-thirds-hz')).toHaveLength(1);
		expect(view.findAll('.ReactCrop__rule-of-thirds-vt')).toHaveLength(1);
		expect(view.find('[data-testid="selection-state"]').textContent?.trim()).toBe('selection');
		expect(ReactCrop).toBe(NamedReactCrop);
		expect(Component).toBe(NamedReactCrop);
		expect(ReactCrop.xOrds).toEqual(['e', 'w']);
		expect(ReactCrop.yOrds).toEqual(['n', 's']);
		expect(ReactCrop.xyOrds).toEqual(['nw', 'ne', 'se', 'sw']);
		expect(ReactCrop.nudgeStep).toBe(1);
		expect(ReactCrop.nudgeStepMedium).toBe(10);
		expect(ReactCrop.nudgeStepLarge).toBe(100);

		view.unmount();
	});

	it('reports a newly drawn controlled crop from native pointer events', () => {
		const changes: Array<{
			pixel: { unit: 'px'; x: number; y: number; width: number; height: number };
			percent: { unit: '%'; x: number; y: number; width: number; height: number };
		}> = [];
		const view = mount(ImageCropFixture, { changes });
		const media = view.find('.ReactCrop__child-wrapper');
		vi.spyOn(media, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 100));

		flushSync(() => {
			media.dispatchEvent(
				new PointerEvent('pointerdown', {
					bubbles: true,
					cancelable: true,
					clientX: 20,
					clientY: 30,
				}),
			);
		});
		expect(view.find('[data-testid="selection-state"]').getAttribute('data-active')).toBe('true');
		expect(view.find('[data-testid="selection-state"]').getAttribute('data-drawing')).toBe('true');

		flushSync(() => {
			document.dispatchEvent(
				new PointerEvent('pointermove', {
					bubbles: true,
					cancelable: true,
					clientX: 80,
					clientY: 70,
				}),
			);
		});

		expect(changes.at(-1)).toEqual({
			pixel: { unit: 'px', x: 20, y: 30, width: 60, height: 40 },
			percent: { unit: '%', x: 10, y: 30, width: 30, height: 40 },
		});
		const selection = view.find('.ReactCrop__crop-selection') as HTMLElement;
		expect(selection.style.cssText).toContain('left: 20px');
		expect(selection.style.cssText).toContain('width: 60px');

		flushSync(() => {
			document.dispatchEvent(
				new PointerEvent('pointerup', {
					bubbles: true,
					cancelable: true,
					clientX: 80,
					clientY: 70,
				}),
			);
		});
		expect(view.find('[data-testid="selection-state"]').getAttribute('data-active')).toBe('false');
		expect(view.find('[data-testid="selection-state"]').getAttribute('data-drawing')).toBe('false');

		view.unmount();
	});

	it('preserves the pinned aspect and centering utility math', () => {
		const aspectCrop = makeAspectCrop({ unit: 'px', x: 10, y: 20, width: 160 }, 16 / 9, 300, 200);

		expect(aspectCrop).toEqual({
			unit: 'px',
			x: 10,
			y: 20,
			width: 160,
			height: 90,
		});
		expect(centerCrop(aspectCrop, 300, 200)).toEqual({
			unit: 'px',
			x: 70,
			y: 55,
			width: 160,
			height: 90,
		});
	});

	it('publishes both CSS entry points from the pinned compiled stylesheet', () => {
		const packageRoot = resolve(import.meta.dirname, '..');
		const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')) as {
			exports: Record<string, string>;
		};

		expect(manifest.exports['./dist/ReactCrop.css']).toBe('./src/ReactCrop.css');
		expect(manifest.exports['./ReactCrop.css']).toBe('./src/ReactCrop.css');
		expect(manifest.exports['./src/ReactCrop.scss']).toBe('./src/ReactCrop.css');
		const publishedCss = readFileSync(resolve(packageRoot, 'src/ReactCrop.css'), 'utf8').trim();
		const upstreamCss = readFileSync(
			resolve(packageRoot, 'upstream-artifact/ReactCrop.css'),
			'utf8',
		)
			.replace('/*$vite$:1*/', '')
			.trim();
		expect(publishedCss).toBe(upstreamCss);
	});
});
