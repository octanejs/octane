import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

const CONFIG = 'packages/embla-carousel/audit/test-classifications.json';
const MANIFEST = 'packages/embla-carousel/audit/react-parity.json';
const DISPOSITIONS = new Set([
	'unmodified-upstream-suite-wrapper',
	'adapted-upstream-suite',
	'react-octane-differential',
	'repo-authored-type-oracle',
	'octane-only-divergence',
	'octane-only-framework-contract',
]);
const TYPE_LANE_TYPES = new Set(['pristine-types', 'adapted-types']);
const TYPE_ORACLE_DISPOSITION = 'repo-authored-type-oracle';

function discoverPortAuthoredTests(root) {
	const roots = [
		resolve(root, 'packages/embla-carousel/tests'),
		resolve(root, 'packages/embla-carousel/typetests'),
	];
	const discovered = [];
	for (const testsRoot of roots) {
		if (!existsSync(testsRoot)) continue;
		for (const entry of readdirSync(testsRoot, { recursive: true, withFileTypes: true })) {
			if (!entry.isFile()) continue;
			const name = entry.name;
			const isRuntimeTest = /\.test\.(?:ts|tsx|tsrx)$/.test(name);
			const isTypeProbe = /\.test-d\.ts$/.test(name);
			if (!isRuntimeTest && !isTypeProbe) continue;
			discovered.push(
				relative(root, resolve(entry.parentPath ?? entry.path, name))
					.split(sep)
					.join('/'),
			);
		}
	}
	// Embla-specific negative-control suites under scripts/react-parity — match
	// only this port's files so sibling binding suites stay out of the ledger.
	const scriptsRoot = resolve(root, 'scripts/react-parity');
	if (existsSync(scriptsRoot)) {
		for (const entry of readdirSync(scriptsRoot, { withFileTypes: true })) {
			if (!entry.isFile()) continue;
			if (!/^embla-carousel-.+\.test\.mjs$/.test(entry.name)) continue;
			discovered.push(relative(root, resolve(scriptsRoot, entry.name)).split(sep).join('/'));
		}
	}
	return discovered.sort();
}

function requiredTypeLaneTestPaths(manifest) {
	const paths = [];
	for (const lane of manifest.lanes ?? []) {
		if (!TYPE_LANE_TYPES.has(lane.type)) continue;
		if (lane.oracle !== 'required') continue;
		for (const file of lane.files ?? []) {
			if (file.role !== 'test') continue;
			paths.push(file.path);
		}
	}
	return paths.sort();
}

export function verifyEmblaCarouselTestClassifications(root) {
	const discovered = discoverPortAuthoredTests(root);
	const configPath = resolve(root, CONFIG);
	if (!existsSync(configPath)) throw new Error(`missing port-test classifications: ${CONFIG}`);
	const config = JSON.parse(readFileSync(configPath, 'utf8'));
	const manifest = JSON.parse(readFileSync(resolve(root, MANIFEST), 'utf8'));
	const divergenceIds = new Set(
		(manifest.divergences ?? []).map(function idOf(entry) {
			return entry.id;
		}),
	);
	const byPath = new Map(
		config.tests.map(function entryOf(entry) {
			return [entry.path, entry];
		}),
	);
	const declared = config.tests
		.map(function pathOf(entry) {
			return entry.path;
		})
		.sort();
	if (JSON.stringify(discovered) !== JSON.stringify(declared)) {
		throw new Error('every port-authored embla-carousel test must have exactly one classification');
	}
	for (const entry of config.tests) {
		if (!DISPOSITIONS.has(entry.disposition))
			throw new Error(`${entry.path}: unknown test disposition`);
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
	for (const path of requiredTypeLaneTestPaths(manifest)) {
		const entry = byPath.get(path);
		if (!entry) {
			throw new Error(`${path}: required type-lane test is missing a classification`);
		}
		if (entry.disposition !== TYPE_ORACLE_DISPOSITION) {
			throw new Error(
				`${path}: required type-lane tests must use ${TYPE_ORACLE_DISPOSITION} (not Octane-only)`,
			);
		}
	}
	return { tests: discovered.length };
}

export function discoverEmblaCarouselPortAuthoredTests(root) {
	return discoverPortAuthoredTests(root);
}
