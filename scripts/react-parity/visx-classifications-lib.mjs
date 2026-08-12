import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

const CONFIG = 'packages/visx/audit/test-classifications.json';
const MANIFEST = 'packages/visx/audit/react-parity.json';
const DISPOSITIONS = new Set([
	'unmodified-upstream-suite-wrapper',
	'react-octane-differential',
	'octane-only-divergence',
	'octane-only-framework-contract',
	'pristine-types',
	'adapted-types',
]);

function portable(root, entry) {
	return relative(root, resolve(entry.parentPath ?? entry.path, entry.name))
		.split(sep)
		.join('/');
}

function discoverVisxTests(root) {
	const testsRoot = resolve(root, 'packages/visx/tests');
	const typetestsRoot = resolve(root, 'packages/visx/typetests');
	const underTests = readdirSync(testsRoot, { recursive: true, withFileTypes: true })
		.filter(function keepTestAndTypeFiles(entry) {
			return entry.isFile() && /\.(?:test\.(?:ts|tsx|tsrx)|test-d\.ts)$/.test(entry.name);
		})
		.map(function toPortablePath(entry) {
			return portable(root, entry);
		})
		.filter(function excludeUpstreamCopy(path) {
			return !path.includes('/tests/upstream/');
		});
	const typetests = readdirSync(typetestsRoot, { recursive: true, withFileTypes: true })
		.filter(function keepTypeProbes(entry) {
			return entry.isFile() && /\.test-d\.ts$/.test(entry.name);
		})
		.map(function toPortablePath(entry) {
			return portable(root, entry);
		});
	return [...underTests, ...typetests].sort();
}

export function verifyVisxTestClassifications(root) {
	const discovered = discoverVisxTests(root);
	const configPath = resolve(root, CONFIG);
	if (!existsSync(configPath)) throw new Error(`missing port-test classifications: ${CONFIG}`);
	const config = JSON.parse(readFileSync(configPath, 'utf8'));
	const manifest = JSON.parse(readFileSync(resolve(root, MANIFEST), 'utf8'));
	const divergenceIds = new Set(
		(manifest.divergences ?? []).map(function idOf(entry) {
			return entry.id;
		}),
	);
	const declared = config.tests
		.map(function pathOf(entry) {
			return entry.path;
		})
		.sort();
	if (JSON.stringify(discovered) !== JSON.stringify(declared)) {
		throw new Error('every port-authored visx test must have exactly one classification');
	}
	for (const entry of config.tests) {
		if (!DISPOSITIONS.has(entry.disposition))
			throw new Error(`${entry.path}: unknown test disposition`);
		if (entry.disposition === 'pristine-types' || entry.disposition === 'adapted-types') {
			if (!entry.oracle)
				throw new Error(
					`${entry.path}: React-parity type evidence requires a React oracle or upstream citation`,
				);
			continue;
		}
		if (entry.disposition.startsWith('octane-only-')) {
			if (!entry.reason)
				throw new Error(`${entry.path}: Octane-only tests require an explicit reason`);
			if (entry.oracle)
				throw new Error(`${entry.path}: Octane-only tests must not claim React parity`);
		} else if (!entry.oracle) {
			throw new Error(
				`${entry.path}: React-parity evidence requires a React oracle or upstream citation`,
			);
		}
		if (entry.disposition === 'octane-only-divergence') {
			const classifiedDivergences = entry.divergenceIds ?? [entry.divergenceId].filter(Boolean);
			if (!classifiedDivergences.length)
				throw new Error(`${entry.path}: divergence tests require a manifest divergence id`);
			for (const divergenceId of classifiedDivergences) {
				if (!divergenceIds.has(divergenceId))
					throw new Error(`${entry.path}: divergence id is not present in the parity manifest`);
			}
		}
	}
	return { tests: discovered.length };
}
