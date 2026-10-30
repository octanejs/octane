import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { compareTestIdentities } from '../../../scripts/react-parity/harness-lib.mjs';
import { extractTestCases } from '../../../scripts/react-parity/inventory-lib.mjs';
import {
	inventoryFromIdentities,
	runPristineUpstreamSuite,
} from '../../../scripts/react-parity/pierre-diffs-pristine-runtime.mjs';

// Regenerates the committed audit inventories from the pinned test files, the
// lock, and one pristine run (the source of the runtime identities), so a rerun
// reproduces the committed files byte for byte.
//
// The lock itself comes from the reviewed release-tag pin:
//
//   GITHUB_TOKEN=$(gh auth token) pnpm react-port:materialize lock \
//     --package-dir packages/pierre-diffs --pin @pierre/diffs@1.6.1 \
//     --repo pierrecomputer/pierre --commit cbc028ca863d6e662706dba87b50df3eeaebbfa7 \
//     --subdir packages/diffs --scope src --scope package.json --scope LICENSE.md \
//     --scope tsconfig.json --scope test/reactAnnotations.workerRendering.test.ts \
//     --scope test/reactCodeViewEditorOptions.test.ts --scope test/reactEditorOptions.test.ts \
//     --scope test/reactPartialHydration.test.ts --scope test/domHarness.ts \
//     --scope test/testUtils.ts --scope test/workerPoolHarness.ts \
//     --adapted-map test=tests/upstream \
//     --adapted-rewrite "'../src/react='../../src" --adapted-rewrite "'../src='../../upstream/src" \
//     --adapted-rewrite "'react-dom/client'='octane'" --adapted-rewrite "'react'='octane'" \
//     --adapted-rewrite "WorkerPoolContext.Provider=WorkerPoolContext"
const root = resolve(import.meta.dirname, '../../..');
const base = 'packages/pierre-diffs';
const read = (path) => readFileSync(resolve(root, path));
const digest = (path) => createHash('sha256').update(read(path)).digest('hex');
const options = await resolveConfig(resolve(root, `${base}/audit/react-parity.json`));
const write = async (path, value) =>
	writeFileSync(
		resolve(root, path),
		await format(JSON.stringify(value), { ...options, parser: 'json' }),
	);
const support = (path) => ({ path, role: 'support', sha256: digest(path) });
const identity = (file, fullName) =>
	`runtime:${createHash('sha256').update(`${file}\0${fullName}`).digest('hex').slice(0, 16)}`;

const lock = JSON.parse(read(`${base}/audit/upstream.lock.json`));
const commit = lock.identity.commit;
// The npm tarball (not committed: it is mostly the core this port does not copy)
// has the lock's sha512 integrity and this sha256.
const TARBALL_SHA256 = 'd098930547777226a3e25a5cb2f1b471ba91303d6f9e7626663290eb3bec352e';
const TEST_FILES = [
	'reactAnnotations.workerRendering.test.ts',
	'reactCodeViewEditorOptions.test.ts',
	'reactEditorOptions.test.ts',
	'reactPartialHydration.test.ts',
];

// registrations: the preflight extractor and row expansion, applied to the four
// pinned React test files (the whole-package preflight stops at a core test).
const registrations = [];
const declarations = new Map();
for (const name of TEST_FILES) {
	const file = `packages/diffs/test/${name}`;
	const cases = extractTestCases(read(`${base}/upstream/test/${name}`).toString('utf8'), { file });
	declarations.set(name, cases);
	for (const testCase of cases) {
		for (
			let registrationIndex = 0;
			registrationIndex < testCase.estimatedRegistrations;
			registrationIndex++
		) {
			const many = testCase.estimatedRegistrations !== 1;
			registrations.push({
				id: many
					? `react-registration-v1:${createHash('sha256').update(`${testCase.caseId}\0${registrationIndex}`).digest('hex').slice(0, 20)}`
					: testCase.caseId,
				declarationId: testCase.declarationId,
				source: `${file}:${testCase.line}:${testCase.column}${many ? `:registration:${registrationIndex}` : ''}`,
				kind: testCase.kind,
				title: testCase.title ?? testCase.declaredTitle ?? testCase.titleExpression,
				estimatedRegistrations: testCase.estimatedRegistrations,
				registrationIndex,
				dynamicExpansion: testCase.dynamicExpansion,
				helperExpansion: testCase.helperExpansion,
				manualReviewReason: testCase.manualReviewReason,
			});
		}
	}
}
await write(`${base}/audit/registrations.json`, registrations);

