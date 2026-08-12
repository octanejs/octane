import { resolve } from 'node:path';
import { describe, it } from 'vitest';
import {
	mountDifferential,
	preloadDifferentialFixture,
} from '../../../octane/tests/differential/_rig.js';

const FIXTURE = resolve(__dirname, '../_fixtures/query.tsrx');
const CACHE = resolve(__dirname, '.react-cache');

async function settleQueue() {
	for (let index = 0; index < 8; index++) await new Promise((resolve) => setTimeout(resolve, 0));
}

await Promise.all([preloadDifferentialFixture(FIXTURE, CACHE)]);

describe('differential: @octanejs/nuqs vs nuqs', () => {
	// @parity-case differential:nuqs-query-state
	it('initial parsing, functional updates, and URL reconciliation are byte-identical', async () => {
		const differential = await mountDifferential(
			FIXTURE,
			'CounterApp',
			{ searchParams: '?count=41' },
			CACHE,
		);
		await differential.step('initial parse', settleQueue);
		await differential.step('functional increment', async (octane, react) => {
			await octane.click('#inc');
			await react.click('#inc');
			await settleQueue();
		});
		await differential.step('clear to default', async (octane, react) => {
			await octane.click('#clear');
			await react.click('#clear');
			await settleQueue();
		});
		differential.unmount();
	});
});
