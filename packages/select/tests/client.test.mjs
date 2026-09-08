import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'vitest';
import { fileURLToPath } from 'node:url';
import { serializeStyles } from '@emotion/serialize';

test('inserts, isolates, nonces, deduplicates, and adopts client rules', () => {
	const stdout = execFileSync(
		process.execPath,
		[fileURLToPath(new URL('./client-fixture.mjs', import.meta.url))],
		{
			encoding: 'utf8',
		},
	);
	const result = JSON.parse(stdout);
	const expectedClassName = `rs-${
		serializeStyles([{ color: 'hotpink', '&:hover': { color: 'rebeccapurple' } }]).name
	}`;
	assert.deepEqual(result, {
		className: expectedClassName,
		clientNonce: 'client-nonce',
		dedupedTags: 1,
		hydratedTags: 1,
		orderedRules: true,
	});
	assert.equal(result.className, expectedClassName);
});
