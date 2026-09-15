import { it } from 'vitest';
import { resolve } from 'node:path';
import {
	mountDifferential,
	preloadDifferentialFixture,
} from '../../../octane/tests/differential/_rig.js';
const fixture = resolve(import.meta.dirname, '../_fixtures/database.tsrx');
const cache = resolve(import.meta.dirname, '.react-cache');
await preloadDifferentialFixture(fixture, cache);
// @parity-case differential:db-provider-data
it('matches React for hydrated rows, updates, client replacement and teardown', async () => {
	const pair = await mountDifferential(fixture, 'Database', undefined, cache);
	try {
		await pair.step('hydrated rows', () => {});
		await pair.step('rename', async (octane, react) => {
			await octane.click('#rename');
			await react.click('#rename');
		});
		await pair.step('replace provider client', async (octane, react) => {
			await octane.click('#replace');
			await react.click('#replace');
		});
		await pair.step('rename after replacement', async (octane, react) => {
			await octane.click('#rename');
			await react.click('#rename');
		});
	} finally {
		pair.unmount();
	}
});
