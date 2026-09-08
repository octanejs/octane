import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

const CONFIG = 'packages/transition-group/audit/test-classifications.json';
const MANIFEST = 'packages/transition-group/audit/react-parity.json';
const DISPOSITIONS = new Set([
	'unmodified-upstream-suite-wrapper',
	'adapted-upstream-suite',
	'audit-verifier-test',
	'react-octane-differential',
	'octane-only-divergence',
	'octane-only-framework-contract',
]);

function discoverUnder(root, relativeRoot, predicate) {
	const absoluteRoot = resolve(root, relativeRoot);
	if (!existsSync(absoluteRoot)) return [];
	return readdirSync(absoluteRoot, { recursive: true, withFileTypes: true })
		.filter(function keepFiles(entry) {
			return entry.isFile() && predicate(entry.name);
		})
		.map(function toPortablePath(entry) {
			return relative(root, resolve(entry.parentPath ?? entry.path, entry.name))
				.split(sep)
				.join('/');
		});
}

export function verifyReactTransitionGroupTestClassifications(root) {
	const discovered = [
		...discoverUnder(root, 'packages/transition-group/tests', function isRuntimeTest(name) {
			return /\.test\.(?:ts|tsx|tsrx)$/.test(name);
		}),
		...discoverUnder(root, 'packages/transition-group/upstream-types', function isTypeProbe(name) {
			return name.endsWith('-tests.tsx');
		}),
		...discoverUnder(root, 'packages/transition-group/typetests', function isTypeProbe(name) {
			return name.endsWith('.test-d.ts') || name.endsWith('-tests.tsx');
		}),
		...discoverUnder(root, 'scripts/react-parity', function isVerifierTest(name) {
			return name.startsWith('react-transition-group-') && name.endsWith('.test.mjs');
		}),
	].sort();
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
		throw new Error(
			'every port-authored react-transition-group test must have exactly one classification',
		);
	}
	for (const entry of config.tests) {
		if (!DISPOSITIONS.has(entry.disposition)) {
			throw new Error(`${entry.path}: unknown test disposition`);
		}
		if (entry.disposition === 'audit-verifier-test') {
			if (!entry.reason) {
				throw new Error(`${entry.path}: audit verifier tests require an explicit reason`);
			}
			if (entry.oracle) {
				throw new Error(`${entry.path}: audit verifier tests must not claim React parity`);
			}
			continue;
		}
		if (entry.disposition.startsWith('octane-only-')) {
			if (!entry.reason) {
				throw new Error(`${entry.path}: Octane-only tests require an explicit reason`);
			}
			if (entry.oracle) {
				throw new Error(`${entry.path}: Octane-only tests must not claim React parity`);
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
	}
	return { tests: discovered.length };
}
