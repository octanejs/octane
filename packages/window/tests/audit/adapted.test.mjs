import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { extractTestCases } from '../../../../scripts/react-parity/inventory-lib.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = resolve(packageRoot, '../..');
const upstreamLib = join(packageRoot, 'upstream/lib');
const adaptedRoot = join(packageRoot, 'tests/upstream');
const ledger = JSON.parse(
	readFileSync(join(packageRoot, 'audit/adapted-transformations.json'), 'utf8'),
);

// The adapted suite is regenerated from the lock's mechanical rewrites plus
// the committed divergence patches; materialize it here when absent so this
// audit works on a clean checkout.
if (!existsSync(adaptedRoot)) {
	execFileSync(
		process.execPath,
		[join(repoRoot, 'scripts/react-port/materialize.mjs'), 'run', '--package-dir', packageRoot],
		{ cwd: repoRoot, stdio: 'pipe' },
	);
}

function walk(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		return entry.isDirectory() ? walk(path) : [path];
	});
}

function inventory(root) {
	return walk(root)
		.filter((path) => /\.test\.[tj]sx?$/.test(path))
		.sort()
		.flatMap((path) =>
			extractTestCases(readFileSync(path, 'utf8'), { file: relative(root, path) }).flatMap(
				(testCase) =>
					Array.from(
						{ length: testCase.estimatedRegistrations ?? 1 },
						(_, occurrence) =>
							`${relative(root, path)}\0${testCase.kind}\0${testCase.declaredTitle}\0${occurrence}`,
					),
			),
		);
}

test('the regenerated adapted suite mirrors the pinned upstream case inventory', () => {
	const sourceFiles = walk(upstreamLib)
		.filter((path) => /\.test\.[tj]sx?$/.test(path))
		.sort();
	const generatedFiles = walk(adaptedRoot)
		.filter((path) => /\.test\.[tj]sx?$/.test(path))
		.sort();
	assert.deepEqual(
		generatedFiles.map((path) => relative(adaptedRoot, path)),
		sourceFiles.map((path) => relative(upstreamLib, path)),
		'adapted test file inventory differs',
	);
	const sourceInventory = inventory(upstreamLib);
	const generatedInventory = inventory(adaptedRoot);
	assert.deepEqual(generatedInventory, sourceInventory, 'adapted test case identities differ');
	assert.equal(sourceInventory.length, ledger.caseInventory.registrations);
	assert.equal(
		createHash('sha256').update(sourceInventory.join('\n')).digest('hex'),
		ledger.caseInventory.sha256,
		'adapted test inventory checksum differs',
	);
	assert.deepEqual(
		ledger.transformations.map(({ id }) => id),
		[
			'testing-library-adapter',
			'octane-runtime-import',
			'production-source-rebase',
			'octane-jsx-runtime',
			'create-ref-test-adapter',
			'component-call-abi',
			'keyed-effect-order',
		],
		'transformation ledger differs',
	);
});

test('the committed divergence patches carry every non-mechanical adaptation', () => {
	const patchRoot = join(packageRoot, 'audit/upstream-patches/tests/upstream');
	const patches = walk(patchRoot)
		.map((path) => relative(patchRoot, path))
		.sort();
	assert.deepEqual(patches, [
		'components/grid/Grid.test.tsx.patch',
		'components/list/List.test.tsx.patch',
	]);
	for (const patch of patches) {
		assert.match(
			readFileSync(join(patchRoot, patch), 'utf8'),
			/OCTANE DIVERGENCE/,
			`${patch} must carry only rationale-marked divergences`,
		);
	}
});
