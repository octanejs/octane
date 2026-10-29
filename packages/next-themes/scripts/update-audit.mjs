import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { compareTestIdentities } from '../../../scripts/react-parity/harness-lib.mjs';

// Regenerates the committed audit inventories from the immutable preflight
// registrations, the pinned lock and the package's own tests, so a rerun
// reproduces the committed files byte for byte.
const root = resolve(import.meta.dirname, '../../..');
const base = 'packages/next-themes';
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
const tarball = `${base}/upstream-artifact/next-themes-${lock.identity.version}.tgz`;

// Every pinned case sits in one top-level describe; Vitest names it
// "<describe> <title>".
const pinnedSuite = read(`${base}/upstream/__tests__/index.test.tsx`).toString('utf8').split('\n');
const fullNameOf = (registration) => {
	const line = Number(registration.source.split(':').at(-2));
	for (let index = line - 1; index >= 0; index--) {
		const describe = pinnedSuite[index].match(/^describe\('((?:[^'\\]|\\.)*)'/);
		if (describe) return `${describe[1]} ${registration.title}`;
	}
	throw new Error(`no describe encloses ${registration.source}`);
};

// closure -----------------------------------------------------------------
const sourcePaths = ['src/index.tsrx', 'src/script.ts', 'src/types.ts'];
await write(`${base}/audit/closure.json`, {
	runtimeDependencies: ['octane'],
	adaptedSources: [{ packageName: 'next-themes', paths: sourcePaths }],
	sourceLedger: sourcePaths.map((path) => ({
		path,
		origin: 'adapted',
		packageName: 'next-themes',
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
		localEvidence: ['tests/upstream/index.test.tsx'],
		rationale:
			'Runs the pinned upstream case against the Octane port with import rewrites only; the same bytes also run unchanged against React.',
		upstreamCommit: commit,
	})),
);

// runtime inventories -----------------------------------------------------
const lanesFor = {
	pristine: { project: 'next-themes-pristine', file: `${base}/upstream/__tests__/index.test.tsx` },
	adapted: { project: 'next-themes-adapted', file: `${base}/tests/upstream/index.test.tsx` },
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
const wrapperName = 'runs all pinned next-themes runtime registrations unchanged';
await write(`${base}/audit/pristine-wrapper-runtime.json`, {
	schemaVersion: 1,
	project: 'next-themes-pristine',
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
	`${base}/audit/provenance.json`,
	`${base}/audit/registrations.json`,
	`${base}/audit/crosswalk.json`,
	`${base}/scripts/update-audit.mjs`,
];
const upstreamLanes = ['pristine', 'adapted'].map((kind) => ({
	id: `next-themes-${kind}-full`,
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
					wrapperFile,
					'scripts/react-parity/next-themes-pristine-runtime.mjs',
					'scripts/react-parity/pristine-suite-lib.mjs',
				]
			: [`${base}/tests/vitest.adapted.config.ts`]),
	].map(support),
}));
const differentialLane = {
	id: 'next-themes-differential',
	type: 'differential',
	oracle: 'required',
	environment: 'workspace-node',
	project: 'next-themes-differential',
	evidenceOrigin: 'repo-authored',
	notes:
		'Drives the pinned React next-themes and the Octane port through the same steps, including the server-rendered inline script, and compares the page state after each.',
	files: [
		{
			path: differentialFile,
			role: 'test',
			sha256: digest(differentialFile),
			cases: differentialCases,
		},
		...[`${base}/tests/_fixtures/app.tsrx`, `${base}/tests/_server.ts`].map(support),
	],
};

await write(`${base}/audit/react-parity.json`, {
	schemaVersion: 1,
	provenance: {
		repo: 'https://github.com/pacocoursey/next-themes.git',
		version: lock.identity.version,
		commit,
		sourceRoot: 'next-themes/src',
		testRoot: 'next-themes/__tests__',
		license: 'MIT',
		integrity: `sha256:${digest(tarball)}`,
		verification: 'verified',
	},
	upstreamSuites: { runtime: 'present', types: 'absent' },
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
	divergences: [],
});
