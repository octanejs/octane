import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import {
	mountDifferential,
	preloadDifferentialFixture,
	type DiffMount,
} from '../../../octane/tests/differential/_rig.js';

const fixture = resolve(__dirname, '../_fixtures/parity.tsrx');
const cache = resolve(__dirname, '.react-cache');

async function waitForConnectedStatus(...mounts: DiffMount[]): Promise<void> {
	for (let attempt = 0; attempt < 20; attempt++) {
		if (
			mounts.every(function (mount) {
				return mount.find('#status').textContent === 'connected';
			})
		) {
			return;
		}
		await new Promise(function (resolveTimer) {
			setTimeout(resolveTimer, 10);
		});
	}

	throw new Error('connection status did not reach connected within 200ms');
}

await Promise.all([preloadDifferentialFixture(fixture, cache)]);

describe('differential: @octanejs/wagmi vs real wagmi', () => {
	// @parity-case differential:wagmi-connection
	it('connection: disconnected → connected renders byte-identical', async () => {
		const differential = await mountDifferential(fixture, 'WagmiParityApp', undefined, cache);
		await differential.step('disconnected', function () {});
		await differential.step('connect', async function (octane, react) {
			await octane.click('#connect');
			await react.click('#connect');
			await waitForConnectedStatus(octane, react);
			expect(octane.find('#status').textContent).toBe('connected');
			expect(react.find('#status').textContent).toBe('connected');
		});
		differential.unmount();
	});
});
