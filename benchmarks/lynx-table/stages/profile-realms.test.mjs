import assert from 'node:assert/strict';
import vm from 'node:vm';
import test from 'node:test';

import { realmSnapshots, resetProfiles } from './profile-realms.mjs';

function realm(profile) {
	return {
		evaluate(callback) {
			return Promise.resolve(
				vm.runInNewContext(`(${callback.toString()})()`, {
					__OCTANE_LYNX_PROF: profile,
				}),
			);
		},
	};
}

test('resets accumulated frame and worker counters before an operation', async () => {
	const main = { applyMs: 90, papiCreateMs: 70 };
	const background = { bgReplayMs: 30, dispatchMs: 10 };
	const page = {
		frames: () => [realm(undefined), realm(main)],
		workers: () => [realm(background)],
	};

	assert.deepEqual(await realmSnapshots(page), { main, background });
	await resetProfiles(page);
	assert.deepEqual(main, { applyMs: 0, papiCreateMs: 0 });
	assert.deepEqual(background, { bgReplayMs: 0, dispatchMs: 0 });
});
