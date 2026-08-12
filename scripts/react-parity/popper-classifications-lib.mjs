import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

const CONFIG = 'packages/popper/audit/test-classifications.json';
const MANIFEST = 'packages/popper/audit/react-parity.json';
const PAIRED_TYPE_PROGRAMS = new Set(['main-test.tsx', 'svg-test.tsx']);
const DISPOSITIONS = new Set([
	'unmodified-upstream-suite-wrapper',
	'adapted-upstream-suite',
	'react-octane-differential',
	'octane-only-divergence',
	'octane-only-framework-contract',
	'control',
	'adapted-type',
]);

function posix(value) {
	return value.split(sep).join('/');
}

function isDiscoveredTest(entry, relativeRoot) {
	if (!entry.isFile()) return false;
	if (/\.test\.(?:ts|tsx|tsrx|mjs)$/.test(entry.name)) return true;
	if (relativeRoot === 'typetests' && PAIRED_TYPE_PROGRAMS.has(entry.name)) return true;
	return false;
}

function discoverTests(root) {
	const packagesRoot = resolve(root, 'packages/popper');
	const discovered = [];
	for (const relativeRoot of ['tests', 'typetests']) {
		const absoluteRoot = resolve(packagesRoot, relativeRoot);
		if (!existsSync(absoluteRoot)) continue;
		for (const entry of readdirSync(absoluteRoot, { recursive: true, withFileTypes: true })) {
			if (!isDiscoveredTest(entry, relativeRoot)) continue;
			discovered.push(posix(relative(root, resolve(entry.parentPath ?? entry.path, entry.name))));
		}
	}
	return discovered.sort();
}

export function verifyPopperTestClassifications(root) {
	const discovered = discoverTests(root);
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
		throw new Error('every port-authored popper test must have exactly one classification');
	}
	for (const entry of config.tests) {
		if (!DISPOSITIONS.has(entry.disposition))
			throw new Error(`${entry.path}: unknown test disposition`);
		if (entry.disposition === 'control' || entry.disposition === 'adapted-type') {
			if (!entry.oracle && !entry.reason) {
				throw new Error(
					`${entry.path}: control/adapted-type dispositions require an oracle or reason`,
				);
			}
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
			if (!entry.divergenceId)
				throw new Error(`${entry.path}: divergence tests require a manifest divergence id`);
			if (!divergenceIds.has(entry.divergenceId))
				throw new Error(`${entry.path}: divergence id is not present in the parity manifest`);
		}
	}
	return { tests: discovered.length };
}
