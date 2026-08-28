/**
 * Differential parity: the SAME `.tsrx` fixture runs through
 * `@octanejs/formisch` (Octane) AND real `@formisch/react` (the setup
 * rewrites the import). After mount and after a programmatic field update,
 * the rendered DOM must match, proving the Octane binding delivers the same
 * field state as the React adapter.
 */
import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import {
	mountDifferential,
	preloadDifferentialFixture,
} from '../../../octane/tests/differential/_rig.js';

const fixture = resolve(__dirname, '../_fixtures/differential.tsrx');
const cache = resolve(__dirname, '.react-cache');

await Promise.all([preloadDifferentialFixture(fixture, cache)]);

describe('differential: @octanejs/formisch vs @formisch/react', function () {
	// @parity-case differential:field-update
	it('field update: programmatic onChange renders byte-identical', async function () {
		const differential = await mountDifferential(fixture, 'DifferentialForm', undefined, cache);
		await differential.step('mount', function () {});
		await differential.step('set valid email', async function (octane, react) {
			await octane.click('#set-valid');
			await react.click('#set-valid');
		});
		differential.unmount();
	});
});
