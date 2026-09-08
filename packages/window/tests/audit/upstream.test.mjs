import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { verifyUpstream } from './upstream-lib.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function fixture() {
	const directory = mkdtempSync(join(tmpdir(), 'octane-react-window-upstream-'));
	cpSync(packageRoot, directory, { recursive: true });
	return directory;
}

test('accepts the pristine pinned tree', () => {
	assert.deepEqual(verifyUpstream(packageRoot), {
		files: 57,
		testFiles: 14,
		testCases: 117,
		runtimeExports: 8,
		typeExports: 8,
	});
});

test('rejects byte drift', () => {
	const root = fixture();
	try {
		const path = join(root, 'upstream/lib/types.ts');
		writeFileSync(path, `${readFileSync(path, 'utf8')}\n`);
		assert.throws(() => verifyUpstream(root), /lock verification failed/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('rejects missing vendored evidence', () => {
	const root = fixture();
	try {
		rmSync(join(root, 'upstream/lib/core/getEstimatedSize.test.ts'));
		assert.throws(() => verifyUpstream(root), /lock verification failed/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('rejects renamed test identities independently of the lock layer', () => {
	const root = fixture();
	try {
		const path = join(root, 'upstream/lib/core/getEstimatedSize.test.ts');
		writeFileSync(
			path,
			readFileSync(path, 'utf8').replace(
				'should return 0 if no measurements can be taken',
				'silently renamed case',
			),
		);
		assert.throws(() => verifyUpstream(root, { lock: false }), /test inventory checksum differs/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('rejects public export drift independently of the lock layer', () => {
	const root = fixture();
	try {
		const path = join(root, 'upstream/lib/index.ts');
		writeFileSync(path, readFileSync(path, 'utf8').replace('Grid', 'GridRenamed'));
		assert.throws(() => verifyUpstream(root, { lock: false }), /runtime exports differ/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
