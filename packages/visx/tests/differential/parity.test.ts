import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import { act as reactAct } from 'react';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

const fixture = resolve(__dirname, '../_fixtures/differential.tsrx');
const cache = resolve(__dirname, '.react-cache');

describe('@octanejs/visx React differential', () => {
	it('matches scale, grid, gradient, axis, glyph, bar, and line SVG', async () => {
		const differential = await mountDifferential(
			fixture,
			'PrimitiveDifferential',
			undefined,
			cache,
		);
		await differential.step('mount', () => {});
		differential.unmount();
	});

	it('matches render-prop pie layout and path generation', async () => {
		const differential = await mountDifferential(fixture, 'LayoutDifferential', undefined, cache);
		await differential.step('mount', () => {});
		differential.unmount();
	});

	it('matches state updates while Octane delivers a native click event', async () => {
		const differential = await mountDifferential(
			fixture,
			'InteractiveDifferential',
			undefined,
			cache,
		);
		await differential.step('click', async ({ container: octane }, { container: react }) => {
			(octane.querySelector('[data-testid="select-bar"]') as SVGRectElement).dispatchEvent(
				new MouseEvent('click', { bubbles: true }),
			);
			await reactAct(async () => {
				(react.querySelector('[data-testid="select-bar"]') as SVGRectElement).dispatchEvent(
					new MouseEvent('click', { bubbles: true }),
				);
			});
		});
		differential.unmount();
	});
});
