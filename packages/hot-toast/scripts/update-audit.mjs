import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';

// Regenerates the committed audit inventories from the immutable preflight
// registrations, the pinned lock and the package's own tests, so a rerun
// reproduces the committed files byte for byte.
const root = resolve(import.meta.dirname, '../../..');
const base = 'packages/hot-toast';
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
const byIdentity = (a, b) => {
	const left = `${a.file}\0${a.fullName}`;
	const right = `${b.file}\0${b.fullName}`;
	return left < right ? -1 : left > right ? 1 : 0;
};

const registrations = JSON.parse(read(`${base}/audit/registrations.json`));
const lock = JSON.parse(read(`${base}/audit/upstream.lock.json`));
const commit = lock.identity.commit;
const suiteOf = (registration) => registration.source.match(/^test\/([^/]+)\.test\.tsx:/)[1];

// Jest and Vitest both name a case by its enclosing describe titles and its own.
function fullNameOf(registration) {
	const [file, line] = registration.source.split(':');
	const lines = read(`${base}/upstream/${file}`).toString('utf8').split('\n');
	const names = [registration.title];
	let indent = lines[line - 1].match(/^ */)[0].length;
	for (let index = line - 2; index >= 0 && indent > 0; index--) {
		const describe = lines[index].match(/^( *)describe\('((?:[^'\\]|\\.)*)'/);
		if (describe && describe[1].length < indent) {
			names.unshift(describe[2]);
			indent = describe[1].length;
		}
	}
	return names.join(' ');
}

// closure -----------------------------------------------------------------
const authored = new Set(['src/components/styled.tsrx', 'src/goober.d.ts', 'src/goober.js']);
const sourcePaths = readdirSync(resolve(root, base, 'src'), { recursive: true })
	.map((path) => `src/${path.split('\\').join('/')}`)
	.filter((path) => /\.(?:ts|tsrx|js)$/.test(path))
	.sort();
