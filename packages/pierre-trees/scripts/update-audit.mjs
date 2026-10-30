import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { compareTestIdentities } from '../../../scripts/react-parity/harness-lib.mjs';

// Regenerates the committed audit inventories from the immutable preflight
// registrations, the pinned lock and the package's own tests, so a rerun
// reproduces the committed files byte for byte.
const root = resolve(import.meta.dirname, '../../..');
const base = 'packages/pierre-trees';
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

const registrations = JSON.parse(read(`${base}/audit/registrations.json`));
const lock = JSON.parse(read(`${base}/audit/upstream.lock.json`));
const commit = lock.identity.commit;
const tarball = `${base}/upstream-artifact/pierre-trees-${lock.identity.version}.tgz`;

// Vitest names a case by its enclosing describe titles and its own title,
// joined by spaces. The pinned suite nests describes by indentation.
const pinnedSuite = read(`${base}/upstream/test/file-tree-react.test.tsx`)
	.toString('utf8')
	.split('\n');
const fullNameOf = (registration) => {
	const [line, column] = registration.source.split(':').slice(-2).map(Number);
	const names = [registration.title];
	let indent = column - 1;
	for (let index = line - 2; index >= 0 && indent > 0; index--) {
		const describe = pinnedSuite[index].match(/^( *)describe\('((?:[^'\\]|\\.)*)'/);
		if (describe && describe[1].length < indent) {
			names.unshift(describe[2]);
			indent = describe[1].length;
		}
	}
	return names.join(' ');
};

// The adapted SSR cases render their server half through compiled twins.
const SSR_TITLES = new Set([
	'hydrates preloadedData without a client/server mismatch',
	'hydrates colocated preloadedData and preserves live header interactions',
]);

// closure -----------------------------------------------------------------
const sourcePaths = [
	'src/FileTree.tsrx',
	'src/index.ts',
	'src/useFileTree.tsrx',
	'src/useFileTreeSearch.tsrx',
	'src/useFileTreeSelection.tsrx',
	'src/useFileTreeSelector.tsrx',
];
await write(`${base}/audit/closure.json`, {
	runtimeDependencies: ['@pierre/trees', 'octane'],
	adaptedSources: [{ packageName: '@pierre/trees', paths: sourcePaths }],
	sourceLedger: [
		// Reachable through the `./package.json` export.
		{ path: 'package.json', origin: 'authored', sha256: digest(`${base}/package.json`) },
		...sourcePaths.map((path) => ({
			path,
			origin: 'adapted',
			packageName: '@pierre/trees',
			sha256: digest(`${base}/${path}`),
		})),
	],
	reimplementedDependencies: [],
});

// crosswalk ---------------------------------------------------------------
await write(
	`${base}/audit/crosswalk.json`,
	registrations.map((registration) => ({
		id: registration.id,
		classification: 'implemented',
		localEvidence: ['tests/upstream/file-tree-react.test.tsx'],
		rationale: SSR_TITLES.has(registration.title)
			? 'Runs the pinned upstream case against the Octane port; its server render goes through the server-compiled twin of its components. The unchanged bytes also run against React.'
			: 'Runs the pinned upstream case against the Octane port with import rewrites only; the same bytes also run unchanged against React.',
		upstreamCommit: commit,
	})),
);

// runtime inventories -----------------------------------------------------
const lanesFor = {
	pristine: {
		project: 'pierre-trees-pristine',
		file: `${base}/upstream/test/file-tree-react.test.tsx`,
	},
	adapted: {
		project: 'pierre-trees-adapted',
		file: `${base}/tests/upstream/file-tree-react.test.tsx`,
	},
};
const inventories = {};
for (const [kind, lane] of Object.entries(lanesFor)) {
	const tests = registrations
		.map((registration) => {
			const fullName = fullNameOf(registration);
			return { id: identity(lane.file, fullName), file: lane.file, fullName };
		})
		.sort(compareTestIdentities);
	inventories[kind] = tests;
	await write(`${base}/audit/${kind}-runtime.json`, {
		schemaVersion: 1,
		project: lane.project,
		roots: [kind === 'pristine' ? `${base}/upstream` : `${base}/tests/upstream`],
		files: [lane.file],
		tests,
		snapshots: 0,
	});
}

// The pristine lane executes one wrapper test that runs the whole upstream suite
// through the shared config-driven runner and compares identities to pristine-runtime.json.
const wrapperFile = `${base}/tests/upstream-original.test.ts`;
const wrapperName = 'runs all pinned pierre-trees runtime registrations unchanged';
await write(`${base}/audit/pristine-wrapper-runtime.json`, {
	schemaVersion: 1,
	project: 'pierre-trees-pristine',
	roots: [`${base}/tests`],
	files: [wrapperFile],
	tests: [{ id: identity(wrapperFile, wrapperName), file: wrapperFile, fullName: wrapperName }],
	snapshots: 0,
});

