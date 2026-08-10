import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

import { extractTestCases } from './inventory-lib.mjs';

const PACKAGE = 'packages/intersection-observer';
const UPSTREAM_TEST_ROOT = `${PACKAGE}/upstream/src/__tests__`;
const PORTED_TEST_ROOT = `${PACKAGE}/tests/upstream`;
const FIXTURES_ROOT = `${PACKAGE}/tests/_fixtures`;
const UPSTREAM_INVENTORY_PATH = `${PACKAGE}/upstream/SHA256SUMS`;
const PORTED_INVENTORY_PATH = `${PACKAGE}/audit/upstream-adapted.SHA256SUMS`;
const PRISTINE_RUNTIME = `${PACKAGE}/audit/pristine-runtime.json`;
const ADAPTED_RUNTIME = `${PACKAGE}/audit/adapted-runtime.json`;
const PRISTINE_BROWSER = `${PACKAGE}/audit/pristine-browser-runtime.json`;
const ADAPTED_BROWSER = `${PACKAGE}/audit/adapted-browser-runtime.json`;

const TITLE_REPLACEMENTS = new Map();
const PORT_ONLY_CASES = new Map();
const PORT_ONLY_ARTIFACTS = new Set(['_setup.ts']);

function filesBelow(root) {
	return readdirSync(root, { recursive: true, withFileTypes: true })
		.filter(function keepFiles(entry) {
			return entry.isFile();
		})
		.map(function absolute(entry) {
			return resolve(entry.parentPath ?? entry.path, entry.name);
		})
		.sort();
}

function portableRelative(root, file) {
	return relative(root, file).split(sep).join('/');
}

function testArtifacts(root) {
	return filesBelow(root).map(function relativePath(file) {
		return portableRelative(root, file);
	});
}

function testFiles(root) {
	return testArtifacts(root).filter(function keepTests(file) {
		return file.endsWith('.test.ts') || file.endsWith('.test.tsx');
	});
}

export function renderIntersectionObserverUpstreamInventory(repoRoot) {
	const upstreamRoot = resolve(repoRoot, `${PACKAGE}/upstream`);
	return `${filesBelow(upstreamRoot)
		.filter(function keepSource(file) {
			return portableRelative(upstreamRoot, file) !== 'SHA256SUMS';
		})
		.map(function digestLine(file) {
			const digest = createHash('sha256').update(readFileSync(file)).digest('hex');
			return `${digest}  ${portableRelative(upstreamRoot, file)}`;
		})
		.join('\n')}\n`;
}

export function renderIntersectionObserverAdaptedInventory(repoRoot) {
	const roots = [resolve(repoRoot, PORTED_TEST_ROOT), resolve(repoRoot, FIXTURES_ROOT)];
	const packageRoot = resolve(repoRoot, PACKAGE);
	const lines = [];
	for (const root of roots) {
		if (!existsSync(root)) continue;
		for (const file of filesBelow(root)) {
			const digest = createHash('sha256').update(readFileSync(file)).digest('hex');
			lines.push(`${digest}  ${portableRelative(packageRoot, file)}`);
		}
	}
	return `${lines.sort().join('\n')}\n`;
}

function fullNames(inventoryPath, repoRoot) {
	const inventory = JSON.parse(readFileSync(resolve(repoRoot, inventoryPath), 'utf8'));
	return inventory.tests
		.map(function nameOf(testCase) {
			return testCase.fullName;
		})
		.sort();
}

export function verifyIntersectionObserverRuntimeCrosswalk(repoRoot) {
	const unitPristine = fullNames(PRISTINE_RUNTIME, repoRoot);
	const unitAdapted = fullNames(ADAPTED_RUNTIME, repoRoot);
	if (JSON.stringify(unitPristine) !== JSON.stringify(unitAdapted)) {
		throw new Error(
			'intersection-observer unit pristine/adapted inventories must match one-for-one by fullName',
		);
	}
	const browserPristine = fullNames(PRISTINE_BROWSER, repoRoot);
	const browserAdapted = fullNames(ADAPTED_BROWSER, repoRoot);
	if (JSON.stringify(browserPristine) !== JSON.stringify(browserAdapted)) {
		throw new Error(
			'intersection-observer browser pristine/adapted inventories must match one-for-one by fullName',
		);
	}
	return {
		browserCases: browserPristine.length,
		unitCases: unitPristine.length,
	};
}

