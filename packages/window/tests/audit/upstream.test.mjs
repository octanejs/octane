import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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

function rewriteChecksum(root, relativePath) {
	const sumsPath = join(root, 'upstream/SHA256SUMS');
	const hash = createHash('sha256')
		.update(readFileSync(join(root, 'upstream', relativePath)))
		.digest('hex');
	const lines = readFileSync(sumsPath, 'utf8').split('\n');
	const index = lines.findIndex((line) => line.endsWith(`  ${relativePath}`));
	assert.notEqual(index, -1);
	lines[index] = `${hash}  ${relativePath}`;
	writeFileSync(sumsPath, lines.join('\n'));
}

test('accepts the pristine pinned tree', () => {
	assert.deepEqual(verifyUpstream(packageRoot), {
		files: 58,
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
		assert.throws(() => verifyUpstream(root), /lib\/types\.ts checksum differs/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('rejects missing vendored evidence', () => {
	const root = fixture();
	try {
		rmSync(join(root, 'upstream/lib/core/getEstimatedSize.test.ts'));
		assert.throws(() => verifyUpstream(root), /vendored file inventories differ/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('rejects renamed test identities even if the changed byte is re-locked', () => {
	const root = fixture();
	try {
		const relativePath = 'lib/core/getEstimatedSize.test.ts';
		const path = join(root, 'upstream', relativePath);
		writeFileSync(
			path,
			readFileSync(path, 'utf8').replace(
				'should return 0 if no measurements can be taken',
				'silently renamed case',
			),
		);
		rewriteChecksum(root, relativePath);
		assert.throws(() => verifyUpstream(root), /test inventory checksum differs/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('rejects public export drift even if the changed byte is re-locked', () => {
	const root = fixture();
	try {
		const relativePath = 'lib/index.ts';
		const path = join(root, 'upstream', relativePath);
		writeFileSync(path, readFileSync(path, 'utf8').replace('Grid', 'GridRenamed'));
		rewriteChecksum(root, relativePath);
		assert.throws(() => verifyUpstream(root), /runtime exports differ/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
