import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { findTestMarkerViolations } from './check-test-markers.mjs';

test('only ignores byte-pinned vendored upstream tests', () => {
	const repo = mkdtempSync(path.join(tmpdir(), 'test-markers-'));
	const source = 'test.skip("vendored", () => {});\n';
	const upstream = path.join(repo, 'packages/example/upstream/source/example.spec.ts');
	const local = path.join(repo, 'packages/example/tests/example.spec.ts');
	mkdirSync(path.dirname(upstream), { recursive: true });
	mkdirSync(path.dirname(local), { recursive: true });
	writeFileSync(upstream, source);
	writeFileSync(local, source);

	assert.deepEqual(
		findTestMarkerViolations(repo, ['packages']).map(({ file }) => file),
		['packages/example/tests/example.spec.ts', 'packages/example/upstream/source/example.spec.ts'],
	);

	const digest = createHash('sha256').update(source).digest('hex');
	writeFileSync(
		path.join(repo, 'packages/example/upstream/SHA256SUMS'),
		`${digest}  upstream/source/example.spec.ts\n`,
	);
	assert.deepEqual(
		findTestMarkerViolations(repo, ['packages']).map(({ file }) => file),
		['packages/example/tests/example.spec.ts'],
	);
});

test('ignores generated Git-ignored tests but checks force-added tests', () => {
	const repo = mkdtempSync(path.join(tmpdir(), 'test-markers-git-'));
	const generated = path.join(repo, 'packages/example/tests/upstream/generated.test.ts');
	const local = path.join(repo, 'packages/example/tests/local.test.ts');
	mkdirSync(path.dirname(generated), { recursive: true });
	writeFileSync(path.join(repo, '.gitignore'), 'packages/example/tests/upstream/\n');
	writeFileSync(generated, 'test.skip("generated", () => {});\n');
	writeFileSync(local, 'test.skip("local", () => {});\n');
	execFileSync('git', ['init'], { cwd: repo, stdio: 'ignore' });
	execFileSync('git', ['add', '.gitignore', 'packages/example/tests/local.test.ts'], {
		cwd: repo,
	});

	assert.deepEqual(
		findTestMarkerViolations(repo, ['packages']).map(({ file }) => file),
		['packages/example/tests/local.test.ts'],
	);

	execFileSync('git', ['add', '--force', 'packages/example/tests/upstream/generated.test.ts'], {
		cwd: repo,
	});
	assert.deepEqual(
		findTestMarkerViolations(repo, ['packages']).map(({ file }) => file),
		['packages/example/tests/local.test.ts', 'packages/example/tests/upstream/generated.test.ts'],
	);
});
