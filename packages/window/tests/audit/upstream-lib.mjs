import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { extractTestCases } from '../../../../scripts/react-parity/inventory-lib.mjs';

function fail(message) {
	throw new Error(`react-window upstream verification failed: ${message}`);
}

function walk(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		return entry.isDirectory() ? walk(path) : [path];
	});
}

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}

function sorted(values) {
	return [...values].sort();
}

function sameValues(actual, expected, label) {
	const actualJson = JSON.stringify(sorted(actual));
	const expectedJson = JSON.stringify(sorted(expected));
	if (actualJson !== expectedJson)
		fail(`${label} differ: expected ${expectedJson}, received ${actualJson}`);
}

function parseChecksums(source) {
	return new Map(
		source
			.trim()
			.split('\n')
			.map((line) => {
				const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
				if (!match) fail(`invalid SHA256SUMS entry: ${line}`);
				return [match[2], match[1]];
			}),
	);
}

function parseExports(source) {
	const runtime = [];
	const types = [];
	for (const match of source.matchAll(/export\s+\{([\s\S]*?)\}\s+from/g)) {
		for (const raw of match[1].split(',')) {
			const value = raw.trim();
			if (!value) continue;
			const isType = value.startsWith('type ');
			const name =
				value.replace(/^type\s+/, '').split(/\s+as\s+/)[1] ?? value.replace(/^type\s+/, '');
			(isType ? types : runtime).push(name.trim());
		}
	}
	return { runtime, types };
}

export function verifyUpstream(packageRoot) {
	const root = resolve(packageRoot);
	const upstream = join(root, 'upstream');
	const contract = JSON.parse(readFileSync(join(root, 'audit/upstream-contract.json'), 'utf8'));
	const checksums = parseChecksums(readFileSync(join(upstream, 'SHA256SUMS'), 'utf8'));
	const files = walk(upstream)
		.map((path) => relative(upstream, path))
		.filter((path) => path !== 'SHA256SUMS');

	sameValues(files, checksums.keys(), 'vendored file inventories');
	for (const [path, expected] of checksums) {
		const actual = sha256(readFileSync(join(upstream, path)));
		if (actual !== expected)
			fail(`${path} checksum differs: expected ${expected}, received ${actual}`);
	}

	const metadata = JSON.parse(readFileSync(join(upstream, 'package.json'), 'utf8'));
	for (const field of ['name', 'version', 'license']) {
		const expected = field === 'name' ? contract.package : contract[field];
		if (metadata[field] !== expected)
			fail(`package ${field} differs: expected ${expected}, received ${metadata[field]}`);
	}

	const indexPath = join(upstream, 'lib/index.ts');
	const exports = parseExports(readFileSync(indexPath, 'utf8'));
	sameValues(exports.runtime, contract.runtimeExports, 'runtime exports');
	sameValues(exports.types, contract.typeExports, 'type exports');

	const testInventory = walk(join(upstream, 'lib'))
		.filter((path) => /\.test\.[tj]sx?$/.test(path))
		.sort()
		.map((path) => {
			const file = relative(upstream, path);
			return {
				file,
				cases: extractTestCases(readFileSync(path, 'utf8'), { file }).map(
					(testCase) => testCase.caseId,
				),
			};
		});
	const testCases = testInventory.reduce((total, entry) => total + entry.cases.length, 0);
	if (testInventory.length !== contract.testFiles)
		fail(`expected ${contract.testFiles} test files, received ${testInventory.length}`);
	if (testCases !== contract.testCases)
		fail(`expected ${contract.testCases} test cases, received ${testCases}`);
	const inventoryHash = sha256(JSON.stringify(testInventory));
	if (inventoryHash !== contract.testInventorySha256)
		fail(
			`test inventory checksum differs: expected ${contract.testInventorySha256}, received ${inventoryHash}`,
		);

	return {
		files: files.length,
		testFiles: testInventory.length,
		testCases,
		runtimeExports: exports.runtime.length,
		typeExports: exports.types.length,
	};
}
