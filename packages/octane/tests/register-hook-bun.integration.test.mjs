import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { test } from 'node:test';

const bun = process.env.BUN_BINARY;
const fixtureDirectory = resolve('packages/octane/tests/_fixtures/register-hook');

test('Bun prerenders an extensionless TypeScript component through the public preload', () => {
	assert.ok(bun, 'BUN_BINARY must name the Bun executable used for this integration test');
	const result = spawnSync(bun, ['--preload', 'octane/compiler/register', 'entry.ts'], {
		cwd: fixtureDirectory,
		encoding: 'utf8',
	});

	assert.equal(result.stderr, '');
	assert.equal(result.status, 0);
	assert.equal(result.stdout, '<main>Hello, Octane!</main>');
});
