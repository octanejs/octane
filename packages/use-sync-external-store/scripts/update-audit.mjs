import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { collectVitestTests } from '../../../scripts/react-parity/collect-vitest-tests.mjs';

// Regenerates every committed audit artifact from the pinned inputs and the
// live Vitest projects, so a rerun reproduces them byte for byte.
const root = resolve(import.meta.dirname, '../../..');
const base = 'packages/use-sync-external-store';
const read = (path) => readFileSync(resolve(root, path));
const digest = (path) => createHash('sha256').update(read(path)).digest('hex');
const options = await resolveConfig(resolve(root, `${base}/package.json`));
const write = async (path, value) =>
	writeFileSync(
		resolve(root, path),
		await format(JSON.stringify(value), { ...options, parser: 'json' }),
	);
const support = (path) => ({ path, role: 'support', sha256: digest(path) });
const lock = JSON.parse(read(`${base}/audit/upstream.lock.json`));
const registrations = JSON.parse(read(`${base}/audit/registrations.json`));
const upstreamFile = (registration) =>
	registration.source
		.replace(/^packages\/use-sync-external-store\/src\/__tests__\//, '')
		.split(':')[0];

// The build-test configuration gates this legacy-root case to the React 17 shim.
const GATED =
	"compares to current state before bailing out, even when there's a mutation in between the sync and passive effects";
const GATED_RATIONALE =
	'React gates this case with `@gate enableUseSyncExternalStoreShim`: it observes a legacy root between a synchronous render and its passive effects, which only the React 17 shim variant can do. The build-test configuration on React 18+ does not run it.';

const artifactFiles = readdirSync(resolve(root, `${base}/upstream-artifact`), {
	recursive: true,
	withFileTypes: true,
})
	.filter((entry) => entry.isFile())
	.map((entry) => relative(resolve(root, base), resolve(entry.parentPath, entry.name)))
	.sort();
await write(`${base}/audit/provenance.json`, {
	schemaVersion: 1,
	artifacts: [...artifactFiles, 'LICENSE.upstream'].map((path) => ({
		path,
		sha256: digest(`${base}/${path}`),
	})),
	packageIdentity: {
		path: 'upstream-artifact/package/package.json',
		name: lock.identity.packageName,
		version: lock.identity.version,
		license: 'MIT',
	},
	unpublishedDirs: ['audit', 'scripts', 'tests', 'upstream', 'upstream-artifact'],
	filesEqual: [{ path: 'LICENSE.upstream', equalsPath: 'upstream-artifact/package/LICENSE' }],
});

const sourcePaths = [
	'src/index.ts',
	'src/shim/index.ts',
	'src/useSyncExternalStoreWithSelector.ts',
];
await write(`${base}/audit/closure.json`, {
	runtimeDependencies: ['octane'],
	adaptedSources: [{ packageName: lock.identity.packageName, paths: sourcePaths }],
	sourceLedger: [
		// Exported as `./package.json`, as upstream does.
		{ path: 'package.json', origin: 'authored', sha256: digest(`${base}/package.json`) },
		...sourcePaths.map((path) => ({
			path,
			origin: 'adapted',
			packageName: lock.identity.packageName,
			sha256: digest(`${base}/${path}`),
		})),
	],
	reimplementedDependencies: [],
});

const lanes = [
	{ kind: 'pristine', project: 'use-sync-external-store-pristine', root: `${base}/upstream` },
	{ kind: 'adapted', project: 'use-sync-external-store-adapted', root: `${base}/tests/upstream` },
	{
		kind: 'adapted-ssr',
		project: 'use-sync-external-store-adapted-ssr',
		root: `${base}/tests/upstream`,
	},
];
const inventories = {};
for (const lane of lanes) {
	const all = (await collectVitestTests(root, lane.project))
		.map((test) => {
			const file = relative(root, test.file);
			const fullName = test.name.replaceAll(' > ', ' ');
			const id = `runtime:${createHash('sha256').update(`${file}\0${fullName}`).digest('hex').slice(0, 16)}`;
			if (test.mode === 'run') return { id, file, fullName };
			if (test.mode !== 'skip' || !fullName.endsWith(GATED))
				throw new Error(`Unexpected ${test.mode} registration: ${fullName}`);
			return { id, file, fullName, mode: test.mode, rationale: GATED_RATIONALE };
		})
		.sort((left, right) => left.id.localeCompare(right.id));
	inventories[lane.kind] = {
		schemaVersion: 2,
		project: lane.project,
		roots: [lane.root],
		files: [...new Set(all.map((test) => test.file))].sort(),
		tests: all.filter((test) => !test.mode),
		skippedTests: all.filter((test) => test.mode),
	};
	await write(`${base}/audit/${lane.kind}-runtime.json`, inventories[lane.kind]);
}
const pristineCount = inventories.pristine.tests.length + inventories.pristine.skippedTests.length;
if (pristineCount !== registrations.length)
	throw new Error(`Pristine lane registers ${pristineCount} of ${registrations.length} cases`);

const adaptedTests = [...inventories.adapted.tests, ...inventories['adapted-ssr'].tests];
const caseIds = (...titles) => {
	const ids = adaptedTests
		.filter(({ fullName }) => titles.some((title) => fullName.endsWith(` ${title}`)))
		.map(({ id }) => id);
	if (ids.length < titles.length) throw new Error(`Missing adapted case for ${titles.join(', ')}`);
	return ids;
};
const nativeCaseIds = adaptedTests
	.filter(({ file }) => file.endsWith('useSyncExternalStoreNative-test.js'))
	.map(({ id }) => id);

const evidenceFor = {
	'basic server hydration': ['tests/conformance.test.ts'],
	'basic server render': ['tests/conformance.test.ts'],
};
await write(
	`${base}/audit/crosswalk.json`,
	registrations.map((registration) => {
		const file = upstreamFile(registration);
		if (registration.title.includes('compares to current state before bailing out'))
			return {
				id: registration.id,
				classification: 'inapplicable',
				rationale: GATED_RATIONALE,
				upstreamCommit: lock.identity.commit,
			};
		return {
			id: registration.id,
			classification: 'implemented',
			localEvidence: [`tests/upstream/${file}`, ...(evidenceFor[registration.title] ?? [])],
			rationale:
				file === 'useSyncExternalStoreShared-test.js'
					? 'Runs the pinned case against Octane and this binding; the patch records any divergence.'
					: 'Runs the pinned shim case against Octane, whose built-in hook replaces the React 16-17 userspace fallback.',
			upstreamCommit: lock.identity.commit,
		};
	}),
);

const patches = readdirSync(resolve(root, `${base}/audit/upstream-patches`), { recursive: true })
	.filter((name) => name.endsWith('.patch'))
	.sort()
	.map((name) => `${base}/audit/upstream-patches/${name}`);
const commonSupport = [
	`${base}/audit/upstream.lock.json`,
	`${base}/audit/provenance.json`,
	`${base}/audit/registrations.json`,
	`${base}/audit/crosswalk.json`,
	`${base}/scripts/update-audit.mjs`,
	`${base}/tests/harness.ts`,
	`${base}/tests/upstream-modules.ts`,
];
const laneFiles = {
	pristine: [`${base}/tests/pristine-registry.ts`, `${base}/tests/vitest.pristine.config.ts`],
	adapted: [
		`${base}/tests/adapted-registry.ts`,
		`${base}/tests/vitest.adapted.config.ts`,
		...patches,
	],
	'adapted-ssr': [
		`${base}/tests/adapted-registry.ts`,
		`${base}/tests/vitest.adapted.config.ts`,
		`${base}/tests/vitest.adapted-ssr.config.ts`,
		...patches,
	],
};
const notes = {
	pristine:
		'Runs all 22 pinned registrations byte-exact against React 19.2.7 and the hash-pinned npm artifact; the build-test configuration skips the one case gated to the React 17 shim.',
	adapted:
		'Runs the pinned Shared and Native suites, regenerated with import rewrites and divergence patches, against Octane and this binding.',
	'adapted-ssr':
		"Runs the pinned shim server-rendering case against Octane's server runtime and this binding.",
};
const divergence = (id, ids, fields) => ({ id, caseIds: ids, ...fields, owner: 'octanejs' });
await write(`${base}/audit/react-parity.json`, {
	schemaVersion: 1,
	provenance: {
		repo: 'https://github.com/react/react.git',
		version: lock.identity.version,
		commit: lock.identity.commit,
		sourceRoot: `${base}/upstream/src`,
		testRoot: `${base}/upstream/src/__tests__`,
		license: 'MIT',
		integrity: `sha256:${digest(`${base}/upstream-artifact/use-sync-external-store-${lock.identity.version}.tgz`)}`,
		verification: 'verified',
	},
	upstreamSuites: { runtime: 'present', types: 'absent' },
	materializedTests: base,
	adaptedRoots: {
		source: { roots: [`${base}/src`], include: ['\\.ts$'], exclude: [] },
		tests: { roots: [`${base}/tests/upstream`], include: ['-test\\.js$'], exclude: [] },
	},
	adaptedRuntimeSummary: {
		inventoryEntries: adaptedTests.length,
		uniqueIdentities: new Set(adaptedTests.map(({ id }) => id)).size,
		duplicateEntriesWithinLanes: 0,
		identitiesSharedAcrossLanes: 0,
	},
	environments: {
		'workspace-node': {
			node: '>=22',
			platform: 'any',
			arch: 'any',
			packageManager: 'pnpm@12.9.1',
			lockfile: 'pnpm-lock.yaml',
			lockfileSha256: digest('pnpm-lock.yaml'),
		},
	},
	lanes: lanes.map((lane) => ({
		id: `use-sync-external-store-${lane.kind}-full`,
		type: lane.kind === 'pristine' ? 'pristine-upstream' : 'adapted-octane',
		oracle: 'required',
		environment: 'workspace-node',
		project: lane.project,
		evidenceOrigin: 'upstream-suite',
		execution: { kind: 'vitest-full', inventory: `${base}/audit/${lane.kind}-runtime.json` },
		notes: notes[lane.kind],
		files: [
			`${base}/audit/${lane.kind}-runtime.json`,
			...commonSupport,
			...laneFiles[lane.kind],
		].map(support),
	})),
	divergences: [
		divergence(
			'error-boundary-component',
			caseIds('selector can throw on update', 'isEqual can throw on update'),
			{
				upstreamResult:
					'The cases catch render errors with a class component using getDerivedStateFromError.',
				octaneResult:
					"The adaptation catches them with Octane's ErrorBoundary and the same fallback text.",
				rationale: 'Octane has no class components; ErrorBoundary is its catch-only boundary.',
				classification: 'framework-component-model',
				consumerImpact:
					'None for this binding; boundaries are authored as ErrorBoundary or @try/@catch.',
				migrationGuidance: 'Replace class error boundaries with ErrorBoundary or @try/@catch.',
				reviewCondition: 'Revisit if Octane adds class components.',
			},
		),
		divergence('getsnapshot-error-render', caseIds('handles errors thrown by getSnapshot'), {
			upstreamResult:
				"A class boundary held by a createRef ref catches the error, and React's concurrent root renders the tree that threw a second time, so the fallback logs twice.",
			octaneResult:
				"Octane's ErrorBoundary catches it with a {current} ref, and its fallback renders once, as React 17 legacy roots and the upstream shim variant do.",
			rationale:
				'Octane has no class components or createRef, and renders synchronously without retrying a render that threw to attempt recovery.',
			classification: 'scheduler-model',
			consumerImpact: 'An erroring store selector is called one fewer time.',
			migrationGuidance: 'Do not depend on the number of renders of an erroring tree.',
			reviewCondition: "Revisit if Octane adopts React's concurrent error recovery.",
		}),
		divergence(
			'octane-diagnostics',
			caseIds('Infinite loop if getSnapshot keeps returning new reference'),
			{
				upstreamResult:
					"React's uncached-snapshot warning and update-depth error use React's wording.",
				octaneResult: 'Octane reports the same two conditions in its own wording.',
				rationale: 'Octane words its own diagnostics.',
				classification: 'diagnostics',
				consumerImpact: 'Code matching React message text must match Octane text instead.',
				migrationGuidance: 'Match on the condition, not on the message text.',
				reviewCondition: 'Revisit if Octane adopts React message text.',
			},
		),
		divergence('foreign-server-markup', caseIds('basic server hydration'), {
			upstreamResult:
				'React hydrates hand-written <div>server</div>, reading getServerSnapshot first and adopting the div held by a createRef ref.',
			octaneResult:
				'Octane renders that root on the client and reports error #348 through onRecoverableError. tests/conformance.test.ts hydrates Octane server output: server snapshot first, then the client state, adopting the server DOM.',
			rationale:
				'Octane adopts only markup written by its own server renderer, identified by its hydration protocol comment. It has no createRef; any {current} object is a ref.',
			classification: 'ssr-hydration',
			consumerImpact: 'Server HTML from another renderer is replaced rather than adopted.',
			migrationGuidance: 'Render the server HTML with octane/server.',
			reviewCondition: 'Revisit if Octane adopts markup without its hydration protocol.',
		}),
		divergence('noop-renderer-host', nativeCaseIds, {
			upstreamResult: 'The native cases render through react-noop-renderer in a Node environment.',
			octaneResult: "The adaptation renders through Octane's client root in a DOM environment.",
			rationale:
				'Octane resolves its client runtime only in a DOM environment; the noop renderer has no Octane counterpart.',
			classification: 'test-harness',
			consumerImpact: 'None; React Native is not an Octane target.',
			migrationGuidance: 'None.',
			reviewCondition: 'Revisit if Octane gains a host-agnostic test renderer.',
		}),
		divergence('built-in-shim', caseIds('basic server render'), {
			upstreamResult:
				"With React's built-in hook removed, the shim's server fallback ignores getServerSnapshot, and renderToString returns 'client'.",
			octaneResult:
				"The shim is Octane's built-in hook, which renders getServerSnapshot; renderToStaticMarkup returns {html: 'server'}.",
			rationale:
				"The userspace fallback serves only React 16 and 17; Octane always has the built-in hook, which the published shim also selects on React 18+. Octane's server renderers return a result object, and only static markup omits hydration ranges.",
			classification: 'framework-component-model',
			consumerImpact: 'Server rendering through /shim uses getServerSnapshot, as on React 18+.',
			migrationGuidance: 'Pass getServerSnapshot for content that must match the client.',
			reviewCondition: 'None while Octane exports a built-in useSyncExternalStore.',
		}),
	],
});
