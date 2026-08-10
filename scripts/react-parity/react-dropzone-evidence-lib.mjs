import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const load = (root, path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const posix = (value) => value.split(sep).join('/');

const PORT_AUTHORED_DISPOSITIONS = new Set([
	'adapted-octane-contract',
	'react-octane-differential',
	'unmodified-upstream-suite-wrapper',
	'octane-only-framework-contract',
	'octane-only-package-contract',
	'octane-only-adoption',
	'type-evidence-pristine-copy',
	'type-evidence-adapted',
]);

const RUNTIME_TEST_PATTERN = /\.(?:test|spec)\.(?:ts|tsx|mjs)$/;
const TYPE_PROGRAM_PATTERN = /\.tsx$/;

/**
 * Discover every port-authored test root under the binding: Vitest specs,
 * node:test adoption/packed probes, and both type-program trees.
 */
export function discoverReactDropzoneAuthoredTests(root) {
	const prefix = 'packages/react-dropzone';
	const discovered = [];

	const walk = (relativeRoot, predicate) => {
		const absolute = resolve(root, relativeRoot);
		if (!existsSync(absolute)) return;
		for (const entry of readdirSync(absolute, { recursive: true, withFileTypes: true })) {
			if (!entry.isFile()) continue;
			const absolutePath = resolve(entry.parentPath ?? entry.path, entry.name);
			const portable = posix(relative(root, absolutePath));
			if (!predicate(portable, entry.name)) continue;
			discovered.push(portable);
		}
	};

	walk(`${prefix}/tests`, (_portable, name) => RUNTIME_TEST_PATTERN.test(name));
	walk(`${prefix}/typetests`, (_portable, name) => TYPE_PROGRAM_PATTERN.test(name));

	return [...new Set(discovered)].sort();
}

export function classifyReactDropzoneAuthoredPath(path) {
	if (path.startsWith('packages/react-dropzone/tests/adapted/'))
		return { path, disposition: 'adapted-octane-contract' };
	if (path.startsWith('packages/react-dropzone/tests/differential/'))
		return { path, disposition: 'react-octane-differential' };
	if (path === 'packages/react-dropzone/tests/pristine/upstream-runtime.test.ts')
		return { path, disposition: 'unmodified-upstream-suite-wrapper' };
	if (path.startsWith('packages/react-dropzone/tests/probes/'))
		return { path, disposition: 'octane-only-framework-contract' };
	if (path.startsWith('packages/react-dropzone/tests/adoption/'))
		return { path, disposition: 'octane-only-adoption' };
	if (path.startsWith('packages/react-dropzone/typetests/pristine/'))
		return { path, disposition: 'type-evidence-pristine-copy' };
	if (path.startsWith('packages/react-dropzone/typetests/'))
		return { path, disposition: 'type-evidence-adapted' };
	return { path, disposition: 'octane-only-package-contract' };
}

export function buildReactDropzonePortAuthored(root) {
	return discoverReactDropzoneAuthoredTests(root).map(classifyReactDropzoneAuthoredPath);
}

export function verifyReactDropzoneEvidence(root) {
	const prefix = 'packages/react-dropzone';
	const pristine = load(root, `${prefix}/audit/runtime-inventories/pristine-runtime.json`);
	const classifications = load(root, `${prefix}/audit/test-classifications.json`);
	if (pristine.collected !== 218 || pristine.executed !== 218 || pristine.skipped !== 0)
		throw new Error('pristine runtime must record 218 passed identities without skips');
	if (classifications.upstreamCases.length !== pristine.cases.length)
		throw new Error('every upstream runtime identity must be classified exactly once');
	const upstreamKeys = classifications.upstreamCases.map(
		({ file, fullName, occurrence }) => `${file}\0${fullName}\0${occurrence}`,
	);
	if (new Set(upstreamKeys).size !== upstreamKeys.length)
		throw new Error('upstream runtime classifications contain duplicate identities');
	const counts = new Map();
	const expectedKeys = new Set(
		pristine.cases.map(({ file, fullName }) => {
			const identity = `${file}\0${fullName}`;
			const occurrence = (counts.get(identity) ?? 0) + 1;
			counts.set(identity, occurrence);
			return `${identity}\0${occurrence}`;
		}),
	);
	if (upstreamKeys.some((key) => !expectedKeys.has(key)))
		throw new Error('upstream runtime classifications contain a stale or fake identity');
	if (
		classifications.upstreamCases.some(
			(entry) => entry.disposition === 'pristine-oracle-plus-contract' && !entry.rationale,
		)
	)
		throw new Error('non-title-matched upstream cases require a rationale');

	const discovered = discoverReactDropzoneAuthoredTests(root);
	const classifiedAuthored = (classifications.portAuthored ?? []).map(({ path }) => path).sort();
	if (JSON.stringify(discovered) !== JSON.stringify(classifiedAuthored))
		throw new Error(
			'every port-authored runtime/type test must be classified exactly once (discovered all test roots)',
		);
	for (const entry of classifications.portAuthored ?? []) {
		if (!PORT_AUTHORED_DISPOSITIONS.has(entry.disposition))
			throw new Error(`${entry.path}: unknown port-authored disposition ${entry.disposition}`);
	}

	const types = load(root, `${prefix}/audit/type-inventories/parity.json`);
	if (types.pristine.length !== 9 || types.adapted.length !== 9)
		throw new Error('type inventory must contain all nine pristine/adapted programs');
	for (const entry of [...types.pristine, ...types.adapted]) {
		const path = resolve(root, entry.path);
		if (!existsSync(path) || hash(path) !== entry.sha256)
			throw new Error(`type evidence drifted: ${entry.path}`);
	}

	const ledger = load(root, `${prefix}/audit/transformation-ledger.json`);
	if (ledger.pairs.length !== 2 || ledger.permitted.length === 0)
		throw new Error('transformation ledger must cover both upstream source modules');
	for (const pair of ledger.pairs) {
		if (
			hash(resolve(root, pair.upstream)) !== pair.upstreamSha256 ||
			hash(resolve(root, pair.adapted)) !== pair.adaptedSha256
		)
			throw new Error(`source transformation evidence drifted: ${pair.adapted}`);
	}
	return true;
}
