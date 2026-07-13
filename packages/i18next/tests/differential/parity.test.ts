/**
 * The same source runs through @octanejs/i18next on Octane and
 * react-i18next on React. The shared rig drives both trees and compares their
 * normalized DOM after mount and language changes.
 */
import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

const fixture = resolve(__dirname, '../_fixtures/runtime-diff.tsrx');
const cache = resolve(__dirname, '.react-cache');

describe('differential: @octanejs/i18next vs react-i18next', () => {
	it('matches hook, provider, Trans, and language subscription output', async () => {
		const differential = await mountDifferential(fixture, 'I18nextParity', undefined, cache);
		await differential.step('mount', () => {});
		await differential.step('French', async (octane, react) => {
			await octane.click('#fr');
			await react.click('#fr');
		});
		await differential.step('English', async (octane, react) => {
			await octane.click('#en');
			await react.click('#en');
		});
		differential.unmount();
	});
});
