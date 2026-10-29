/**
 * The same authored fixture renders @octanejs/dnd-kit-accessibility and the
 * published @dnd-kit/accessibility@3.1.1 on React: the visually hidden live
 * regions, the hidden instructions, and each announcement must match.
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

describe('differential: @octanejs/dnd-kit-accessibility vs @dnd-kit/accessibility@3.1.1', () => {
	// @parity-case differential:dnd-kit-accessibility-announcements
	it('matches live regions, hidden instructions, and announcements', async () => {
		const comparison = await mountDifferential(fixture, 'Announcer', undefined, cache);
		await comparison.step('mount', () => {});
		await comparison.step('announce', async (octane, react) => {
			await octane.click('#announce');
			await react.click('#announce');
		});
		expect(comparison.octane.find('#polite').textContent).toBe('Picked up item 1.');
		await comparison.step('ignore an undefined announcement', async (octane, react) => {
			await octane.click('#ignore');
			await react.click('#ignore');
		});
		expect(comparison.octane.find('#assertive').textContent).toBe('Picked up item 1.');
		await comparison.step('clear', async (octane, react) => {
			await octane.click('#clear');
			await react.click('#clear');
		});
		expect(comparison.octane.find('#assertive').textContent).toBe('');
		comparison.unmount();
	});
});
