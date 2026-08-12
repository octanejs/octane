import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const expectedRuntime = [
	'OTPInput',
	'OTPInputContext',
	'REGEXP_ONLY_DIGITS',
	'REGEXP_ONLY_CHARS',
	'REGEXP_ONLY_DIGITS_AND_CHARS',
].sort();
const expectedTypes = ['OTPInputProps', 'SlotProps', 'RenderProps'].sort();
const expectedPortClassifications = [
	'browser-conformance',
	'differential',
	'dom-conformance',
	'hydration',
	'public-type',
	'ssr',
].sort();

function fail(message) {
	throw new Error(message);
}

function walk(root) {
	return readdirSync(root, { recursive: true })
		.map((path) => join(root, path))
		.filter((path) => statSync(path).isFile())
		.sort();
}

function sameMembers(actual, expected) {
	return JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
}

function verifyHashes(
	lines = readFileSync(join(packageRoot, 'upstream/SHA256SUMS'), 'utf8').trim().split('\n'),
) {
	const expected = new Map(
		lines.map((line) => {
			const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
			if (!match) fail(`Malformed checksum line: ${line}`);
			return [match[2], match[1]];
		}),
	);
	const actualPaths = [
		...walk(join(packageRoot, 'upstream/source')),
		...walk(join(packageRoot, 'upstream/npm')),
	].map((path) => relative(packageRoot, path));

	if (actualPaths.length !== expected.size) fail('Vendored file added or removed');
	for (const path of actualPaths) {
		const wanted = expected.get(path);
		if (!wanted) fail(`Unexpected vendored file: ${path}`);
		const actual = createHash('sha256')
			.update(readFileSync(join(packageRoot, path)))
			.digest('hex');
		if (actual !== wanted) fail(`Checksum mismatch: ${path}`);
	}
}

function declarationExports(source) {
	const match = /export \{([^}]+)\};?\s*$/.exec(source);
	if (!match) fail('Published declaration lacks a final named export list');
	const runtime = [];
	const types = [];
	for (const entry of match[1].split(',').map((value) => value.trim())) {
		if (entry.startsWith('type ')) types.push(entry.slice(5).trim());
		else runtime.push(entry);
	}
	return { runtime, types };
}

function publishedRuntimeExports(source, format) {
	const match =
		format === 'esm'
			? /export\{([^}]+)\}/.exec(source)
			: /module\.exports=\{([^}]+)\}/.exec(source);
	if (!match) fail(`Published ${format} bundle lacks a named export list`);
	return match[1].split(',').map((entry) => {
		const parts = entry.trim().split(/\s+as\s+/);
		return parts.at(-1);
	});
}

function verifyApi(
	api = JSON.parse(readFileSync(join(packageRoot, 'audit/public-api.json'), 'utf8')),
) {
	if (!sameMembers(api.runtime, expectedRuntime)) fail('Runtime export inventory drift');
	if (!sameMembers(api.types, expectedTypes)) fail('Public type inventory drift');

	const sourceRoot = join(packageRoot, 'upstream/source/packages/input-otp/src');
	const source = walk(sourceRoot)
		.map((path) => readFileSync(path, 'utf8'))
		.join('\n');
	for (const name of [...expectedRuntime, ...expectedTypes]) {
		if (!new RegExp(`\\b${name}\\b`).test(source)) fail(`Canonical source lacks ${name}`);
	}

	for (const declarationPath of ['dist/index.d.ts', 'dist/index.d.mts']) {
		const declaration = readFileSync(join(packageRoot, 'upstream/npm', declarationPath), 'utf8');
		const exports = declarationExports(declaration);
		if (!sameMembers(exports.runtime, expectedRuntime)) {
			fail(`Published runtime export drift: ${declarationPath}`);
		}
		if (!sameMembers(exports.types, expectedTypes)) {
			fail(`Published type export drift: ${declarationPath}`);
		}
	}
	for (const [bundlePath, format] of [
		['dist/index.mjs', 'esm'],
		['dist/index.js', 'cjs'],
	]) {
		const source = readFileSync(join(packageRoot, 'upstream/npm', bundlePath), 'utf8');
		if (!sameMembers(publishedRuntimeExports(source, format), expectedRuntime)) {
			fail(`Published runtime bundle export drift: ${bundlePath}`);
		}
	}

	const sourcePackage = JSON.parse(
		readFileSync(join(packageRoot, 'upstream/source/packages/input-otp/package.json'), 'utf8'),
	);
	const npmPackage = JSON.parse(
		readFileSync(join(packageRoot, 'upstream/npm/package.json'), 'utf8'),
	);
	for (const metadata of [sourcePackage, npmPackage]) {
		if (metadata.name !== 'input-otp' || metadata.version !== '1.4.2') {
			fail('Pinned package name/version drift');
		}
		if (metadata.license !== 'MIT') fail('Pinned package license drift');
	}
	if (!readFileSync(join(packageRoot, 'upstream/source/LICENSE'), 'utf8').includes('MIT License')) {
		fail('Canonical MIT license evidence drift');
	}
}

