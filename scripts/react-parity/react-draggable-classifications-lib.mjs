import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

const PACKAGE_PREFIX = 'packages/react-draggable/';
const DISPOSITIONS = new Set([
	'unmodified-upstream-suite-wrapper',
	'adapted-upstream-suite',
	'react-octane-differential',
	'octane-only-divergence',
	'octane-only-framework-contract',
	'feasibility-probe',
]);

function portablePath(root, absolutePath) {
	return relative(root, absolutePath).split(sep).join('/');
}

function discoverPackageTests(packageRoot) {
	const testsRoot = resolve(packageRoot, 'tests');
	return readdirSync(testsRoot, { recursive: true, withFileTypes: true })
		.filter(function keepTestFiles(entry) {
			return (
				entry.isFile() &&
				(/\.(?:browser\.)?test\.(?:ts|tsx|tsrx|mjs)$/.test(entry.name) ||
					/\.test\.mjs$/.test(entry.name))
			);
		})
		.map(function toPortablePath(entry) {
			return `${PACKAGE_PREFIX}${portablePath(packageRoot, resolve(entry.parentPath ?? entry.path, entry.name))}`;
		})
		.sort();
}

export function verifyReactDraggableTestClassifications(rootOrPackage, options = {}) {
	const packageRoot = options.packageRoot
		? resolve(options.packageRoot)
		: resolve(rootOrPackage, 'packages/react-draggable');
	const discovered = discoverPackageTests(packageRoot);
	const configPath = resolve(packageRoot, 'audit/test-classifications.json');
	if (!existsSync(configPath)) {
		throw new Error('missing port-test classifications: audit/test-classifications.json');
	}
	const config = JSON.parse(readFileSync(configPath, 'utf8'));
	const manifest = JSON.parse(
		readFileSync(resolve(packageRoot, 'audit/react-parity.json'), 'utf8'),
	);
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
		throw new Error(
			'every authored react-draggable test must have exactly one classification (coverage/disjointness)',
		);
	}
	const seen = new Set();
	for (const entry of config.tests) {
		if (seen.has(entry.path)) throw new Error(`${entry.path}: duplicate classification`);
		seen.add(entry.path);
		if (!DISPOSITIONS.has(entry.disposition)) {
			throw new Error(`${entry.path}: unknown test disposition`);
		}
		if (entry.disposition.startsWith('octane-only-') || entry.disposition === 'feasibility-probe') {
			if (!entry.reason) {
				throw new Error(`${entry.path}: Octane-only/feasibility tests require an explicit reason`);
			}
			if (entry.oracle) {
				throw new Error(`${entry.path}: Octane-only/feasibility tests must not claim React parity`);
			}
		} else if (!entry.oracle) {
			throw new Error(
				`${entry.path}: React-parity evidence requires a React oracle or upstream citation`,
			);
		}
		if (entry.disposition === 'octane-only-divergence') {
			if (!entry.divergenceId) {
				throw new Error(`${entry.path}: divergence tests require a manifest divergence id`);
			}
			if (!divergenceIds.has(entry.divergenceId)) {
				throw new Error(`${entry.path}: divergence id is not present in the parity manifest`);
			}
		}
		if (!entry.path.startsWith(PACKAGE_PREFIX)) {
			throw new Error(`${entry.path}: classification path must stay under ${PACKAGE_PREFIX}`);
		}
	}
	return { tests: discovered.length };
}
