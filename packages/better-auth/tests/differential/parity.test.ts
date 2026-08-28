import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	mountDifferential,
	preloadDifferentialFixture,
} from '../../../octane/tests/differential/_rig.js';

const fixture = resolve(__dirname, 'auth-diff.tsrx');
const cache = resolve(__dirname, '.react-cache');

await preloadDifferentialFixture(fixture, cache);

describe('differential: @octanejs/better-auth vs better-auth/react', () => {
	// @parity-case differential:better-auth-client-surface
	it('matches session, plugin atom, and plugin action behavior', async () => {
		const differential = await mountDifferential(fixture, 'AuthSurface', undefined, cache);
		await expect
			.poll(() => [
				differential.octane.find('#session').textContent,
				differential.react.find('#session').textContent,
			])
			.toEqual(['Ada', 'Ada']);
		await differential.step('session resolves', () => {});
		await differential.step('plugin atom updates', async (octane, react) => {
			await octane.click('#advance');
			await react.click('#advance');
		});
		await differential.step('use-prefixed plugin action runs', async (octane, react) => {
			await octane.click('#action');
			await react.click('#action');
		});
		differential.unmount();
	});
});
