/**
 * The same source runs through @octanejs/i18next on Octane and
 * react-i18next on React. The shared rig drives both trees and compares their
 * normalized DOM after mount and language changes, and while suspending hooks
 * in one component settle one after another.
 */
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import {
	mountDifferential,
	preloadDifferentialFixture,
} from '../../../octane/tests/differential/_rig.js';

const fixture = resolve(__dirname, '../_fixtures/runtime-diff.tsrx');
const suspenseFixture = resolve(__dirname, '../_fixtures/suspense-diff.tsrx');
const cache = resolve(__dirname, '.react-cache');

await Promise.all([
	preloadDifferentialFixture(fixture, cache),
	preloadDifferentialFixture(suspenseFixture, cache),
]);

const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The first namespace loads at 10ms and the second read settles 200ms later;
// compare the fallback, the first-loaded window, and the final result. The last
// wait outlasts React's 300ms throttle on revealing content after a fallback.
async function expectSequentialSuspense(order: string, result: string) {
	const differential = await mountDifferential(suspenseFixture, 'SuspenseParity', { order }, cache);
	await differential.step('mount (first namespace pending)', () => {});
	await differential.step('first namespace loaded, second read pending', async () => {
		await settle(40);
	});
	await differential.step('both settled', async (octane) => {
		await settle(500);
		expect(octane.find('#result').textContent).toBe(result);
	});
	differential.unmount();
}

describe('differential: @octanejs/i18next vs react-i18next', () => {
	// @parity-case differential:i18next-runtime
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

	// @parity-case differential:i18next-sequential-suspense
	it('useTranslation → useTranslation holds the fallback until both namespaces load', async () => {
		await expectSequentialSuspense('hook-hook', 'First/Second');
	});

	// @parity-case differential:i18next-translation-then-use-suspense
	it('useTranslation → use() holds the fallback until both settle', async () => {
		await expectSequentialSuspense('hook-use', 'First/data');
	});
});
