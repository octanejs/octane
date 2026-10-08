import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';

// Regenerates the committed audit inventories from the immutable preflight
// registrations, the pinned lock and the package's own tests, so a rerun
// reproduces the committed files byte for byte.
const root = resolve(import.meta.dirname, '../../..');
const base = 'packages/tanstack-query-devtools';
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
const upstreamFiles = ['ReactQueryDevtools', 'ReactQueryDevtoolsPanel'];
const suiteOf = (registration) => registration.source.match(/([^/]+)\.test\.tsx:/)[1];

// closure -----------------------------------------------------------------
const sourcePaths = [
	'src/ReactQueryDevtools.tsrx',
	'src/ReactQueryDevtoolsPanel.tsrx',
	'src/index.ts',
	'src/production.ts',
];
await write(`${base}/audit/closure.json`, {
	runtimeDependencies: ['@octanejs/tanstack-query', '@tanstack/query-devtools', 'octane'],
	adaptedSources: [{ packageName: '@tanstack/react-query-devtools', paths: sourcePaths }],
	sourceLedger: sourcePaths.map((path) => ({
		path,
		origin: 'adapted',
		packageName: '@tanstack/react-query-devtools',
		sha256: digest(`${base}/${path}`),
	})),
	reimplementedDependencies: [],
});

// crosswalk ---------------------------------------------------------------
await write(
	`${base}/audit/crosswalk.json`,
	registrations.map((registration) => ({
		id: registration.id,
		classification: 'implemented',
		localEvidence: [`tests/upstream/${suiteOf(registration)}.test.tsx`],
		rationale:
			'Runs the pinned upstream case against the Octane port with import rewrites only; the same bytes also run unchanged against React.',
		upstreamCommit: commit,
	})),
);

// runtime inventories -----------------------------------------------------
const lanesFor = {
	pristine: {
		project: 'tanstack-query-devtools-pristine',
		dir: `${base}/upstream/src/__tests__`,
	},
	adapted: {
		project: 'tanstack-query-devtools-adapted',
		dir: `${base}/tests/upstream`,
	},
};
const inventories = {};
for (const [kind, lane] of Object.entries(lanesFor)) {
	const files = upstreamFiles.map((name) => `${lane.dir}/${name}.test.tsx`);
	const tests = registrations
		.map((registration) => {
			const file = `${lane.dir}/${suiteOf(registration)}.test.tsx`;
			const fullName = `${suiteOf(registration)} ${registration.title}`;
			return { id: identity(file, fullName), file, fullName };
		})
		.sort((a, b) => a.file.localeCompare(b.file) || a.fullName.localeCompare(b.fullName));
	inventories[kind] = tests;
	await write(`${base}/audit/${kind}-runtime.json`, {
		schemaVersion: 1,
		project: lane.project,
		roots: [kind === 'pristine' ? `${base}/upstream` : lane.dir],
		files,
		tests,
		snapshots: 0,
	});
}

// The pristine lane executes one wrapper test that runs the whole upstream suite
// through the shared config-driven runner and compares identities to pristine-runtime.json.
const wrapperFile = `${base}/tests/upstream-original.test.ts`;
const wrapperName = 'runs all pinned Query devtools runtime registrations unchanged';
await write(`${base}/audit/pristine-wrapper-runtime.json`, {
	schemaVersion: 1,
	project: 'tanstack-query-devtools-pristine',
	roots: [`${base}/tests`],
	files: [wrapperFile],
	tests: [{ id: identity(wrapperFile, wrapperName), file: wrapperFile, fullName: wrapperName }],
	snapshots: 0,
});

// ordinary (repo-authored) evidence ---------------------------------------
function casesOf(path) {
	const stack = [];
	const cases = [];
	for (const line of read(path).toString('utf8').split('\n')) {
		const indent = line.match(/^\t*/)[0].length;
		const describe = line.match(/^\t*describe\('((?:[^'\\]|\\.)*)'/);
		if (describe) {
			stack.length = indent;
			stack[indent] = describe[1];
			continue;
		}
		const it = line.match(/^\t*it\('((?:[^'\\]|\\.)*)'/);
		if (it) {
			const names = stack.slice(0, indent).filter(Boolean);
			cases.push({
				testName: it[1],
				fullName: [...names, it[1]].join(' '),
			});
		}
	}
	return cases;
}
const slug = (text) =>
	text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
