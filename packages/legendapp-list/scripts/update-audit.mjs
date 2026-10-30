import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';
import {
	inventoryFromIdentities,
	runConfiguredPristineSuite,
} from '../../../scripts/react-parity/pristine-suite-lib.mjs';
import { ADAPTED_LANE_FILES, RENDER_LANE_FILES } from '../tests/upstream-lane-files.ts';

// Regenerates the committed audit files from the immutable preflight registrations,
// the pinned lock and two lane runs, so a rerun reproduces them byte for byte.
const root = resolve(import.meta.dirname, '../../..');
const base = 'packages/legendapp-list';
const packageRoot = resolve(root, base);
const read = (path) => readFileSync(resolve(root, path));
const digest = (path) => createHash('sha256').update(read(path)).digest('hex');
const options = await resolveConfig(resolve(packageRoot, 'audit/react-parity.json'));
const write = async (path, value) =>
	writeFileSync(
		resolve(root, path),
		await format(JSON.stringify(value), { ...options, parser: 'json' }),
	);
const support = (path) => ({ path, role: 'support', sha256: digest(path) });
const identity = (file, fullName) =>
	`runtime:${createHash('sha256').update(`${file}\0${fullName}`).digest('hex').slice(0, 16)}`;

const registrations = JSON.parse(read(`${base}/audit/registrations.json`));
const lock = JSON.parse(read(`${base}/audit/upstream.lock.json`));
const commit = lock.identity.commit;

// crosswalk ---------------------------------------------------------------
// bun runs these two suites in a child `bun test` of a sibling .cases file for module
// isolation; Vitest isolates each file, so the lanes run the .cases file directly.
const CASES_WRAPPERS = new Map([
	[
		'__tests__/hooks/createResizeObserver.web.test.ts',
		'__tests__/hooks/createResizeObserver.web.cases.ts',
	],
	[
		'__tests__/hooks/useContainerMeasurement.web.test.ts',
		'__tests__/hooks/useContainerMeasurement.web.cases.ts',
	],
]);
const adapted = new Set(ADAPTED_LANE_FILES);
const rendered = new Set(RENDER_LANE_FILES);
const BROWSER = 'tests/browser/differential.browser.test.ts';
const BOTH_LANES =
	'Runs the pinned case unchanged against React and, with its source imports pointed at this package, against the port, both under the suite’s own native-platform harness.';
const RENDERED =
	'Runs unchanged against React in the pristine lane. It renders through react-test-renderer, which has no Octane counterpart; the ported component runs in the Chromium differential against @legendapp/list/react.';
const NATIVE =
	'Covers the React Native variant of a module, which the ./react web entry does not ship. It runs unchanged in the pristine lane.';
const LIVE_MOCK =
	'Needs bun’s mock.module, which rebinds modules other modules already imported; Vitest cannot reproduce it, so the case runs in neither lane. LegendList’s web behavior is driven end to end by the Chromium differential against @legendapp/list/react.';
const ESM_SPY =
	'Spies on an ES module export, which bun allows and Vitest does not, so the case runs in neither lane. The behavior is driven end to end by the Chromium differential against @legendapp/list/react.';
const OTHER_ENTRY =
	'Covers another published entry (keyboard, reanimated or section-list); this binding ports only @legendapp/list/react.';
const EXAMPLE_APP =
	'Covers upstream’s example web app, which is not part of the published package.';
const ESM_SPY_FILES = new Set([
	'__tests__/components/Container.clearCaches.test.tsx',
	'__tests__/components/ListComponent.renderScrollComponent.test.tsx',
	'__tests__/components/Containers.layoutScheduler.native.test.tsx',
]);

