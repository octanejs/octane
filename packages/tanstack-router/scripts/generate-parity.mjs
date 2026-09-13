import prettier from 'prettier';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { inspectShippedSources } from '../../../scripts/react-port/evidence-lib.mjs';
import { summarizeRuntimeInventories } from '../../../scripts/react-parity/harness-lib.mjs';

const root = resolve(import.meta.dirname, '../../..');
const base = 'packages/tanstack-router';
const read = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const write = async (path, value) => {
	const file = resolve(root, path);
	writeFileSync(
		file,
		await prettier.format(JSON.stringify(value), {
			...(await prettier.resolveConfig(file)),
			filepath: file,
		}),
	);
};
const hash = (path) =>
	createHash('sha256')
		.update(readFileSync(resolve(root, path)))
		.digest('hex');
const evidence = (path, role = 'support', cases) => ({
	path,
	role,
	sha256: hash(path),
	...(cases ? { cases } : {}),
});
function files(directory) {
	return readdirSync(resolve(root, directory), { withFileTypes: true })
		.flatMap((entry) =>
			entry.isDirectory() ? files(directory + '/' + entry.name) : [directory + '/' + entry.name],
		)
		.sort();
}
const lock = read(base + '/audit/upstream.lock.json');
const common = [
	'audit/upstream.lock.json',
	'audit/provenance.json',
	'audit/registrations.json',
	'audit/crosswalk.json',
	'audit/authored-lanes.json',
	'audit/divergence-contracts.json',
	'audit/compatibility-baseline.json',
	'scripts/generate-public-contracts.mjs',
	'scripts/generate-parity.mjs',
].map((path) => base + '/' + path);
const authored = files(base + '/src');
const fixture = files(base + '/tests/_fixtures');
const patches = files(base + '/audit/upstream-patches');
const support = (paths) => [...new Set([...common, ...paths])].sort().map((path) => evidence(path));
const lane = (id, type, project, execution, paths, origin = 'upstream-suite') => ({
	id,
	type,
	project,
	oracle: 'required',
	environment: 'workspace-node',
	evidenceOrigin: origin,
	execution,
	files: support(paths),
});
const lanes = [
	lane(
		'tanstack-router-pristine-runtime',
		'pristine-upstream',
		'tanstack-router-pristine',
		{ kind: 'vitest-full', inventory: base + '/audit/pristine-wrapper-runtime.json' },
		[
			'audit/pristine-wrapper-runtime.json',
			'audit/pristine-runtime.json',
			'audit/pristine-skipped.json',
			'audit/pristine-suite.json',
			'tests/upstream-original.test.ts',
			'tests/upstream-vitest.config.ts',
			'tests/parity-config.ts',
		].map((p) => base + '/' + p),
	),
	lane(
		'tanstack-router-adapted-runtime',
		'adapted-octane',
		'tanstack-router-adapted',
		{ kind: 'vitest-full', inventory: base + '/audit/adapted-runtime.json' },
		[
			...authored,
			...fixture,
			...patches,
			...[
				'audit/adapted-runtime.json',
				'audit/adapted-skipped.json',
				'tests/vitest.adapted.config.ts',
				'tests/parity-config.ts',
				'tests/ssr-fixture.ts',
			].map((p) => base + '/' + p),
		],
	),
];
for (const mode of ['pristine', 'adapted']) {
	const project = base + '/typetests/tsconfig.' + mode + '.json';
	const id = 'tanstack-router-' + mode + '-types';
	const l = lane(
		id,
		mode + '-types',
		id,
		{ kind: 'typescript', compiler: mode === 'pristine' ? 'tsgo' : 'tsrx-tsc', project },
		[...authored, ...patches, project],
	);
	l.files = l.files.filter((f) => f.path !== project);
	l.files.push(
		evidence(project, 'test', [
			{
				id: 'types:router-' + mode + '-complete',
				testName: 'all 167 pinned Router type registrations',
				fullName: 'all 167 pinned Router type registrations',
			},
		]),
	);
	lanes.push(l);
}
for (const l of read(base + '/audit/authored-lanes.json')) {
	l.files = [
		...l.files.map((f) => ({ ...f, sha256: hash(f.path) })),
		...support(authored).filter((f) => !l.files.some((e) => e.path === f.path)),
	];
	lanes.push(l);
}
for (const [suffix, project] of [
	['source-types', base + '/tsconfig.json'],
	['entry-types', base + '/tests/types/tsconfig.json'],
]) {
	const id = 'tanstack-router-' + suffix;
	const item = lane(
		id,
		'adapted-types',
		id,
		{ kind: 'typescript', compiler: 'tsrx-tsc', project },
		[
			...authored,
			...files(base + '/tests/types'),
			base + '/typetests/expected-public-contracts.d.ts',
			project,
		],
		'repo-authored',
	);
	item.files = item.files.filter((file) => file.path !== project);
	item.files.push(
		evidence(project, 'test', [
			{
				id: 'types:router-' + suffix,
				testName: suffix + ' contracts',
				fullName: suffix + ' contracts',
			},
		]),
	);
	lanes.push(item);
}
const browserFile = base + '/tests/browser/navigation.browser.test.ts';
const browser = lane(
	'tanstack-router-browser',
	'adapted-octane',
	'tanstack-router-browser',
	undefined,
	[...authored, base + '/tests/_fixtures/browser-navigation.tsrx'],
	'repo-authored',
);
delete browser.execution;
delete browser.evidenceOrigin;
browser.files.push(
	evidence(browserFile, 'test', [
		{
			id: 'browser:router-production-navigation',
			testName:
				'keeps native input, route loading, and portal context live through navigation and teardown',
			fullName:
				'keeps native input, route loading, and portal context live through navigation and teardown',
		},
	]),
);
lanes.push(browser);
const runtimeCases = read(base + '/audit/adapted-runtime.json').tests;
const contracts = read(base + '/audit/divergence-contracts.json');
const selectedCases = {
	'ref-prop': runtimeCases
		.filter((test) =>
			/should respect target attribute set by custom component|should allow override of target prop even when custom component sets it/.test(
				test.fullName,
			),
		)
		.map((test) => test.id)
		.concat('types:router-adapted-complete'),
	'store-hooks': runtimeCases
		.filter((test) => test.file.endsWith('/ClientOnly.test.tsx'))
		.map((test) => test.id),
	'strict-mode': runtimeCases
		.filter(
			(test) =>
				test.fullName ===
				`Link Router.preload="viewport", should trigger the IntersectionObserver's observe and disconnect methods`,
		)
		.map((test) => test.id),
	'native-lifecycle': runtimeCases
		.filter((test) =>
			/component-thrown bare notFound|warns when Outlet is rendered inside a notFoundComponent/.test(
				test.fullName,
			),
		)
		.map((test) => test.id),
	'error-boundary': runtimeCases
		.filter((test) =>
			/\/(?:disableGlobalCatchBoundary|router-client-stream-cleanup)\.test\.tsx$/.test(test.file),
		)
		.map((test) => test.id),
};
const alreadySelected = new Set(Object.values(selectedCases).flat());
const ssrFiles = files(base + '/tests/upstream').filter((path) =>
	readFileSync(resolve(root, path), 'utf8').includes('OCTANE DIVERGENCE[ssr-compiler]'),
);
selectedCases['ssr-compiler'] = runtimeCases
	.filter((test) => ssrFiles.includes(test.file) && !alreadySelected.has(test.id))
	.map((test) => test.id);