// runtime identities: one pristine run names every registration as Vitest does.
const run = runPristineUpstreamSuite();
if (run.status !== 0 || run.identities.some((test) => test.status !== 'passed'))
	throw new Error(
		`the pristine suite must pass before regenerating:\n${run.stdout}\n${run.stderr}`,
	);
if (run.identities.length !== registrations.length)
	throw new Error(
		`${run.identities.length} pristine identities for ${registrations.length} registrations`,
	);
const pristine = inventoryFromIdentities(run.identities);
await write(`${base}/audit/pristine-runtime.json`, pristine);
const adaptedTests = pristine.tests
	.map(({ file, fullName }) => {
		const adaptedFile = file.replace(`${base}/upstream/test/`, `${base}/tests/upstream/`);
		return { id: identity(adaptedFile, fullName), file: adaptedFile, fullName };
	})
	.sort(compareTestIdentities);
await write(`${base}/audit/adapted-runtime.json`, {
	schemaVersion: 1,
	project: 'pierre-diffs-adapted',
	roots: [`${base}/tests/upstream`],
	files: [...new Set(adaptedTests.map((test) => test.file))].sort(),
	tests: adaptedTests,
	snapshots: 0,
});
const wrapperFile = `${base}/tests/upstream-original.test.ts`;
const wrapperName = 'runs all pinned @pierre/diffs React runtime registrations unchanged';
await write(`${base}/audit/pristine-wrapper-runtime.json`, {
	schemaVersion: 1,
	project: 'pierre-diffs-pristine',
	roots: [`${base}/tests`],
	files: [wrapperFile],
	tests: [{ id: identity(wrapperFile, wrapperName), file: wrapperFile, fullName: wrapperName }],
	snapshots: 0,
});

// Which adapted cases carry each divergence: the registrations whose body (up to
// the next registration) contains the patched call, matched to their runtime
// names through their title, with `${…}` and `%s` holes as wildcards.
const caseIdsWhere = (pattern) => {
	const ids = [];
	for (const name of TEST_FILES) {
		const lines = read(`${base}/tests/upstream/${name}`).toString('utf8').split('\n');
		const cases = declarations.get(name);
		const starts = [...new Set(cases.map((testCase) => testCase.line))].sort((a, b) => a - b);
		for (const testCase of cases) {
			const next = starts.find((line) => line > testCase.line) ?? lines.length + 1;
			if (!pattern.test(lines.slice(testCase.line - 1, next - 1).join('\n'))) continue;
			const title = (testCase.title ?? testCase.titleExpression).replace(/^`|`$/g, '');
			const titlePattern = new RegExp(
				`(?:^| )${title
					.split(/\$\{[^}]*\}|%s/)
					.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
					.join('.+?')}$`,
			);
			for (const test of adaptedTests)
				if (test.file.endsWith(`/${name}`) && titlePattern.test(test.fullName)) ids.push(test.id);
		}
	}
	return [...new Set(ids)].sort();
};
// `createRef` predates the patch in the error and StrictMode cases, so those
// keep the divergence that changes what they observe.
const uncaughtCaseIds = caseIdsWhere(/recordUncaughtError/);
const strictCaseIds = caseIdsWhere(/OCTANE DIVERGENCE\[strict-mode-replay\]/);
const createRefCaseIds = caseIdsWhere(/\bcreateRef</).filter(
	(id) => !uncaughtCaseIds.includes(id) && !strictCaseIds.includes(id),
);
const divergentCaseIds = new Set([...uncaughtCaseIds, ...strictCaseIds, ...createRefCaseIds]);

