import prettier from 'prettier';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inspectShippedSources } from '../../../scripts/react-port/evidence-lib.mjs';

const root = resolve(import.meta.dirname, '../../..');
const base = 'packages/tanstack-router-ssr-query';
const read = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
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
async function write(path, value) {
	const file = resolve(root, path);
	writeFileSync(
		file,
		await prettier.format(JSON.stringify(value), {
			...(await prettier.resolveConfig(file)),
			filepath: file,
		}),
	);
}
const support = [
	'audit/upstream.lock.json',
	'audit/provenance.json',
	'audit/upstream-crosswalk.json',
	'audit/registrations.json',
	'audit/crosswalk.json',
	'audit/test-classifications.json',
	'audit/authored-lanes.json',
	'scripts/generate-parity.mjs',
	'src/index.tsrx',
	'src/index.tsrx.d.ts',
	'tsconfig.json',
].map((path) => base + '/' + path);
const lanes = read(base + '/audit/authored-lanes.json').map((lane) => ({
	...lane,
	files: [
		...lane.files.map((file) => ({ ...file, sha256: hash(file.path) })),
		...support
			.filter((path) => !lane.files.some((file) => file.path === path))
			.map((path) => evidence(path)),
	],
}));
function typeLane(
	suffix,
	type,
	project,
	testPath,
	cases,
	{ compiler = 'tsrx-tsc', compilerBins, origin = 'repo-authored', notes } = {},
) {
	const id = 'tanstack-router-ssr-query-' + suffix;
	return {
		id,
		type,
		oracle: 'required',
		environment: 'workspace-node',
		project: id,
		evidenceOrigin: origin,
		...(notes ? { notes } : {}),
		execution: { kind: 'typescript', compiler, ...(compilerBins ? { compilerBins } : {}), project },
		files: [
			...[...new Set([...support, project])]
				.filter((path) => path !== testPath)
				.map((path) => evidence(path)),
			evidence(testPath, 'test', cases),
		],
	};
}
const compilerVersions = ['56', '57', '58', '59', '60', '70'];
lanes.push(
	typeLane(
		'pristine-types',
		'pristine-types',
		base + '/audit/type-probes/tsconfig.pristine.json',
		base + '/upstream/src/index.tsx',
		compilerVersions.map((version) => ({
			id: 'types:pristine-upstream-compile-ts' + version,
			testName: `pinned upstream adapter source compile (TypeScript ${version[0]}.${version[1]})`,
			fullName: `pinned upstream adapter source compile (TypeScript ${version[0]}.${version[1]})`,
		})),
		{
			compiler: 'tsc',
			compilerBins: compilerVersions.map((version) =>
				version === '70'
					? 'node_modules/@typescript/native-preview/bin/tsgo'
					: base + '/node_modules/typescript' + version + '/bin/tsc',
			),
			origin: 'upstream-suite',
			notes:
				'Original adapter source compile matrix, TypeScript 5.6–7.0. Upstream has no dedicated runtime or type-test registrations.',
		},
	),
);
lanes.push(
	typeLane(
		'adapted-types',
		'adapted-types',
		base + '/tsconfig.json',
		base + '/src/index.tsrx',
		[
			{
				id: 'types:adapted-octane-compile',
				testName: 'adapted Octane adapter source compile',
				fullName: 'adapted Octane adapter source compile',
			},
		],
		{
			origin: 'upstream-suite',
			notes:
				'The native source is compiled by tsrx-tsc. Other TypeScript versions do not parse .tsrx and are recorded as incompatible in the upstream crosswalk.',
		},
	),
);
for (const [suffix, type, project, compiler] of [
	['pristine-public-types', 'pristine-types', 'typetests/pristine', 'tsgo'],
	['adapted-public-types', 'adapted-types', 'typetests/adapted', 'tsrx-tsc'],
	['public-types', 'adapted-types', 'tests/types', 'tsrx-tsc'],
]) {
	lanes.push(
		typeLane(
			suffix,
			type,
			base + '/' + project + '/tsconfig.json',
			base + '/' + project + '/integration.test-d.ts',
			[
				{
					id: 'types:ssr-query-' + suffix,
					testName: 'both public exports preserve precise options and reject invalid inputs',
					fullName: 'both public exports preserve precise options and reject invalid inputs',
				},
			],
			{ compiler },
		),
	);
}
lanes.push({
	id: 'tanstack-router-ssr-query-browser',
	type: 'adapted-octane',
	oracle: 'required',
	environment: 'workspace-node',
	project: 'tanstack-router-ssr-query',
	files: [
		...[
			...support,
			base + '/tests/_fixtures/provider-hydration.tsrx',
			base + '/tests/_fixtures/provider-hydration-client.tsrx',
		].map((path) => evidence(path)),
		evidence(base + '/tests/provider-hydration.browser.test.ts', 'test', [
			{
				id: 'browser:ssr-query-provider-hydration',
				testName:
					'hydrates query providers without losing input state and releases page and portal subscriptions',
				fullName:
					'hydrates query providers without losing input state and releases page and portal subscriptions',
			},
		]),
	],
});
const lock = read(base + '/audit/upstream.lock.json');
const prior = read(base + '/audit/react-parity.json');
await write(base + '/audit/react-parity.json', {
	...prior,
	provenance: {
		...prior.provenance,
		version: lock.identity.version,
		commit: lock.identity.commit,
		integrity:
			'sha256:' +
			hash(base + '/upstream-artifact/react-router-ssr-query-' + lock.identity.version + '.tgz'),
	},
	environments: {
		'workspace-node': {
			...prior.environments['workspace-node'],
			lockfileSha256: hash('pnpm-lock.yaml'),
		},
	},
	lanes,
});
const shipped = inspectShippedSources(resolve(root, base));
const sourceLedger = shipped.files.map((path) => ({
	path,
	origin: path === 'package.json' ? 'authored' : 'adapted',
	...(path === 'package.json' ? {} : { packageName: '@tanstack/react-router-ssr-query' }),
	sha256: hash(base + '/' + path),
}));
await write(base + '/audit/closure.json', {
	runtimeDependencies: shipped.runtimeDependencies,
	adaptedSources: [
		{
			packageName: '@tanstack/react-router-ssr-query',
			paths: sourceLedger.filter((file) => file.origin === 'adapted').map((file) => file.path),
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
