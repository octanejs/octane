import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { verifyVaulUpstream } from './vaul-upstream-lib.mjs';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const upstreamRoot = join(repoRoot, 'packages/vaul/upstream');

function fixtureRoot() {
	const root = mkdtempSync(join(tmpdir(), 'vaul-upstream-'));
	const packageDir = join(root, 'packages/vaul');
	cpSync(upstreamRoot, join(packageDir, 'upstream'), { recursive: true });
	cpSync(
		join(repoRoot, 'packages/vaul/audit/provenance.json'),
		join(packageDir, 'audit/provenance.json'),
	);
	cpSync(
		join(repoRoot, 'packages/vaul/audit/upstream.lock.json'),
		join(packageDir, 'audit/upstream.lock.json'),
	);
	cpSync(join(repoRoot, 'packages/vaul/LICENSE.upstream'), join(packageDir, 'LICENSE.upstream'));
	return root;
}

test('accepts the committed vendored Vaul upstream tree', function acceptsCommittedTree() {
	const result = verifyVaulUpstream(repoRoot);
	assert.equal(typeof result.files, 'number');
	assert.ok(result.files > 0);
});

test('rejects vendored byte drift', function rejectsByteDrift() {
	const root = fixtureRoot();
	try {
		const target = join(root, 'packages/vaul/upstream/test/tests/base.spec.ts');
		writeFileSync(target, `${readFileSync(target, 'utf8')}\n// drift\n`);
		assert.throws(function mutate() {
			verifyVaulUpstream(root);
		}, /drifted from audit\/upstream\.lock\.json/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('rejects a missing required Playwright artifact', function rejectsMissingArtifact() {
	const root = fixtureRoot();
	try {
		rmSync(join(root, 'packages/vaul/upstream/playwright.config.ts'));
		// The lock layer catches the removal first; the requiredFiles contract
		// must also fail closed on its own.
		assert.throws(function remove() {
			verifyVaulUpstream(root);
		}, /drifted from audit\/upstream\.lock\.json/);
		assert.throws(function removeWithoutLock() {
			verifyVaulUpstream(root, { lock: false });
		}, /required evidence missing: upstream\/playwright\.config\.ts/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('rejects a missing required demo app page', function rejectsMissingAppPage() {
	const root = fixtureRoot();
	try {
		rmSync(join(root, 'packages/vaul/upstream/test/src/app/page.tsx'));
		assert.throws(function remove() {
			verifyVaulUpstream(root);
		}, /drifted from audit\/upstream\.lock\.json/);
		assert.throws(function removeWithoutLock() {
			verifyVaulUpstream(root, { lock: false });
		}, /required evidence missing: upstream\/test\/src\/app\/page\.tsx/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