// differential cases ------------------------------------------------------
const differentialFile = `${base}/tests/differential/parity.test.ts`;
const differentialSource = read(differentialFile).toString('utf8');
const describeName = differentialSource.match(/^describe\('((?:[^'\\]|\\.)*)'/m)[1];
const differentialCases = [
	...differentialSource.matchAll(/^\t\/\/ @parity-case (\S+)\n\tit\('((?:[^'\\]|\\.)*)'/gm),
].map(([, id, testName]) => ({ id, testName, fullName: `${describeName} ${testName}` }));

// parity manifest ---------------------------------------------------------
const commonSupport = [
	`${base}/audit/upstream.lock.json`,
	`${base}/audit/upstream-patches/tests/upstream/file-tree-react.test.tsx.patch`,
	`${base}/audit/provenance.json`,
	`${base}/audit/registrations.json`,
	`${base}/audit/crosswalk.json`,
	`${base}/scripts/update-audit.mjs`,
];
const upstreamLanes = ['pristine', 'adapted'].map((kind) => ({
	id: `pierre-trees-${kind}-full`,
	type: kind === 'pristine' ? 'pristine-upstream' : 'adapted-octane',
	oracle: 'required',
	environment: 'workspace-node',
	project: lanesFor[kind].project,
	evidenceOrigin: 'upstream-suite',
	notes:
		kind === 'pristine'
			? `Runs all ${inventories.pristine.length} pinned runtime registrations unchanged against React.`
			: `Runs all ${inventories.adapted.length} pinned runtime registrations against Octane; only the two SSR cases carry a patch.`,
	execution: {
		kind: 'vitest-full',
		inventory: `${base}/audit/${kind === 'pristine' ? 'pristine-wrapper' : 'adapted'}-runtime.json`,
	},
	files: [
		`${base}/audit/${kind === 'pristine' ? 'pristine-wrapper' : 'adapted'}-runtime.json`,
		...(kind === 'pristine' ? [`${base}/audit/pristine-runtime.json`] : []),
		...commonSupport,
		...(kind === 'pristine'
			? [
					`${base}/audit/pristine-suite.json`,
					`${base}/tests/upstream-vitest.config.ts`,
					wrapperFile,
					`${base}/tests/bun-test.ts`,
					'scripts/react-parity/pierre-trees-pristine-runtime.mjs',
					'scripts/react-parity/pristine-suite-lib.mjs',
				]
			: [
					`${base}/tests/vitest.adapted.config.ts`,
					`${base}/tests/bun-test.ts`,
					`${base}/tests/_server.ts`,
					`${base}/tests/_fixtures/server.tsx`,
				]),
	].map(support),
}));
const differentialLane = {
	id: 'pierre-trees-differential',
	type: 'differential',
	oracle: 'required',
	environment: 'workspace-node',
	project: 'pierre-trees-differential',
	evidenceOrigin: 'repo-authored',
	notes:
		'Drives the published @pierre/trees/react and the Octane port through the same steps for the paths the upstream suite does not exercise (useFileTreeSelector equality, search actions, host props, model swaps, host events), and compares rendered text, returned values, host attributes and model ownership after each.',
	files: [
		{
			path: differentialFile,
			role: 'test',
			sha256: digest(differentialFile),
			cases: differentialCases,
		},
		...[`${base}/tests/_fixtures/probes.tsrx`, `${base}/tests/_dom.ts`].map(support),
	],
};

const ssrCaseIds = registrations
	.filter((registration) => SSR_TITLES.has(registration.title))
	.map((registration) => identity(lanesFor.adapted.file, fullNameOf(registration)))
	.sort();

await write(`${base}/audit/react-parity.json`, {
	schemaVersion: 1,
	provenance: {
		repo: 'https://github.com/pierrecomputer/pierre.git',
		version: lock.identity.version,
		commit,
		sourceRoot: 'packages/trees/src/react',
		testRoot: 'packages/trees/test',
		license: 'Apache-2.0',
		integrity: `sha256:${digest(tarball)}`,
		verification: 'verified',
	},
	upstreamSuites: { runtime: 'present', types: 'absent' },
	materializedTests: base,
	adaptedRoots: {
		source: { roots: [`${base}/src`], include: ['\\.(?:ts|tsrx)$'], exclude: ['\\.d\\.ts$'] },
		tests: {
			roots: [`${base}/tests/upstream`],
			include: ['\\.test\\.tsx$'],
			exclude: [],
		},
	},
	adaptedRuntimeSummary: {
		inventoryEntries: inventories.adapted.length,
		uniqueIdentities: inventories.adapted.length,
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
	lanes: [...upstreamLanes, differentialLane],
	divergences: [
		{
			id: 'renderer-test-harness',
			caseIds: ssrCaseIds,
			upstreamResult:
				"The SSR cases server-render the test file's own components with react-dom/server.",
			octaneResult:
				'The server half renders server-compiled twins of the same components (tests/_fixtures/server.tsx). Every hydration and interaction assertion is upstream.',
			rationale: 'One Octane test module compiles for either the client or the server, not both.',
			classification: 'renderer-test-harness',
			consumerImpact: 'None: the server markup, hydration and live header behavior are preserved.',
			migrationGuidance: 'None.',
			owner: '@octanejs/pierre-trees',
			reviewCondition: 'Review when the upstream SSR cases change.',
		},
	],
});