function extractTests() {
	const root = join(packageRoot, 'upstream/source/apps/test/src/tests');
	return walk(root)
		.filter((path) => path.endsWith('.spec.ts'))
		.map((path) => {
			const source = readFileSync(path, 'utf8');
			const cases = [...source.matchAll(/\btest\s*\(\s*(["'])(.*?)\1/gs)].map((match) => ({
				identity: match[2],
				adaptedActive: true,
			}));
			return { path: relative(root, path), caseCount: cases.length, cases };
		});
}

function verifyTests(
	inventory = JSON.parse(readFileSync(join(packageRoot, 'audit/test-inventory.json'), 'utf8')),
) {
	const actual = extractTests();
	const recorded = inventory.artifacts.map(({ path, caseCount, cases }) => ({
		path,
		caseCount,
		cases: cases.map(({ identity, adaptedActive }) => ({ identity, adaptedActive })),
	}));
	if (JSON.stringify(recorded) !== JSON.stringify(actual))
		fail('Upstream test identity inventory drift');
	if (inventory.artifactCount !== 8 || inventory.artifactCount !== actual.length) {
		fail('Upstream test artifact count drift');
	}
	const caseCount = actual.reduce((count, artifact) => count + artifact.caseCount, 0);
	if (inventory.caseCount !== 15 || inventory.caseCount !== caseCount) {
		fail('Upstream test case count drift');
	}
	if (!sameMembers(inventory.requiredPortAuthoredClassifications, expectedPortClassifications)) {
		fail('Port-authored test classification drift');
	}

	for (const artifact of inventory.artifacts) {
		if (artifact.disposition !== 'adapted' || !artifact.adaptedPath) {
			fail(`Unclassified upstream artifact: ${artifact.path}`);
		}
		for (const testCase of artifact.cases) {
			if (testCase.adaptedActive !== true)
				fail(`Skipped adapted case: ${artifact.path} :: ${testCase.identity}`);
		}
		const adaptedPath = join(packageRoot, artifact.adaptedPath);
		if (existsSync(adaptedPath)) {
			const adaptedSource = readFileSync(adaptedPath, 'utf8');
			if (/\b(?:test|it|describe)\.(?:skip|todo)\b/.test(adaptedSource)) {
				fail(`Skipped/todo adapted registration found: ${artifact.adaptedPath}`);
			}
			for (const { identity } of artifact.cases) {
				if (!adaptedSource.includes(identity)) {
					fail(`Adapted case identity missing: ${artifact.adaptedPath} :: ${identity}`);
				}
			}
		}
	}

	const selection = inventory.artifacts.find(({ path }) => path === 'base.selections.spec.ts');
	if (
		!selection?.upstreamConditionalSkip ||
		selection.adaptedSkipDisposition !== 'removed; all cases must execute in CI'
	) {
		fail('Upstream conditional skip disposition drift');
	}
}

function expectFailure(label, callback) {
	try {
		callback();
	} catch {
		return;
	}
	fail(`Negative control did not fail: ${label}`);
}

verifyHashes();
verifyApi();
verifyTests();

if (process.argv.includes('--negative-controls')) {
	const checksumLines = readFileSync(join(packageRoot, 'upstream/SHA256SUMS'), 'utf8')
		.trim()
		.split('\n');
	expectFailure('deleted vendored file', () => verifyHashes(checksumLines.slice(1)));
	expectFailure('modified vendored file', () =>
		verifyHashes([
			checksumLines[0].replace(/^./, checksumLines[0][0] === '0' ? '1' : '0'),
			...checksumLines.slice(1),
		]),
	);

	const api = JSON.parse(readFileSync(join(packageRoot, 'audit/public-api.json'), 'utf8'));
	expectFailure('missing runtime export', () =>
		verifyApi({ ...api, runtime: api.runtime.slice(1) }),
	);
	expectFailure('extra runtime export', () =>
		verifyApi({ ...api, runtime: [...api.runtime, 'ExtraExport'] }),
	);
	expectFailure('missing public type', () => verifyApi({ ...api, types: api.types.slice(1) }));
	expectFailure('extra public type', () =>
		verifyApi({ ...api, types: [...api.types, 'WeakenedType'] }),
	);

	const tests = JSON.parse(readFileSync(join(packageRoot, 'audit/test-inventory.json'), 'utf8'));
	expectFailure('missing test artifact', () =>
		verifyTests({ ...tests, artifacts: tests.artifacts.slice(1) }),
	);
	const renamed = structuredClone(tests);
	renamed.artifacts[0].cases[0].identity += ' renamed';
	expectFailure('renamed test case', () => verifyTests(renamed));
	const skipped = structuredClone(tests);
	skipped.artifacts[0].cases[0].adaptedActive = false;
	expectFailure('skipped adapted case', () => verifyTests(skipped));
	const unclassified = structuredClone(tests);
	delete unclassified.artifacts[0].disposition;
	expectFailure('unclassified upstream artifact', () => verifyTests(unclassified));
	const missingPortClassification = structuredClone(tests);
	missingPortClassification.requiredPortAuthoredClassifications.pop();
	expectFailure('missing port-authored classification', () =>
		verifyTests(missingPortClassification),
	);
}

console.log(
	`Verified ${readFileSync(join(packageRoot, 'upstream/SHA256SUMS'), 'utf8').trim().split('\n').length} vendored files, ${expectedRuntime.length} runtime exports, ${expectedTypes.length} public types, 8 upstream artifacts, and 15 upstream cases.`,
);
