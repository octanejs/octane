/**
 * The same authored fixture runs every @octanejs/dnd-kit-utilities hook and
 * the published @dnd-kit/utilities@3.2.2 hooks on React. Rendered values and
 * the logged ref-callback and layout-effect sequence must match at each step.
 */
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import {
	mountDifferential,
	preloadDifferentialFixture,
} from '../../../octane/tests/differential/_rig';

const fixture = resolve(__dirname, '../_fixtures/differential.tsrx');
const cache = resolve(__dirname, '.react-cache');

await preloadDifferentialFixture(fixture, cache);

describe('differential: @octanejs/dnd-kit-utilities hooks vs @dnd-kit/utilities@3.2.2', () => {
	// @parity-case differential:dnd-kit-utilities-hooks
	it('matches hook values, ref callbacks, and effects across updates', async () => {
		const comparison = await mountDifferential(fixture, 'HookProbe', undefined, cache);
		await comparison.step('mount', () => {});
		await comparison.step('report after mount', async (octane, react) => {
			await octane.click('#report');
			await react.click('#report');
		});
		for (const name of ['first increment', 'second increment']) {
			await comparison.step(name, async (octane, react) => {
				await octane.click('#increment');
				await react.click('#increment');
			});
		}
		await comparison.step('set and clear an interval', async (octane, react) => {
			await octane.click('#interval');
			await react.click('#interval');
		});
		await comparison.step('swap the ref targets', async (octane, react) => {
			await octane.click('#swap');
			await react.click('#swap');
		});
		await comparison.step('report after updates', async (octane, react) => {
			await octane.click('#report');
			await react.click('#report');
		});
		expect(comparison.octane.find('#values').textContent).toMatch(
			/^count:2\|previous:2\|lazy:103\|id:probe-\d+\|fixed:fixed\|stable:true$/,
		);
		expect(comparison.octane.find('#report-text').textContent).toBe(
			// Each render passes new ref callbacks, so the combined ref detaches and reattaches.
			'refs:a:first,b:first' +
				',a:null,b:null,a:first,b:first'.repeat(3) +
				',a:null,b:null,a:second,b:second' +
				'|node:null>node-first,node-first>null,null>node-second|effects:layout:0,layout:1,layout:2' +
				'|event:2|latest:2|current:node-second',
		);
		comparison.unmount();
	});
});