export function verifyIntersectionObserverUpstream(repoRoot) {
	const expectedInventory = readFileSync(resolve(repoRoot, UPSTREAM_INVENTORY_PATH), 'utf8');
	const actualInventory = renderIntersectionObserverUpstreamInventory(repoRoot);
	if (actualInventory !== expectedInventory) {
		throw new Error(
			'react-intersection-observer upstream inventory drifted; re-vendor the pinned tag',
		);
	}

	const upstreamRoot = resolve(repoRoot, UPSTREAM_TEST_ROOT);
	const portedRoot = resolve(repoRoot, PORTED_TEST_ROOT);
	const upstreamArtifacts = testArtifacts(upstreamRoot);
	const portedArtifacts = testArtifacts(portedRoot).filter(function dropPortOnly(file) {
		return !PORT_ONLY_ARTIFACTS.has(file);
	});
	if (JSON.stringify(upstreamArtifacts) !== JSON.stringify(portedArtifacts)) {
		throw new Error(
			'react-intersection-observer adapted suite must account for every upstream test artifact',
		);
	}
	for (const artifact of PORT_ONLY_ARTIFACTS) {
		if (!existsSync(resolve(portedRoot, artifact))) {
			throw new Error(`${artifact}: expected Octane adapted support file is missing`);
		}
	}

	let upstreamCases = 0;
	let portedCases = 0;
	for (const file of testFiles(upstreamRoot)) {
		const upstream = extractTestCases(readFileSync(resolve(upstreamRoot, file), 'utf8'), {
			file,
		}).map(function rewriteTitle({ title }) {
			return TITLE_REPLACEMENTS.get(`${file}\0${title}`) ?? title;
		});
		const portedSource = readFileSync(resolve(portedRoot, file), 'utf8');
		if (
			/\b(?:fdescribe|fit|xdescribe|xit|xtest)(?:\s*\(|\.each\s*\()|\b(?:describe|it|test)\.(?:failing|only|skip|todo)(?:\s*\(|\.each\s*\()/.test(
				portedSource,
			)
		) {
			throw new Error(
				`${file}: adapted upstream tests must execute without focused, failing, skip, or todo markers`,
			);
		}
		const ported = extractTestCases(portedSource, { file }).map(function titleOf({ title }) {
			return title;
		});
		const allowedExtras = PORT_ONLY_CASES.get(file) ?? new Set();
		const portedUpstreamCases = ported.filter(function keepUpstream(title) {
			return !allowedExtras.has(title);
		});
		const observedExtras = ported.filter(function keepExtras(title) {
			return allowedExtras.has(title);
		});
		if (JSON.stringify(portedUpstreamCases) !== JSON.stringify(upstream)) {
			throw new Error(`${file}: adapted test registrations drifted from the pinned upstream suite`);
		}
		for (const title of allowedExtras) {
			if (
				observedExtras.filter(function same(observed) {
					return observed === title;
				}).length !== 1
			) {
				throw new Error(`${file}: expected every recorded Octane regression case to execute once`);
			}
		}
		upstreamCases += upstream.length;
		portedCases += ported.length;
	}

	const expectedPortedInventory = readFileSync(resolve(repoRoot, PORTED_INVENTORY_PATH), 'utf8');
	const actualPortedInventory = renderIntersectionObserverAdaptedInventory(repoRoot);
	if (actualPortedInventory !== expectedPortedInventory) {
		throw new Error(
			'react-intersection-observer adapted test inventory drifted; review and record the change',
		);
	}

	const crosswalk = verifyIntersectionObserverRuntimeCrosswalk(repoRoot);

	return {
		artifacts: upstreamArtifacts.length,
		browserCases: crosswalk.browserCases,
		portedCases,
		unitCases: crosswalk.unitCases,
		upstreamCases,
	};
}