function classify(file) {
	const lane = CASES_WRAPPERS.get(file) ?? file;
	if (adapted.has(lane)) {
		return {
			classification: 'implemented',
			localEvidence: [lane.replace(/^__tests__\//, 'tests/upstream/')],
			rationale: BOTH_LANES,
		};
	}
	if (/\/(?:integrations|section-list)\//.test(`/${file}`))
		return { classification: 'inapplicable', rationale: OTHER_ENTRY };
	if (file.startsWith('__tests__/example-web/'))
		return { classification: 'inapplicable', rationale: EXAMPLE_APP };
	if (/\.native\.test\.tsx?$/.test(file) || file.includes('.oldarch.'))
		return { classification: 'inapplicable', rationale: NATIVE };
	if (rendered.has(file))
		return { classification: 'conformance', localEvidence: [BROWSER], rationale: RENDERED };
	if (ESM_SPY_FILES.has(file)) return { classification: 'unsupported', rationale: ESM_SPY };
	return { classification: 'unsupported', rationale: LIVE_MOCK };
}

const crosswalk = registrations.map((registration) => ({
	id: registration.id,
	...classify(registration.source.split(':')[0]),
	upstreamCommit: commit,
}));
await write(`${base}/audit/crosswalk.json`, crosswalk);

// closure -----------------------------------------------------------------
function sourceFiles(directory) {
	return readdirSync(directory, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => relative(packageRoot, join(entry.parentPath, entry.name)))
		.sort();
}
const sourcePaths = sourceFiles(resolve(packageRoot, 'src'));
await write(`${base}/audit/closure.json`, {
	runtimeDependencies: ['octane'],
	adaptedSources: [{ packageName: '@legendapp/list', paths: sourcePaths }],
	sourceLedger: [
		// Reachable through the `./package.json` export.
		{ path: 'package.json', origin: 'authored', sha256: digest(`${base}/package.json`) },
		...sourcePaths.map((path) => ({
			path,
			origin: 'adapted',
			packageName: '@legendapp/list',
			sha256: digest(`${base}/${path}`),
		})),
	],
	// use-sync-external-store, upstream's one dependency, is Octane's own hook.
	reimplementedDependencies: [],
});

// runtime inventories -----------------------------------------------------
const pristineRun = runConfiguredPristineSuite(root, base);
if (pristineRun.status !== 0) throw new Error(pristineRun.stdout + pristineRun.stderr);
const pristine = inventoryFromIdentities(pristineRun.identities, {
	project: 'legendapp-list-pristine',
	roots: [`${base}/upstream`],
});
await write(`${base}/audit/pristine-runtime.json`, pristine);

function adaptedRun() {
	const reportDirectory = mkdtempSync(join(tmpdir(), 'legendapp-list-adapted-'));
	try {
		const reportPath = join(reportDirectory, 'report.json');
		const run = spawnSync(
			resolve(packageRoot, 'node_modules/.bin/vitest'),
			[
				'run',
				'--config',
				'tests/vitest.adapted.config.ts',
				'--reporter=json',
				`--outputFile=${reportPath}`,
			],
			{ cwd: packageRoot, encoding: 'utf8', env: { ...process.env, CI: 'true' } },
		);
		if (run.status !== 0) throw new Error(run.stdout + run.stderr);
		return JSON.parse(readFileSync(reportPath, 'utf8')).testResults.flatMap((suite) =>
			suite.assertionResults.map((test) => ({
				file: relative(root, suite.name),
				// The parity harness names a case by its titles joined with ' > ', then
				// turns every ' > ' into a space; record identities the same way.
				fullName: [...test.ancestorTitles, test.title].join(' > ').replaceAll(' > ', ' '),
				status: test.status,
			})),
		);
	} finally {
		rmSync(reportDirectory, { recursive: true, force: true });
	}
}
const adaptedInventory = inventoryFromIdentities(adaptedRun(), {
	project: 'legendapp-list-adapted',
	roots: [`${base}/tests/upstream`],
});
await write(`${base}/audit/adapted-runtime.json`, adaptedInventory);

// The pristine lane executes one wrapper test that runs the pinned suites through the
// shared config-driven runner and compares identities to pristine-runtime.json.
const wrapperFile = `${base}/tests/upstream-original.test.ts`;
const wrapperName = 'runs the pinned @legendapp/list suites unchanged against React';
await write(`${base}/audit/pristine-wrapper-runtime.json`, {
	schemaVersion: 1,
	project: 'legendapp-list-pristine',
	roots: [`${base}/tests`],
	files: [wrapperFile],
	tests: [{ id: identity(wrapperFile, wrapperName), file: wrapperFile, fullName: wrapperName }],
	snapshots: 0,
});

// differential cases ------------------------------------------------------
const browserFile = `${base}/${BROWSER}`;
const browserSource = read(browserFile).toString('utf8');
const describeName = browserSource.match(/^describe\('((?:[^'\\]|\\.)*)'/m)[1];
const browserCases = [
	...browserSource.matchAll(/^\t\/\/ @parity-case (\S+)\n\tit\('((?:[^'\\]|\\.)*)'/gm),
].map(([, id, testName]) => ({ id, testName, fullName: `${describeName} ${testName}` }));

// parity manifest ---------------------------------------------------------
const commonSupport = [
	`${base}/audit/upstream.lock.json`,
	`${base}/audit/provenance.json`,
	`${base}/audit/registrations.json`,
	`${base}/audit/crosswalk.json`,
	`${base}/scripts/update-audit.mjs`,
	`${base}/tests/upstream-lane-files.ts`,
	`${base}/tests/bun/bun-test.ts`,
	`${base}/tests/bun/native-overrides.ts`,
];
const upstreamLanes = [
	{
		id: 'legendapp-list-pristine-full',
		type: 'pristine-upstream',
		oracle: 'required',
		environment: 'workspace-node',
		project: 'legendapp-list-pristine',
		evidenceOrigin: 'upstream-suite',
		notes: `Runs ${pristine.tests.length} registrations from ${pristine.files.length} pinned suites unchanged against the pinned source on React 19, under bun:test mapped onto Vitest and the suite's own setup.`,
		execution: { kind: 'vitest-full', inventory: `${base}/audit/pristine-wrapper-runtime.json` },
		files: [
			`${base}/audit/pristine-wrapper-runtime.json`,
			`${base}/audit/pristine-runtime.json`,
			...commonSupport,
			`${base}/audit/pristine-suite.json`,
			`${base}/tests/upstream-vitest.config.ts`,
			`${base}/tests/bun/testing-library-react-native.ts`,
			wrapperFile,
			'scripts/react-parity/pristine-suite-lib.mjs',
		].map(support),
	},
	{
		id: 'legendapp-list-adapted-full',
		type: 'adapted-octane',
		oracle: 'required',
		environment: 'workspace-node',
		project: 'legendapp-list-adapted',
		evidenceOrigin: 'upstream-suite',
		notes: `Runs ${adaptedInventory.tests.length} registrations from the ${adaptedInventory.files.length} core suites against this package's source with import rewrites only.`,
		execution: { kind: 'vitest-full', inventory: `${base}/audit/adapted-runtime.json` },
		files: [
			`${base}/audit/adapted-runtime.json`,
			...commonSupport,
			`${base}/tests/vitest.adapted.config.ts`,
			`${base}/tests/bun/testing-library-cleanup.ts`,
		].map(support),
	},
];
const browserLane = {
	id: 'legendapp-list-browser-differential',
	type: 'differential',
	oracle: 'required',
	environment: 'workspace-node',
	project: 'legendapp-list-browser',
	evidenceOrigin: 'repo-authored',
	notes:
		'Serves one .tsrx scenario fixture through the port on Octane and through @legendapp/list/react 3.3.5 on React 19 in headless Chromium, applies the same steps to both pages, and compares scroll geometry, mounted rows and offsets, DOM order, getState() and the callback log after each.',
	files: [
		{ path: browserFile, role: 'test', sha256: digest(browserFile), cases: browserCases },
		support(`${base}/tests/browser/_driver.ts`),
		support(`${base}/tests/browser/harness/scenarios.tsrx`),
		support(`${base}/tests/browser/harness/observe.ts`),
		support(`${base}/tests/browser/harness/bridge.ts`),
		support(`${base}/tests/browser/harness/main.ts`),
		support(`${base}/tests/browser/harness/mount-octane.ts`),
		support(`${base}/tests/browser/harness/mount-react.ts`),
		support(`${base}/tests/browser/harness/index.html`),
	],
};

const ssrFile = `${base}/tests/ssr/ssr.test.ts`;
const ssrSource = read(ssrFile).toString('utf8');
const ssrDescribe = ssrSource.match(/^describe\('((?:[^'\\]|\\.)*)'/m)[1];
const ssrCases = [
	...ssrSource.matchAll(/^\t\/\/ @parity-case (\S+)\n\tit\('((?:[^'\\]|\\.)*)'/gm),
].map(([, id, testName]) => ({ id, testName, fullName: `${ssrDescribe} ${testName}` }));
const ssrLane = {
	id: 'legendapp-list-ssr-differential',
	type: 'differential',
	oracle: 'required',
	environment: 'workspace-node',
	project: 'legendapp-list-ssr',
	evidenceOrigin: 'repo-authored',
	notes:
		'Renders six prop sets through octane/server and through @legendapp/list/react on react-dom/server and compares the markup without hydration comments.',
	files: [{ path: ssrFile, role: 'test', sha256: digest(ssrFile), cases: ssrCases }],
};