// crosswalk -----------------------------------------------------------------
await write(
	`${base}/audit/crosswalk.json`,
	registrations.map((registration) => ({
		id: registration.id,
		classification: 'implemented',
		localEvidence: [`tests/upstream/${registration.source.split(':')[0].split('/').at(-1)}`],
		rationale:
			'Runs the pinned upstream case against the Octane port, regenerated from the lock with import rewrites and the divergence patches recorded in audit/react-parity.json; the same bytes also run unchanged against React.',
		upstreamCommit: commit,
	})),
);

// closure -------------------------------------------------------------------
const sourcePaths = [
	'src/CodeView.tsrx',
	'src/EditContext.tsrx',
	'src/File.tsrx',
	'src/FileDiff.tsrx',
	'src/MultiFileDiff.tsrx',
	'src/PatchDiff.tsrx',
	'src/UnresolvedFile.tsrx',
	'src/Virtualizer.tsrx',
	'src/WorkerPoolContext.tsrx',
	'src/constants.ts',
	'src/core/areFileTargetsEqual.ts',
	'src/core/getCodeViewItemRenderData.ts',
	'src/core/getHunkSideBoundaries.ts',
	'src/core/getMergeConflictActionSlotName.ts',
	'src/core/parseMergeConflictDiffFromFile.ts',
	'src/index.ts',
	'src/jsx.d.ts',
	'src/types.ts',
	'src/utils/assignRef.ts',
	'src/utils/renderDiffChildren.tsrx',
	'src/utils/renderFileChildren.tsrx',
	'src/utils/templateRender.tsrx',
	'src/utils/useFileDiffInstance.ts',
	'src/utils/useFileInstance.ts',
	'src/utils/useForceUpdate.ts',
	'src/utils/useNextRenderData.ts',
	'src/utils/useStableCallback.ts',
	'src/utils/useUnresolvedFileInstance.ts',
];
await write(`${base}/audit/closure.json`, {
	runtimeDependencies: ['@pierre/diffs', 'octane'],
	adaptedSources: [{ packageName: '@pierre/diffs', paths: sourcePaths }],
	sourceLedger: [
		// Reachable through the `./package.json` export.
		{ path: 'package.json', origin: 'authored', sha256: digest(`${base}/package.json`) },
		{
			path: 'src/node-timeout.d.ts',
			origin: 'authored',
			sha256: digest(`${base}/src/node-timeout.d.ts`),
		},
		...sourcePaths.map((path) => ({
			path,
			origin: 'adapted',
			packageName: '@pierre/diffs',
			sha256: digest(`${base}/${path}`),
		})),
	].sort((a, b) => a.path.localeCompare(b.path)),
	reimplementedDependencies: [],
});

