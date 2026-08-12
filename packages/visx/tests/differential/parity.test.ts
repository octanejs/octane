import { describe, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { act as reactAct } from 'react';
import {
	mountDifferential,
	preloadDifferentialFixture,
} from '../../../octane/tests/differential/_rig.js';

const fixture = resolve(__dirname, '../_fixtures/differential.tsrx');
const cache = resolve(__dirname, '.react-cache');

function mockZoomTargetBounds(target: Element): void {
	vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 120));
}

function dispatchZoomGestures(root: HTMLElement): void {
	const target = root.querySelector('[data-testid="zoom-target"]') as SVGSVGElement;
	mockZoomTargetBounds(target);
	target.dispatchEvent(
		new WheelEvent('wheel', {
			bubbles: true,
			cancelable: true,
			clientX: 50,
			clientY: 30,
			deltaY: -1,
		}),
	);
	target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 20, clientY: 20 }));
	window.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 40, clientY: 50 }));
	window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
}

await Promise.all([preloadDifferentialFixture(fixture, cache)]);

describe('@octanejs/visx React differential', () => {
	// @parity-case differential:visx-primitives
	it('matches scale, grid, gradient, axis, glyph, bar, and line SVG', async function () {
		const differential = await mountDifferential(
			fixture,
			'PrimitiveDifferential',
			undefined,
			cache,
		);
		await differential.step('mount', function () {});
		differential.unmount();
	});

	// @parity-case differential:visx-layout
	it('matches render-prop pie layout and path generation', async function () {
		const differential = await mountDifferential(fixture, 'LayoutDifferential', undefined, cache);
		await differential.step('mount', function () {});
		differential.unmount();
	});

	// OCTANE DIVERGENCE[visx-native-dom-events][differential:visx-interaction]: Octane delivers a native click; React uses its synthetic layer.
	// @parity-case differential:visx-interaction
	it('matches state updates while Octane delivers a native click event', async function () {
		const differential = await mountDifferential(
			fixture,
			'InteractiveDifferential',
			undefined,
			cache,
		);
		await differential.step('click', async function ({ container: octane }, { container: react }) {
			(octane.querySelector('[data-testid="select-bar"]') as SVGRectElement).dispatchEvent(
				new MouseEvent('click', { bubbles: true }),
			);
			await reactAct(async function () {
				(react.querySelector('[data-testid="select-bar"]') as SVGRectElement).dispatchEvent(
					new MouseEvent('click', { bubbles: true }),
				);
			});
		});
		differential.unmount();
	});

	// @parity-case differential:visx-functional-controllers
	it('matches functional Brush selection without class-instance controller refs', async function () {
		const differential = await mountDifferential(fixture, 'BrushDifferential', undefined, cache);
		await differential.step('mount', function () {});
		differential.unmount();
	});

	// OCTANE DIVERGENCE[visx-native-zoom-gestures][differential:visx-native-gestures]:
	// Zoom attaches native wheel/pointer listeners; React Visx uses @use-gesture/react.
	// @parity-case differential:visx-native-gestures
	it('matches Zoom native wheel and pointer gesture listeners', async function () {
		const differential = await mountDifferential(
			fixture,
			'GestureSpringDifferential',
			undefined,
			cache,
		);
		await differential.step('mount', function () {});
		await differential.step(
			'wheel and pointer gestures',
			async function ({ container: octane }, { container: react }) {
				dispatchZoomGestures(octane);
				await reactAct(async function () {
					dispatchZoomGestures(react);
				});
			},
		);
		differential.unmount();
	});
});
