import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadManifest, verifyLaneCollectedTests } from './harness-lib.mjs';
import { classifyExport, exportedNames } from '../../packages/aria/scripts/crosswalk-lib.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('Aria exact selection rejects a renamed declared case', async () => {
	const manifest = await loadManifest(path.join(REPO, 'packages/aria/audit/react-parity.json'));
	const lane = structuredClone(
		manifest.lanes.find((candidate) => candidate.id === 'aria-runtime-differential'),
	);
	const collected = lane.files.flatMap((file) =>
		(file.cases ?? []).map((entry) => ({ file: path.join(REPO, file.path), name: entry.fullName })),
	);
	lane.files[0].cases[0].fullName += ' renamed';
	assert.throws(
		() => verifyLaneCollectedTests(lane, collected, REPO),
		/fullName must match exactly one collected Vitest test/,
	);
});

test('Aria crosswalk generation rejects a checkout at the wrong commit', () => {
	const checkout = mkdtempSync(path.join(tmpdir(), 'aria-crosswalk-pin-'));
	try {
		execFileSync('git', ['init', checkout], { stdio: 'pipe' });
		execFileSync('git', ['-C', checkout, 'config', 'user.email', 'test@example.com']);
		execFileSync('git', ['-C', checkout, 'config', 'user.name', 'Parity Test']);
		execFileSync('git', ['-C', checkout, 'commit', '--allow-empty', '-m', 'wrong pin'], {
			stdio: 'pipe',
		});
		assert.throws(
			() =>
				execFileSync(
					process.execPath,
					['packages/aria/scripts/build-upstream-crosswalk.mjs', checkout],
					{ cwd: REPO, encoding: 'utf8', stdio: 'pipe' },
				),
			/pinned to 1c84a49a1faf50b571c84e00bcf9c60b22ddd03e/,
		);
	} finally {
		rmSync(checkout, { recursive: true, force: true });
	}
});

test('Aria surface classification fails closed when a runtime export becomes type-only', () => {
	const octane = exportedNames(path.join(REPO, 'packages/aria/src/index.ts'));
	octane.set('useButton', 'type');
	assert.equal(
		classifyExport('useButton', 'runtime', octane, 'packages/aria/src/index.ts')[2],
		'gap',
	);
});