const caseId = (id) => browserCases.find((entry) => entry.id === id).id;
await write(`${base}/audit/react-parity.json`, {
	schemaVersion: 1,
	provenance: {
		repo: 'https://github.com/LegendApp/legend-list.git',
		version: lock.identity.version,
		commit,
		sourceRoot: 'src',
		testRoot: '__tests__',
		license: 'MIT',
		integrity: `sha256:${digest(`${base}/upstream-artifact/legendapp-list-${lock.identity.version}.tgz`)}`,
		verification: 'verified',
	},
	upstreamSuites: { runtime: 'insufficient', types: 'absent' },
	materializedTests: base,
	adaptedRoots: {
		source: { roots: [`${base}/src`], include: ['\\.(?:ts|tsrx)$'], exclude: ['\\.d\\.ts$'] },
		tests: {
			roots: [`${base}/tests/upstream`],
			include: ['\\.(?:test|cases)\\.tsx?$'],
			exclude: [],
		},
	},
	adaptedRuntimeSummary: {
		inventoryEntries: adaptedInventory.tests.length,
		uniqueIdentities: new Set(adaptedInventory.tests.map((test) => test.id)).size,
		duplicateEntriesWithinLanes: 0,
		identitiesSharedAcrossLanes: 0,
	},
	environments: {
		'workspace-node': {
			node: '>=22',
			platform: 'any',
			arch: 'any',
			packageManager: JSON.parse(read('package.json')).packageManager,
			lockfile: 'pnpm-lock.yaml',
			lockfileSha256: digest('pnpm-lock.yaml'),
		},
	},
	lanes: [...upstreamLanes, browserLane, ssrLane],
	divergences: [
		{
			id: 'dom-order',
			caseIds: [
				caseId('differential:legendapp-list-row-hooks'),
				caseId('differential:legendapp-list-picker'),
			],
			upstreamResult:
				"Upstream moves the row container elements with insertBefore 500ms after the last position change, so DOM order follows item order. React's tree keeps container-slot order, so sibling rows' effects keep running in slot order.",
			octaneResult:
				'The port renders the containers in that same debounced item order through a keyed @for, so Octane moves the elements. DOM order matches; sibling rows run their effects in DOM order.',
			rationale:
				"Octane tracks each component's DOM as a range between comment markers. An element moved behind its back leaves those ranges, and a later removal orphans it (the differential's stray-row check fails with upstream's mechanism).",
			classification: 'renderer-adaptation',
			consumerImpact:
				'Row effects across different rows may run in a different order after a reorder. Each row’s own effects keep their order.',
			migrationGuidance: 'None.',
			owner: '@octanejs/legendapp-list',
			reviewCondition: 'Review if Octane supports externally reordered keyed children.',
		},
	],
});

console.log(
	`crosswalk ${crosswalk.length}, pristine ${pristine.tests.length}, adapted ${adaptedInventory.tests.length}, browser ${browserCases.length}`,
);
