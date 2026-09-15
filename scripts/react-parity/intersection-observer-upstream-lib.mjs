import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

import { extractTestCases } from './inventory-lib.mjs';

const PACKAGE = 'packages/intersection-observer';
const UPSTREAM_TEST_ROOT = `${PACKAGE}/upstream/src/__tests__`;
const PORTED_TEST_ROOT = `${PACKAGE}/tests/upstream`;
const PRISTINE_RUNTIME = `${PACKAGE}/audit/pristine-runtime.json`;
const ADAPTED_RUNTIME = `${PACKAGE}/audit/adapted-runtime.json`;
const ADAPTED_SSR = `${PACKAGE}/audit/adapted-ssr-runtime.json`;
const PRISTINE_BROWSER = `${PACKAGE}/audit/pristine-browser-runtime.json`;
const ADAPTED_BROWSER = `${PACKAGE}/audit/adapted-browser-runtime.json`;

const TITLE_REPLACEMENTS = new Map();
const PORT_ONLY_CASES = new Map();

// These exact 11 cases test a private React-version switch. Octane supports
// callback-ref cleanup unconditionally; their original executions are retained.
const REACT_VERSION_CASES = new Set(
	[
		'19.0.0',
		'19.0.0-rc.1',
		'19.0.0-experimental-abcdef',
		'20.1.0',
		'18.3.1',
		'17.0.2',
		'undefined',
		'unknown',
		'19unknown',
		'19',
		'v19.0.0',
	].map((version) => `detects ref cleanup support for React version ${version}`),
);

function applicableCases(cases, fileOf, titleOf) {
	const inapplicable = cases.filter(
		(test) =>
			fileOf(test).split('/').at(-1) === 'useOnInView.test.tsx' &&
			REACT_VERSION_CASES.has(titleOf(test)),
	);
	if (
		inapplicable.length &&
		(inapplicable.length !== REACT_VERSION_CASES.size ||
			new Set(inapplicable.map(titleOf)).size !== REACT_VERSION_CASES.size)
	)
		throw new Error(
			'React-version detection evidence must retain every original parameterized case',
		);
	return cases.filter((test) => !inapplicable.includes(test));
}

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

function fullNames(inventoryPath, repoRoot, omitReactVersionCases = false) {
	const inventory = JSON.parse(readFileSync(resolve(repoRoot, inventoryPath), 'utf8'));
	const tests = omitReactVersionCases
		? applicableCases(
				inventory.tests,
				(test) => test.file,
				(test) => test.fullName,
			)
		: inventory.tests;
	return tests
		.map(function nameOf(testCase) {
			return testCase.fullName;
		})
		.sort();
}

export function verifyIntersectionObserverRuntimeCrosswalk(repoRoot) {
	const unitPristine = fullNames(PRISTINE_RUNTIME, repoRoot, true);
	const unitAdapted = fullNames(ADAPTED_RUNTIME, repoRoot);
	if (existsSync(resolve(repoRoot, ADAPTED_SSR))) {
		unitAdapted.push(...fullNames(ADAPTED_SSR, repoRoot));
		unitAdapted.sort();
	}
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

// Byte integrity for the pinned upstream tree and the regenerated adapted
// suite is owned by audit/upstream.lock.json plus react-port:materialize
// (which check.mjs runs before this verifier). This verifier owns the
// semantic layer: artifact and registration crosswalks over those trees.
export function verifyIntersectionObserverUpstream(repoRoot) {
	const upstreamRoot = resolve(repoRoot, UPSTREAM_TEST_ROOT);
	const portedRoot = resolve(repoRoot, PORTED_TEST_ROOT);
	const upstreamArtifacts = testArtifacts(upstreamRoot);
	const portedArtifacts = testArtifacts(portedRoot);
	if (JSON.stringify(upstreamArtifacts) !== JSON.stringify(portedArtifacts)) {
		throw new Error(
			'react-intersection-observer adapted suite must account for every upstream test artifact',
		);
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
		const applicable = applicableCases(
			upstream,
			() => file,
			(title) => title,
		);
		if (JSON.stringify(portedUpstreamCases) !== JSON.stringify(applicable)) {
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

	const crosswalk = verifyIntersectionObserverRuntimeCrosswalk(repoRoot);

	return {
		artifacts: upstreamArtifacts.length,
		browserCases: crosswalk.browserCases,
		portedCases,
		unitCases: crosswalk.unitCases,
		upstreamCases,
	};
}
