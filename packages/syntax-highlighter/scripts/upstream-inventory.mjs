import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toPortablePath } from '../../../scripts/react-parity/harness-lib.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const upstreamRoot = resolve(packageRoot, 'upstream');
const inventoryPath = resolve(packageRoot, 'audit/upstream-files.json');
const expected = {
	package: 'react-syntax-highlighter',
	version: '16.1.1',
	sourceCommit: 'ecac533ba1fce8cf4f98a79c5c913f1a7ffab34c',
	npmSha1: '928459855d375f5cfc8e646071e20d541cebcb52',
	npmIntegrity:
		'sha512-PjVawBGy80C6YbC5DDZJeUjBmC7skaoEUdvfFQediQHgCL7aKyVHe57SaJGfQsloGDac+gCpTfRdtxzWWKmCXA==',
};

async function walk(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = [];
	for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) files.push(...(await walk(path)));
		else if (entry.isFile()) files.push(path);
	}
	return files;
}

function digest(algorithm, value) {
	return createHash(algorithm).update(value).digest('hex');
}

async function buildInventory() {
	const files = [];
	for (const path of await walk(upstreamRoot)) {
		const bytes = await readFile(path);
		files.push({
			path: toPortablePath(relative(upstreamRoot, path)),
			bytes: bytes.byteLength,
			sha256: digest('sha256', bytes),
		});
	}
	const packageJson = JSON.parse(await readFile(resolve(upstreamRoot, 'package.json'), 'utf8'));
	if (packageJson.name !== expected.package || packageJson.version !== expected.version) {
		throw new Error(
			`unexpected upstream package identity: ${packageJson.name}@${packageJson.version}`,
		);
	}
	const license = await readFile(resolve(upstreamRoot, 'LICENSE'));
	const localLicense = await readFile(resolve(packageRoot, 'LICENSE'));
	if (!license.equals(localLicense))
		throw new Error('package LICENSE does not match pinned upstream');
	const tarball = await readFile(resolve(upstreamRoot, 'npm/react-syntax-highlighter-16.1.1.tgz'));
	if (digest('sha1', tarball) !== expected.npmSha1) throw new Error('npm tarball SHA-1 mismatch');
	const integrity = `sha512-${createHash('sha512').update(tarball).digest('base64')}`;
	if (integrity !== expected.npmIntegrity) throw new Error('npm tarball integrity mismatch');
	return {
		schemaVersion: 1,
		...expected,
		licenseSha256: digest('sha256', license),
		fileCount: files.length,
		files,
	};
}

const mode = process.argv[2];
const actual = await buildInventory();
const serialized = `${JSON.stringify(actual, null, 2)}\n`;
if (mode === '--write') {
	await writeFile(inventoryPath, serialized);
	console.log(`wrote ${actual.fileCount} pinned upstream artifacts`);
} else if (mode === '--check') {
	const retained = await readFile(inventoryPath, 'utf8');
	if (retained !== serialized)
		throw new Error('upstream inventory is stale; run generate:upstream-inventory');
	console.log(
		`verified ${expected.package}@${expected.version}: ${actual.fileCount} pinned artifacts`,
	);
} else {
	throw new Error('usage: node scripts/upstream-inventory.mjs --write|--check');
}
