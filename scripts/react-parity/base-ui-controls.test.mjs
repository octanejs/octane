import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { verifyLaneCollectedTests } from './harness-lib.mjs';
import { verifyPortTestClassifications } from './binding-classifications-lib.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const manifest = JSON.parse(
	readFileSync(new URL('../../packages/base-ui/audit/react-parity.json', import.meta.url), 'utf8'),
);

test('Base UI classifies every port-authored test exactly once', () => {
	assert.deepEqual(verifyPortTestClassifications(root, 'base-ui'), { tests: 22 });
});

test('Base UI differential lane rejects a renamed declared case', () => {
	const lane = manifest.lanes.find((entry) => entry.id === 'base-ui-differential-full-suite');
	assert.ok(lane, 'Base UI differential lane must remain declared');
	const collected = lane.files
		.filter((file) => file.role === 'test')
		.flatMap((file) =>
			file.cases.map((entry) => ({
				file: fileURLToPath(new URL(`../../${file.path}`, import.meta.url)),
				name: entry.fullName,
			})),
		);
	collected[0] = { ...collected[0], name: `${collected[0].name} renamed` };
	assert.throws(
		() => verifyLaneCollectedTests(lane, collected, root),
		/fullName must match exactly one collected Vitest test/,
	);
});

test('Base UI crosswalk generator rejects a checkout at the wrong commit', () => {
	const checkout = mkdtempSync(join(tmpdir(), 'base-ui-wrong-pin-'));
	try {
		execFileSync('git', ['init', '--quiet', checkout]);
		execFileSync('git', ['-C', checkout, 'config', 'user.email', 'parity@example.invalid']);
		execFileSync('git', ['-C', checkout, 'config', 'user.name', 'Parity Control']);
		execFileSync('git', ['-C', checkout, 'commit', '--allow-empty', '--quiet', '-m', 'wrong pin']);
		assert.throws(
			() =>
				execFileSync(
					process.execPath,
					['packages/base-ui/scripts/build-upstream-crosswalk.mjs', checkout],
					{ cwd: root, stdio: 'pipe' },
				),
			/pinned to b34551d644f2e58ebf8fc1050d949f6654ceca6c/,
		);
	} finally {
		rmSync(checkout, { recursive: true, force: true });
	}
});