await write(`${base}/audit/closure.json`, {
	runtimeDependencies: ['goober', 'octane'],
	adaptedSources: [
		{
			packageName: 'react-hot-toast',
			paths: sourcePaths.filter((path) => !authored.has(path)),
		},
	],
	sourceLedger: sourcePaths.map((path) => ({
		path,
		origin: authored.has(path) ? 'authored' : 'adapted',
		...(authored.has(path) ? {} : { packageName: 'react-hot-toast' }),
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
			'Runs the pinned upstream case against the Octane port after mechanical import and harness rewrites; the same bytes also run unchanged against React.',
		upstreamCommit: commit,
	})),
);

// runtime inventories -----------------------------------------------------
const suites = [...new Set(registrations.map(suiteOf))].sort();
const pristineTests = registrations
	.map((registration) => ({
		file: `upstream/test/${suiteOf(registration)}.test.tsx`,
		fullName: fullNameOf(registration),
		status: 'passed',
	}))
	.sort(byIdentity);
await write(`${base}/audit/pristine-runtime.json`, {
	schemaVersion: 1,
	root: base,
	tests: pristineTests,
	snapshots: 0,
});

const adaptedDir = `${base}/tests/upstream`;
const adaptedTests = registrations
	.map((registration) => {
		const file = `${adaptedDir}/${suiteOf(registration)}.test.tsx`;
		const fullName = fullNameOf(registration);
		return { id: identity(file, fullName), file, fullName };
	})
	.sort(byIdentity);
await write(`${base}/audit/adapted-runtime.json`, {
	schemaVersion: 1,
	project: 'hot-toast-adapted',
	roots: [adaptedDir],
	files: suites.map((name) => `${adaptedDir}/${name}.test.tsx`),
	tests: adaptedTests,
	snapshots: 0,
});

// repo-authored evidence ----------------------------------------------------
function casesOf(path) {
	const source = read(path).toString('utf8');
	const describe = source.match(/^describe\('((?:[^'\\]|\\.)*)'/m)[1];
	return [
		...source.matchAll(/\/\/ @parity-case (\S+)\n\s*it\((['"])((?:(?!\2)[^\\]|\\.)*)\2/g),
	].map(([, id, , testName]) => ({ id, testName, fullName: `${describe} ${testName}` }));
}
const ordinary = ['tests/conformance/toaster.test.ts', 'tests/ssr/server.test.ts'].map(
	(relative) => {
		const path = `${base}/${relative}`;
		return { path, sha256: digest(path), cases: casesOf(path) };
	},
);
const differentialTest = `${base}/tests/differential/parity.test.ts`;
const pauseCase = adaptedTests.find(({ fullName }) => fullName === 'pause toast');

// parity manifest ---------------------------------------------------------
const commonSupport = [
	`${base}/audit/upstream.lock.json`,
	`${base}/audit/provenance.json`,
	`${base}/audit/registrations.json`,
	`${base}/audit/crosswalk.json`,
	`${base}/scripts/update-audit.mjs`,
];
const lanes = [
	{
		id: 'hot-toast-pristine-upstream',
		type: 'pristine-upstream',
		oracle: 'required',
		environment: 'workspace-node',
		project: 'hot-toast-pristine',
		evidenceOrigin: 'upstream-suite',
		notes: `Runs all ${pristineTests.length} pinned Jest registrations byte for byte against the pinned React source.`,
		execution: {
			kind: 'jest-full',
			config: `${base}/jest.pristine.config.cjs`,
			root: base,
			inventory: `${base}/audit/pristine-runtime.json`,
		},
		files: [
			`${base}/audit/pristine-runtime.json`,
			`${base}/jest.pristine.config.cjs`,
			...commonSupport,
		].map(support),
	},
	{
		id: 'hot-toast-adapted-full',
		type: 'adapted-octane',
		oracle: 'required',
		environment: 'workspace-node',
		project: 'hot-toast-adapted',
		evidenceOrigin: 'upstream-suite',
		notes: `Runs all ${adaptedTests.length} pinned registrations against Octane after mechanical rewrites and one event-model divergence patch.`,
		execution: { kind: 'vitest-full', inventory: `${base}/audit/adapted-runtime.json` },
		files: [
			`${base}/audit/adapted-runtime.json`,
			...commonSupport,
			`${base}/audit/upstream-patches/tests/upstream/toast.test.tsx.patch`,
			`${base}/tests/vitest.adapted.config.ts`,
			`${base}/tests/adapted-setup.ts`,
		].map(support),
	},
	{
		id: 'hot-toast-differential',
		type: 'differential',
		oracle: 'required',
		environment: 'workspace-node',
		project: 'hot-toast-differential',
		evidenceOrigin: 'repo-authored',
		notes:
			'Runs one same-fixture lifecycle against the published react-hot-toast@2.6.1 React runtime, comparing HTML after every step.',
		files: [
			{
				path: differentialTest,
				role: 'test',
				sha256: digest(differentialTest),
				cases: casesOf(differentialTest),
			},
			...[
				`${base}/tests/_fixtures/hot-toast-diff.tsrx`,
				`${base}/tests/differential/_setup.ts`,
				`${base}/tests/setup.ts`,
				'packages/octane/tests/differential/_rig.ts',
			].map(support),
		],
	},
];

await write(`${base}/audit/react-parity.json`, {
	schemaVersion: 1,
	provenance: {
		repo: 'https://github.com/timolins/react-hot-toast.git',
		version: lock.identity.version,
		commit,
		sourceRoot: 'src',
		testRoot: 'test',
		license: 'MIT',
		integrity: `sha256:${digest(`${base}/upstream-artifact/react-hot-toast-2.6.1.tgz`)}`,
		verification: 'verified',
	},
	upstreamSuites: { runtime: 'present', types: 'absent' },
	materializedTests: base,
	adaptedRoots: {
		source: { roots: [`${base}/src`], include: ['\\.(?:ts|tsrx)$'], exclude: ['\\.d\\.ts$'] },
		tests: { roots: [adaptedDir], include: ['\\.test\\.(?:ts|tsx)$'], exclude: [] },
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
	ordinaryEvidence: ordinary,
	divergences: [
		{
			id: 'native-mouseenter',
			caseIds: [pauseCase.id, 'conformance:hot-toast-native-pause'],
			upstreamResult:
				"React synthesizes the Toaster container's onMouseEnter/onMouseLeave from mouseover/mouseout, so a mouseenter fired on a toast reaches the container's pause handler.",
			octaneResult:
				'The pause handlers are the native, non-bubbling mouseenter/mouseleave listeners on the container, which a pointer entering any toast dispatches there.',
			rationale: 'Octane delivers native DOM events and has no synthetic enter/leave layer.',
			classification: 'event-model',
			consumerImpact:
				'None for real pointers. Tests that fire mouseenter on a toast element must fire it on the Toaster container instead.',
			migrationGuidance:
				'Dispatch mouseenter/mouseleave on the [data-rht-toaster] container in tests.',
			owner: '@octanejs/hot-toast',
			reviewCondition: 'Review if Octane adds synthetic enter/leave delegation.',
		},
		{
			id: 'goober-pragma',
			caseIds: ['conformance:hot-toast-goober-pragma'],
			upstreamResult:
				"react-hot-toast calls goober's setup(React.createElement) when it loads, replacing any pragma the application configured.",
			octaneResult:
				"The port renders its own elements and never calls setup(), so the application's goober pragma stays in place.",
			rationale:
				"goober's styled() builds React elements through its global pragma; the port authors those elements in .tsrx and uses goober only to compile CSS.",
			classification: 'framework-integration',
			consumerImpact:
				'Applications that also use goober keep their own pragma regardless of import order.',
			migrationGuidance: 'No change needed.',
			owner: '@octanejs/hot-toast',
			reviewCondition: 'Review if upstream stops calling setup() at module load.',
		},
		{
			id: 'shared-headless-store',
			caseIds: ['conformance:hot-toast-shared-headless-store'],
			upstreamResult:
				'The root and /headless entries are separate bundles, each with its own toast store.',
			octaneResult:
				'Both entries publish the same source modules and therefore share one toast store.',
			rationale:
				'Octane bindings ship their authored source unbundled, so both entries resolve the same modules.',
			classification: 'implementation',
			consumerImpact:
				'A toast created through one entry also reaches toasters and useToaster hooks imported from the other.',
			migrationGuidance: 'No change needed; mixing the entries now behaves as one store.',
			owner: '@octanejs/hot-toast',
			reviewCondition: 'Review if the binding starts bundling its entries.',
		},
	],
});