const ordinary = [
	'tests/conformance/devtools.test.ts',
	'tests/conformance/production-switch.test.ts',
	'tests/ssr/server.test.ts',
].map((relative) => {
	const path = `${base}/${relative}`;
	return {
		path,
		sha256: digest(path),
		cases: casesOf(path).map((testCase) => ({
			id: `conformance:tanstack-query-devtools-${slug(testCase.testName)}`,
			...testCase,
		})),
	};
});
const lazyCase = ordinary
	.flatMap((entry) => entry.cases)
	.find(({ testName }) => testName.startsWith('constructs the core once'));

// parity manifest ---------------------------------------------------------
const commonSupport = [
	`${base}/audit/upstream.lock.json`,
	`${base}/audit/provenance.json`,
	`${base}/audit/registrations.json`,
	`${base}/audit/crosswalk.json`,
	`${base}/scripts/update-audit.mjs`,
];
const lanes = ['pristine', 'adapted'].map((kind) => ({
	id: `tanstack-query-devtools-${kind}-full`,
	type: kind === 'pristine' ? 'pristine-upstream' : 'adapted-octane',
	oracle: 'required',
	environment: 'workspace-node',
	project: lanesFor[kind].project,
	evidenceOrigin: 'upstream-suite',
	notes:
		kind === 'pristine'
			? `Runs all ${inventories.pristine.length} pinned runtime registrations unchanged against React.`
			: `Runs all ${inventories.adapted.length} pinned runtime registrations against Octane with import rewrites only.`,
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
					`${base}/tests/upstream-original.test.ts`,
					'scripts/react-parity/tanstack-query-devtools-pristine-runtime.mjs',
					'scripts/react-parity/pristine-suite-lib.mjs',
				]
			: [`${base}/tests/vitest.adapted.config.ts`, `${base}/tests/adapted-setup.ts`]),
	].map(support),
}));

await write(`${base}/audit/react-parity.json`, {
	schemaVersion: 1,
	provenance: {
		repo: 'https://github.com/TanStack/query.git',
		version: lock.identity.version,
		commit,
		sourceRoot: 'packages/react-query-devtools/src',
		testRoot: 'packages/react-query-devtools/src/__tests__',
		license: 'MIT',
		integrity: `sha256:${digest(`${base}/upstream-artifact/tanstack-react-query-devtools-5.102.8.tgz`)}`,
		verification: 'verified',
	},
	upstreamSuites: { runtime: 'present', types: 'absent' },
	adaptedRoots: {
		source: { roots: [`${base}/src`], include: ['\\.(?:ts|tsrx)$'], exclude: ['\\.d\\.ts$'] },
		tests: {
			roots: [`${base}/tests/upstream`],
			include: ['\\.test\\.(?:ts|tsx)$'],
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
	lanes,
	ordinaryEvidence: ordinary,
	divergences: [
		{
			id: 'lazy-core-construction',
			caseIds: [lazyCase.id],
			upstreamResult:
				'The React adapter passes an eagerly constructed core to useState, building and discarding a new core on every render after the first.',
			octaneResult:
				'The Octane port constructs the core in a lazy useState initializer, once per mounted component.',
			rationale:
				'Avoids repeated construction of the devtools core; mount, unmount and every setter observe the same instance either way.',
			classification: 'implementation',
			consumerImpact:
				'None observable: the upstream suite asserts no constructor call count, and the mounted core is identical.',
			migrationGuidance: 'No change needed.',
			owner: '@octanejs/tanstack-query-devtools',
			reviewCondition:
				'Revisit if a pinned upstream release asserts constructor call counts or changes how it initializes the core.',
		},
	],
});
