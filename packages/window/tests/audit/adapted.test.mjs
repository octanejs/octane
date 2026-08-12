import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { extractTestCases } from '../../../../scripts/react-parity/inventory-lib.mjs';
import { formatAdapted, transform } from '../generate-adapted-tests.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const upstreamLib = join(packageRoot, 'upstream/lib');
const adaptedRoot = join(packageRoot, 'tests/upstream');
const ledger = JSON.parse(
	readFileSync(join(packageRoot, 'audit/adapted-transformations.json'), 'utf8'),
);

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

async function verify(root = packageRoot) {
	const sourceRoot = join(root, 'upstream/lib');
	const generatedRoot = join(root, 'tests/upstream');
	const sourceFiles = walk(sourceRoot)
		.filter((path) => /\.test\.[tj]sx?$/.test(path))
		.sort();
	const generatedFiles = walk(generatedRoot)
		.filter((path) => /\.test\.[tj]sx?$/.test(path))
		.sort();
	assert.deepEqual(
		generatedFiles.map((path) => relative(generatedRoot, path)),
		sourceFiles.map((path) => relative(sourceRoot, path)),
		'adapted test file inventory differs',
	);
	for (const sourceFile of sourceFiles) {
		const destination = join(generatedRoot, relative(sourceRoot, sourceFile));
		assert.equal(
			readFileSync(destination, 'utf8'),
			await formatAdapted(
				transform(readFileSync(sourceFile, 'utf8'), sourceFile, destination, {
					packageRoot: root,
					upstreamRoot: join(root, 'upstream'),
					upstreamLib: sourceRoot,
				}),
				destination,
			),
			`${relative(sourceRoot, sourceFile)} contains an unapproved or stale transformation`,
		);
	}
	const sourceInventory = inventory(sourceRoot);
	const generatedInventory = inventory(generatedRoot);
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
}

function fixture() {
	const directory = mkdtempSync(join(tmpdir(), 'octane-react-window-adapted-'));
	cpSync(packageRoot, directory, { recursive: true });
	return directory;
}

test('accepts the generated adapted suite and exact 117-case identity inventory', () => verify());

test('rejects a missing or renamed adapted case', async () => {
	const root = fixture();
	try {
		const path = join(root, 'tests/upstream/core/getEstimatedSize.test.ts');
		writeFileSync(path, readFileSync(path, 'utf8').replace('should return 0', 'silently renamed'));
		await assert.rejects(verify(root), /unapproved or stale transformation|identities differ/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('rejects an unapproved adapted transformation', async () => {
	const root = fixture();
	try {
		const path = join(root, 'tests/upstream/core/getEstimatedSize.test.ts');
		writeFileSync(path, `${readFileSync(path, 'utf8')}\n// unapproved`);
		await assert.rejects(verify(root), /unapproved or stale transformation/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
