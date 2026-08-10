import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { mountDifferential } from '../../../octane/tests/differential/_rig';

const fixture = resolve(__dirname, '../_fixtures/virtualizers.tsrx');
const cache = resolve(__dirname, '.react-cache');

function scroll(
	mount: { find(selector: string): Element },
	selector: string,
	left: number,
	top: number,
) {
	const element = mount.find(selector) as HTMLElement;
	element.scrollLeft = left;
	element.scrollTop = top;
	element.dispatchEvent(new Event('scroll', { bubbles: true }));
}

describe('differential: @octanejs/window vs react-window', () => {
	// @parity-case differential:react-window-list
	it('List renders and scrolls through the same bounded rows', async () => {
		const differential = await mountDifferential(fixture, 'ListFixture', undefined, cache);
		await differential.step('mount', () => {});
		await differential.step('vertical scroll', (octane, react) => {
			scroll(octane, '[role="list"]', 0, 400);
			scroll(react, '[role="list"]', 0, 400);
		});
		await differential.observe('visible rows', (octane, react) => {
			expect(
				octane.findAll('[role="listitem"]').map((row) => row.getAttribute('data-value')),
			).toEqual(react.findAll('[role="listitem"]').map((row) => row.getAttribute('data-value')));
		});
		differential.unmount();
	});

	// @parity-case differential:react-window-grid
	it('Grid renders and scrolls through the same bounded cells', async () => {
		const differential = await mountDifferential(fixture, 'GridFixture', undefined, cache);
		await differential.step('mount', () => {});
		await differential.step('two-axis scroll', (octane, react) => {
			scroll(octane, '[role="grid"]', 300, 400);
			scroll(react, '[role="grid"]', 300, 400);
		});
		await differential.observe('visible cells', (octane, react) => {
			expect(
				octane.findAll('[role="gridcell"]').map((cell) => cell.getAttribute('data-value')),
			).toEqual(react.findAll('[role="gridcell"]').map((cell) => cell.getAttribute('data-value')));
		});
		differential.unmount();
	});
});