const divergences = contracts.map((contract) => {
	const caseIds = selectedCases[contract.id];
	if (!caseIds?.length) throw new Error('Divergence has no executable evidence: ' + contract.id);
	return { ...contract, caseIds: [...new Set(caseIds)].sort() };
});
const prior = read(base + '/audit/react-parity.json');
const manifest = {
	$schema: '../../hook-form/audit/react-parity.schema.json',
	schemaVersion: 1,
	provenance: {
		repo: 'https://github.com/TanStack/router.git',
		version: lock.identity.version,
		commit: lock.identity.commit,
		sourceRoot: 'packages/react-router/src',
		testRoot: 'packages/react-router/tests',
		license: 'MIT',
		integrity:
			'sha256:' + hash(base + '/upstream-artifact/react-router-' + lock.identity.version + '.tgz'),
		verification: prior.provenance.verification,
	},
	upstreamSuites: { runtime: 'present', types: 'present' },
	adaptedRoots: {
		source: { roots: [base + '/src'], include: ['\\.(?:ts|tsrx)$'], exclude: ['\\.d\\.ts$'] },
		tests: { roots: [base + '/tests/upstream'], include: ['\\.test\\.(?:ts|tsx)$'], exclude: [] },
	},
	adaptedRuntimeSummary: summarizeRuntimeInventories([read(base + '/audit/adapted-runtime.json')]),
	environments: {
		'workspace-node': {
			node: '>=22',
			platform: 'any',
			arch: 'any',
			packageManager: 'pnpm@11.15.1',
			lockfile: 'pnpm-lock.yaml',
			lockfileSha256: hash('pnpm-lock.yaml'),
		},
	},
	lanes,
	divergences,
	materializedTests: base,
};
await write(base + '/audit/react-parity.json', manifest);
const shipped = inspectShippedSources(resolve(root, base));
const native = new Set([
	'package.json',
	'src/slot.ts',
	'src/frameworkTypes.ts',
	'src/generator-plugin.js',
	'src/generator-plugin.d.ts',
	'src/nonRouteComponentContext.ts',
]);
const sourceLedger = shipped.files.map((path) => ({
	path,
	origin: native.has(path) ? 'authored' : 'adapted',
	...(!native.has(path) ? { packageName: '@tanstack/react-router' } : {}),
	sha256: hash(base + '/' + path),
}));
await write(base + '/audit/closure.json', {
	runtimeDependencies: shipped.runtimeDependencies,
	adaptedSources: [
		{
			packageName: '@tanstack/react-router',
			paths: sourceLedger.filter((f) => f.origin === 'adapted').map((f) => f.path),
		},
	],
	sourceLedger,
	reimplementedDependencies: [],
});
console.log(
	JSON.stringify({
		lanes: lanes.length,
		sourceFiles: sourceLedger.length,
		runtimeDependencies: shipped.runtimeDependencies,
	}),
);
