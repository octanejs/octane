import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';

// Case identities are the complete pinned ReactIs describe/it inventory; the
// stable React feature gate omits only experimental SuspenseList. Runtime
// reports must match these identities exactly, so deleting a case fails CI.
const root = resolve(import.meta.dirname, '../../..');
const base = 'packages/react-is';
const read = (path) => readFileSync(resolve(root, path));
const digest = (path) => createHash('sha256').update(read(path)).digest('hex');
const options = await resolveConfig(resolve(root, `${base}/audit/react-parity.json`));
const write = async (path, value) =>
	writeFileSync(
		resolve(root, path),
		await format(JSON.stringify(value), { ...options, parser: 'json' }),
	);
const support = (path) => ({ path, role: 'support', sha256: digest(path) });
const registrations = JSON.parse(read(`${base}/audit/registrations.json`));
const lock = JSON.parse(read(`${base}/audit/upstream.lock.json`));
const sourcePaths = ['src/ReactIs.ts', 'src/index.ts'];
await write(`${base}/audit/closure.json`, {
	runtimeDependencies: ['octane'],
	adaptedSources: [{ packageName: 'react-is', paths: sourcePaths }],
	sourceLedger: sourcePaths.map((path) => ({
		path,
		origin: 'adapted',
		packageName: 'react-is',
		sha256: digest(`${base}/${path}`),
	})),
});
for (const kind of ['pristine', 'adapted']) {
	const file = `${base}/tests/${kind === 'pristine' ? 'pristine-entry' : 'adapted'}.test.ts`;
	const tests = registrations
		.filter((entry) => kind === 'adapted' || entry.title !== 'should identify suspense list')
		.map((entry) => {
			const fullName = `ReactIs ${entry.title}`;
			return {
				id: `runtime:${createHash('sha256').update(`${file}\0${fullName}`).digest('hex').slice(0, 16)}`,
				file,
				fullName,
			};
		})
		.sort((a, b) => a.fullName.localeCompare(b.fullName));
	await write(`${base}/audit/${kind}-runtime.json`, {
		schemaVersion: 1,
		project: kind === 'pristine' ? 'react-is-pristine' : 'react-is',
		roots: [`${base}/tests`],
		files: [file],
		tests,
		snapshots: 0,
	});
}
const patches = readdirSync(resolve(root, `${base}/audit/upstream-patches`), { recursive: true })
	.filter((name) => name.endsWith('.patch'))
	.map((name) => `${base}/audit/upstream-patches/${name}`);
const commonSupport = [
	`${base}/audit/upstream.lock.json`,
	`${base}/audit/provenance.json`,
	`${base}/tests/register-upstream.ts`,
	`${base}/scripts/update-audit.mjs`,
];
const lanes = ['pristine', 'adapted'].map((kind) => ({
	id: `react-is-${kind}-full`,
	type: kind === 'pristine' ? 'pristine-upstream' : 'adapted-octane',
	oracle: 'required',
	environment: 'workspace-node',
	project: kind === 'pristine' ? 'react-is-pristine' : 'react-is',
	evidenceOrigin: 'upstream-suite',
	execution: { kind: 'vitest-full', inventory: `${base}/audit/${kind}-runtime.json` },
	notes:
		kind === 'pristine'
			? 'Runs every stable upstream registration from byte-exact source against the hash-pinned npm oracle; only the experimental SuspenseList gate is disabled as upstream requires.'
			: 'Runs all 14 upstream registrations against Octane, including explicit negative probes for unsupported renderer kinds.',
	files: [
		`${base}/audit/${kind}-runtime.json`,
		...commonSupport,
		...(kind === 'adapted'
			? patches
			: [`${base}/audit/pristine-suite.json`, `${base}/tests/upstream-vitest.config.ts`]),
	].map(support),
}));
lanes.push({
	id: 'react-is-differential',
	type: 'differential',
	oracle: 'required',
	environment: 'workspace-node',
	project: 'react-is-differential',
	evidenceOrigin: 'repo-authored',
	files: [
		{
			path: `${base}/tests/differential.test.ts`,
			role: 'test',
			sha256: digest(`${base}/tests/differential.test.ts`),
			cases: [
				{
					id: 'differential:react-is-supported-surface',
					testName: 'matches every predicate for corresponding supported element values',
					fullName: 'matches every predicate for corresponding supported element values',
				},
			],
		},
	],
});
await write(`${base}/audit/react-parity.json`, {
	schemaVersion: 1,
	provenance: {
		repo: 'https://github.com/facebook/react.git',
		version: lock.identity.version,
		commit: lock.identity.commit,
		sourceRoot: `${base}/upstream/src`,
		testRoot: `${base}/upstream/src/__tests__`,
		license: 'MIT',
		integrity: `sha256:${digest(`${base}/upstream-artifact/react-is-19.2.7.tgz`)}`,
		verification: 'verified',
	},
	upstreamSuites: { runtime: 'present', types: 'absent' },
	adaptedRoots: {
		source: { roots: [`${base}/src`], include: ['\\.ts$'], exclude: [] },
		tests: { roots: [`${base}/tests`], include: ['/adapted\\.test\\.ts$'], exclude: [] },
	},
	adaptedRuntimeSummary: {
		inventoryEntries: 14,
		uniqueIdentities: 14,
		duplicateEntriesWithinLanes: 0,
		identitiesSharedAcrossLanes: 0,
	},
	environments: {
		'workspace-node': {
			node: '>=22',
			platform: 'any',
			arch: 'any',
			packageManager: 'pnpm@11.15.1',
			lockfile: 'pnpm-lock.yaml',
			lockfileSha256: digest('pnpm-lock.yaml'),
		},
	},
	lanes,
	divergences: [
		{
			id: 'unsupported-renderer-kinds',
			caseIds: JSON.parse(read(`${base}/audit/adapted-runtime.json`))
				.tests.filter(({ fullName }) =>
					[
						'identifies valid element types',
						'should identify context consumers',
						'should identify ref forwarding component',
						'should identify suspense list',
						'should identify profile root',
					].some((title) => fullName === `ReactIs ${title}`),
				)
				.map(({ id }) => id),
			upstreamResult:
				'React recognizes class components, Context.Consumer, forwardRef, Profiler and experimental SuspenseList kinds.',
			octaneResult:
				'Functions and ref props replace class and forwarding wrappers; unsupported kind predicates return false. Stable SuspenseList is absent in the pinned React oracle and has an explicit Octane negative control.',
			rationale:
				'Octane deliberately omits these renderer kinds; retaining their predicate names permits safe feature probes without inventing renderer support.',
			classification: 'framework-component-model',
			consumerImpact:
				'Unsupported React kinds cannot be rendered or identified as supported Octane descriptors.',
			migrationGuidance:
				'Use function components, plain ref props and use/useContext; import rendering components from octane and classifier labels from @octanejs/react-is.',
			owner: 'octanejs',
			reviewCondition: 'Revisit if Octane adds one of the currently unsupported renderer kinds.',
		},
	],
});
