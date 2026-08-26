import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
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

function verifyHashes() {
	// The committed upstream/ git bytes verify offline against
	// audit/upstream.lock.json (upstream git blob shas at the pinned commit).
	execFileSync(
		process.execPath,
		[
			join(packageRoot, '../../scripts/react-port/materialize.mjs'),
			'run',
			'--check',
			'--package-dir',
			packageRoot,
		],
		{ cwd: join(packageRoot, '../..'), stdio: 'pipe' },
	);
	// The unpacked registry artifact stays hash-pinned here.
	const expectedArtifacts = new Map([
		[
			'upstream-artifact/README.md',
			'44adbdf7084e81ff10ac88ff526260c1ee6bbcaa112bb87f3ab2eea8ab9e9cac',
		],
		[
			'upstream-artifact/package.json',
			'f300f78728425f50970a82eea4ebe74bb845c0d8677778c0604fb7f77c7b2a02',
		],
		[
			'upstream-artifact/dist/index.d.mts',
			'0314c9d647a901249a28b151b9b03bd7be4bfbbb72d861d564f4099cc8e37750',
		],
	]);
	const actualPaths = walk(join(packageRoot, 'upstream-artifact')).map((path) =>
		relative(packageRoot, path),
	);
	if (actualPaths.length !== expectedArtifacts.size) fail('Artifact file added or removed');
	for (const path of actualPaths) {
		const wanted = expectedArtifacts.get(path);
		if (!wanted) fail(`Unexpected artifact file: ${path}`);
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

function verifyApi(
	api = JSON.parse(readFileSync(join(packageRoot, 'audit/public-api.json'), 'utf8')),
) {
	if (!sameMembers(api.runtime, expectedRuntime)) fail('Runtime export inventory drift');
	if (!sameMembers(api.types, expectedTypes)) fail('Public type inventory drift');

	const sourceRoot = join(packageRoot, 'upstream/packages/input-otp/src');
	const source = walk(sourceRoot)
		.map((path) => readFileSync(path, 'utf8'))
		.join('\n');
	for (const name of [...expectedRuntime, ...expectedTypes]) {
		if (!new RegExp(`\\b${name}\\b`).test(source)) fail(`Canonical source lacks ${name}`);
	}

	// The vendored artifact evidence is the published .mts declaration; the
	// runtime bundles were never vendored, so the export surface is checked
	// against the declaration plus the canonical source above.
	const declaration = readFileSync(join(packageRoot, 'upstream-artifact/dist/index.d.mts'), 'utf8');
	const exports = declarationExports(declaration);
	if (!sameMembers(exports.runtime, expectedRuntime)) {
		fail('Published runtime export drift: dist/index.d.mts');
	}
	if (!sameMembers(exports.types, expectedTypes)) {
		fail('Published type export drift: dist/index.d.mts');
	}

	const sourcePackage = JSON.parse(
		readFileSync(join(packageRoot, 'upstream/packages/input-otp/package.json'), 'utf8'),
	);
	const npmPackage = JSON.parse(
		readFileSync(join(packageRoot, 'upstream-artifact/package.json'), 'utf8'),
	);
	for (const metadata of [sourcePackage, npmPackage]) {
		if (metadata.name !== 'input-otp' || metadata.version !== '1.5.0') {
			fail('Pinned package name/version drift');
		}
		if (metadata.license !== 'MIT') fail('Pinned package license drift');
	}
	if (!readFileSync(join(packageRoot, 'upstream/LICENSE'), 'utf8').includes('MIT License')) {
		fail('Canonical MIT license evidence drift');
	}
}

function extractTests() {
	const root = join(packageRoot, 'upstream/apps/playground/src/tests');
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
	if (inventory.artifactCount !== 9 || inventory.artifactCount !== actual.length) {
		fail('Upstream test artifact count drift');
	}
	const caseCount = actual.reduce((count, artifact) => count + artifact.caseCount, 0);
	if (inventory.caseCount !== 19 || inventory.caseCount !== caseCount) {
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
	// Byte drift in the pinned tree must fail the lock layer.
	const probePath = join(packageRoot, 'upstream/packages/input-otp/src/index.ts');
	const probeOriginal = readFileSync(probePath);
	try {
		writeFileSync(probePath, Buffer.concat([probeOriginal, Buffer.from('\n// drift\n')]));
		expectFailure('modified vendored file', () => verifyHashes());
	} finally {
		writeFileSync(probePath, probeOriginal);
	}
	try {
		rmSync(probePath);
		expectFailure('deleted vendored file', () => verifyHashes());
	} finally {
		writeFileSync(probePath, probeOriginal);
	}

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
	`Verified the lock-pinned upstream tree, ${expectedRuntime.length} runtime exports, ${expectedTypes.length} public types, 9 upstream artifacts, and 19 upstream cases.`,
);
