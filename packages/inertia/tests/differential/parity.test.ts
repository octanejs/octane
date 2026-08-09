/**
 * Differential parity: the same `.tsrx` fixture runs through @octanejs/inertia
 * on Octane and @inertiajs/react@3.6.1 on React. After mount and a page swap,
 * rendered DOM must match, proving usePage reads the shared page context
 * identically on both sides.
 */
import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

const FIXTURE = resolve(__dirname, '../_fixtures/use-page-diff.tsrx');
const CACHE = resolve(__dirname, '.react-cache');

describe('differential: @octanejs/inertia vs @inertiajs/react 3.6.1', () => {
	// @parity-case differential:use-page
	it('usePage: mount and page swap render byte-identical', async () => {
		const differential = await mountDifferential(FIXTURE, 'UsePageParity', undefined, CACHE);
		await differential.step('mount', function () {});
		await differential.step('swap page', async function (octane, react) {
			await octane.click('#next');
			await react.click('#next');
		});
		differential.unmount();
	});
});
