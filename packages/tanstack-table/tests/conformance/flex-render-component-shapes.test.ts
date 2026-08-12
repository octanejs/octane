/**
 * Ordinary framework-contract check: Octane memo()-wrapped cells are plain
 * functions, so flexRender uses the function branch. Kept outside react-parity
 * ownership because it has no paired same-scenario React observation.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount, nextPaint } from '../_helpers';
import { FlexTable, cellProps } from '../_fixtures/flex-render.tsrx';

async function flush() {
	for (let i = 0; i < 4; i++) {
		await new Promise(function (r) {
			setTimeout(r, 0);
		});
		await nextPaint();
	}
}

beforeEach(function () {
	cellProps.length = 0;
});

describe('flexRender through the octane render path', function () {
	it('renders an octane memo()-wrapped component cell (plain function, no exotic sniffing)', async function () {
		const r = mount(FlexTable, {});
		await flush();
		const cells = r.findAll('.age-cell');
		expect(
			cells.map(function (c) {
				return c.textContent;
			}),
		).toEqual(['mc:29', 'mc:40']);
		r.unmount();
	});
});