// parity manifest -----------------------------------------------------------
const patches = TEST_FILES.filter((name) => name !== 'reactPartialHydration.test.ts').map(
	(name) => `${base}/audit/upstream-patches/tests/upstream/${name}.patch`,
);
const commonSupport = [
	`${base}/audit/upstream.lock.json`,
	...patches,
	`${base}/audit/provenance.json`,
	`${base}/audit/registrations.json`,
	`${base}/audit/crosswalk.json`,
	`${base}/scripts/update-audit.mjs`,
	`${base}/tests/bun-test.ts`,
	`${base}/tests/bun-environment.ts`,
];
const lanes = [
	{
		id: 'pierre-diffs-pristine-full',
		type: 'pristine-upstream',
		oracle: 'required',
		environment: 'workspace-node',
		project: 'pierre-diffs-pristine',
		evidenceOrigin: 'upstream-suite',
		notes: `Runs all ${pristine.tests.length} pinned React runtime registrations unchanged against the pinned @pierre/diffs source on React 19.2.7.`,
		execution: { kind: 'vitest-full', inventory: `${base}/audit/pristine-wrapper-runtime.json` },
		files: [
			`${base}/audit/pristine-wrapper-runtime.json`,
			`${base}/audit/pristine-runtime.json`,
			...commonSupport,
			`${base}/audit/pristine-suite.json`,
			`${base}/tests/upstream-vitest.config.ts`,
			wrapperFile,
			'scripts/react-parity/pierre-diffs-pristine-runtime.mjs',
			'scripts/react-parity/pristine-suite-lib.mjs',
		].map(support),
	},
	{
		id: 'pierre-diffs-adapted-full',
		type: 'adapted-octane',
		oracle: 'required',
		environment: 'workspace-node',
		project: 'pierre-diffs-adapted',
		evidenceOrigin: 'upstream-suite',
		notes: `Runs all ${adaptedTests.length} pinned React runtime registrations against the Octane port; ${divergentCaseIds.size} carry a divergence patch.`,
		execution: { kind: 'vitest-full', inventory: `${base}/audit/adapted-runtime.json` },
		files: [
			`${base}/audit/adapted-runtime.json`,
			...commonSupport,
			`${base}/tests/vitest.adapted.config.ts`,
		].map(support),
	},
];
const divergence = (fields) => ({
	owner: '@octanejs/pierre-diffs',
	migrationGuidance: 'None.',
	...fields,
});
await write(`${base}/audit/react-parity.json`, {
	schemaVersion: 1,
	provenance: {
		repo: 'https://github.com/pierrecomputer/pierre.git',
		version: lock.identity.version,
		commit,
		sourceRoot: 'packages/diffs/src/react',
		testRoot: 'packages/diffs/test',
		license: 'Apache-2.0',
		integrity: `sha256:${TARBALL_SHA256}`,
		verification: 'verified',
	},
	upstreamSuites: { runtime: 'present', types: 'absent' },
	materializedTests: base,
	adaptedRoots: {
		source: { roots: [`${base}/src`], include: ['\\.(?:ts|tsrx)$'], exclude: ['\\.d\\.ts$'] },
		tests: { roots: [`${base}/tests/upstream`], include: ['\\.test\\.ts$'], exclude: [] },
	},
	adaptedRuntimeSummary: {
		inventoryEntries: adaptedTests.length,
		uniqueIdentities: adaptedTests.length,
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
	lanes,
	divergences: [
		divergence({
			id: 'uncaught-effect-error',
			caseIds: uncaughtCaseIds,
			upstreamResult:
				"An error a layout effect or ref callback throws outside any error boundary is rethrown by React's act(), where the case catches it.",
			octaneResult:
				"Octane reports the error to the root's onUncaughtError, and the cases' roots record it there. The error, its message, and the editor cleanup assertions are upstream's.",
			rationale:
				"Octane's documented root contract: with no boundary, effect-channel errors go to onUncaughtError (console.error by default) and the root unmounts; act() does not rethrow them.",
			classification: 'renderer-test-harness',
			consumerImpact:
				'None for the components: the same errors are thrown from the same effects, and an application observes them through onUncaughtError or an error boundary.',
			reviewCondition: 'Review if Octane act() starts rethrowing effect-channel errors.',
		}),
		divergence({
			id: 'strict-mode-replay',
			caseIds: strictCaseIds,
			upstreamResult:
				"Under StrictMode, React's simulated unmount and remount creates a second editor per surface, and the first is cleaned up.",
			octaneResult:
				'Octane creates the committed editor only; the cleanup and no-leak assertions hold unchanged.',
			rationale: "Octane's StrictMode does not double-invoke mounts.",
			classification: 'strict-mode',
			consumerImpact: 'None: StrictMode replays are development-only.',
			reviewCondition: 'Review if Octane StrictMode gains mount replay.',
		}),
		divergence({
			id: 'create-ref',
			caseIds: createRefCaseIds,
			upstreamResult: "The cases create their ref objects with React's createRef().",
			octaneResult:
				"The patched files define createRef as React's { current: null }; every assertion is upstream's.",
			rationale: 'Octane has no createRef; a ref object is a plain { current } object.',
			classification: 'renderer-test-harness',
			consumerImpact: 'None: CodeView accepts any ref object or callback.',
			reviewCondition: 'Review if Octane exports createRef.',
		}),
	],
});
console.log(
	`registrations ${registrations.length}, pristine ${pristine.tests.length}, adapted ${adaptedTests.length}, divergent ${divergentCaseIds.size} (uncaught ${uncaughtCaseIds.length}, strict ${strictCaseIds.length}, createRef ${createRefCaseIds.length})`,
);
