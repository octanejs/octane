import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { buildUpstreamLock, gitBlobSha1 } from '../react-port/materialize-lib.mjs';
import { verifyMaterializedUpstreamEvidence } from './materialized-upstream-lib.mjs';
import { verifyLaneCollectedTests } from './harness-lib.mjs';
import { verifyPortTestClassifications } from './binding-classifications-lib.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const manifest = JSON.parse(
	readFileSync(new URL('../../packages/base-ui/audit/react-parity.json', import.meta.url), 'utf8'),
);

test('Base UI classifies every port-authored test exactly once', () => {
	assert.deepEqual(verifyPortTestClassifications(root, 'base-ui'), { tests: 27 });
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

test('Base UI crosswalk pin validation rejects altered pristine bytes', () => {
	const checkout = mkdtempSync(join(tmpdir(), 'base-ui-altered-pin-'));
	try {
		const packageRoot = join(checkout, 'packages/base-ui');
		const pinned = JSON.parse(
			readFileSync(join(root, 'packages/base-ui/audit/upstream.lock.json'), 'utf8'),
		);
		const source = 'export const value = 1;\n';
		const lock = buildUpstreamLock({
			identity: pinned.identity,
			license: { spdx: 'MIT' },
			scopes: ['src/index.ts'],
			treeEntries: [
				{
					type: 'blob',
					path: 'packages/react/src/index.ts',
					sha: gitBlobSha1(Buffer.from(source)),
					size: Buffer.byteLength(source),
				},
			],
			adaptedMappings: [],
		});
		mkdirSync(join(packageRoot, 'audit'), { recursive: true });
		mkdirSync(join(packageRoot, 'upstream/src'), { recursive: true });
		writeFileSync(join(packageRoot, 'audit/upstream.lock.json'), JSON.stringify(lock));
		writeFileSync(join(packageRoot, 'upstream/src/index.ts'), source);
		assert.equal(verifyMaterializedUpstreamEvidence(checkout, 'packages/base-ui').files, 1);
		writeFileSync(join(packageRoot, 'upstream/src/index.ts'), 'export const value = 2;\n');
		assert.throws(
			() => verifyMaterializedUpstreamEvidence(checkout, 'packages/base-ui'),
			/upstream tree drifted.*mismatched: 1/,
		);
	} finally {
		rmSync(checkout, { recursive: true, force: true });
	}
});
