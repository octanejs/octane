#!/usr/bin/env node
/**
 * Build the React parity evidence for the five legacy dnd kit bindings
 * (@octanejs/dnd-kit-{utilities,accessibility,core,sortable,modifiers}):
 * the pristine and adapted upstream runtime inventories, collected from the
 * live Vitest projects, and each package's audit/react-parity.json.
 *
 * Usage: node scripts/react-parity/dnd-kit-legacy-manifest.mjs
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { collectVitestTests } from './collect-vitest-tests.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const COMMIT = 'e9215e820798459ae036896fce7fd9a6fe855772';
const RIG = 'packages/octane/tests/differential/_rig.ts';
const REACT_FIXTURE = 'packages/dnd-kit-core/tests/differential/_react-fixture.ts';

/** Version and npm tarball SHA-256 of each pinned upstream package. */
const PACKAGES = {
	utilities: {
		version: '3.2.2',
		tarball: '048c7f56d17ceae19a29979700582566c0036600ee4d2c38ba13e9e8f906a18e',
		testRoot: 'packages/utilities/src/test',
	},
	accessibility: {
		version: '3.1.1',
		tarball: '5c4e4168454bc38e0ae6d95b00931bad8a4eda487760e36460217387a0b31450',
		testRoot: 'packages/accessibility/test',
	},
	core: {
		version: '6.3.1',
		tarball: 'f68d69af50234872c2e3345bc8bf98d8bcb0a9481eab6d370605c99e76a98c33',
		testRoot: 'packages/core/test',
	},
	sortable: {
		version: '10.0.0',
		tarball: '07d017cb1e84bfad0687c5415594cb3e4a8045cc7edfa9066cadda5e5323f604',
		testRoot: 'packages/sortable/test',
	},
	modifiers: {
		version: '9.0.0',
		tarball: '1ad2f9ecf7b65bd58de367c7b9226b62951916ca2694ad66440a3c8978ebdc29',
		testRoot: 'packages/modifiers/test',
	},
};

const NATIVE_EVENTS_TEST = 'packages/dnd-kit-core/tests/native-events.test.ts';

const sha256 = (path) =>
	createHash('sha256')
		.update(readFileSync(resolve(root, path)))
		.digest('hex');
const support = (path) => ({ path, role: 'support', sha256: sha256(path) });

/** Every `// @parity-case <id>` marker and the `it(...)` title that follows it. */
function parityCases(path) {
	const source = readFileSync(resolve(root, path), 'utf8');
	const suite = /describe\('([^']+)'/.exec(source)?.[1];
	return [...source.matchAll(/\/\/ @parity-case (\S+)\n\s*it\(\s*'([^']+)'/g)].map(
		([, id, testName]) => ({ id, testName, fullName: suite ? `${suite} ${testName}` : testName }),
	);
}

async function inventory(project, roots) {
	const tests = (await collectVitestTests(root, project))
		.map((test) => ({
			file: relative(root, test.file),
			fullName: test.name.replaceAll(' > ', ' '),
		}))
		.sort((a, b) => a.file.localeCompare(b.file) || a.fullName.localeCompare(b.fullName));
	return {
		schemaVersion: 1,
		project,
		roots,
		files: [...new Set(tests.map((test) => test.file))],
		tests: tests.map((test) => ({
			id: `runtime:${createHash('sha256')
				.update(`${project}\0${test.file}\0${test.fullName}`)
				.digest('hex')
				.slice(0, 16)}`,
			...test,
		})),
	};
}

async function writeJson(path, value) {
	const destination = resolve(root, path);
	writeFileSync(
		destination,
		await format(JSON.stringify(value), {
			...(await resolveConfig(destination)),
			filepath: destination,
		}),
	);
	console.log(path);
}

for (const [name, upstream] of Object.entries(PACKAGES)) {
	const dir = `packages/dnd-kit-${name}`;
	const testRoots = [`${dir}/tests/upstream`];
	const pristinePath = `${dir}/audit/pristine-runtime.json`;
	const adaptedPath = `${dir}/audit/adapted-runtime.json`;
	const adapted = await inventory(`dnd-kit-${name}-upstream`, testRoots);
	await writeJson(pristinePath, await inventory(`dnd-kit-${name}-pristine`, [`${dir}/upstream`]));
	await writeJson(adaptedPath, adapted);

	const differentialFiles = readdirSync(resolve(root, dir, 'tests/differential'))
		.filter((file) => file.endsWith('.test.ts'))
		.sort()
		.map((file) => `${dir}/tests/differential/${file}`);
	const lock = support(`${dir}/audit/upstream.lock.json`);
	const divergences = [];
	if (name === 'core') {
		const [nativeCase] = parityCases(NATIVE_EVENTS_TEST);
		divergences.push({
			id: 'native-activator-events',
			caseIds: [nativeCase.id],
			ordinaryEvidence: [
				{ ...nativeCase, path: NATIVE_EVENTS_TEST, sha256: sha256(NATIVE_EVENTS_TEST) },
			],
			upstreamResult:
				'Sensor activator handlers receive a React SyntheticEvent; built-in sensors read event.nativeEvent.',
			octaneResult:
				'Sensor activator handlers receive the native DOM event, and the built-in sensors read it directly.',
			rationale:
				'Octane delivers native delegated events with no synthetic layer, so there is no nativeEvent wrapper to unwrap.',
			classification: 'event-model',
			consumerImpact:
				'A custom sensor whose activator destructures { nativeEvent } from its event reads undefined.',
			migrationGuidance:
				'Read the activator event directly: (event: PointerEvent) => event.isPrimary instead of ({ nativeEvent }) => nativeEvent.isPrimary.',
			owner: 'octane',
			reviewCondition: 'Review if Octane adds a synthetic event layer.',
		});
	}

	await writeJson(`${dir}/audit/react-parity.json`, {
		$schema: '../../hook-form/audit/react-parity.schema.json',
		schemaVersion: 1,
		materializedTests: dir,
		provenance: {
			repo: 'https://github.com/clauderic/dnd-kit.git',
			version: upstream.version,
			commit: COMMIT,
			sourceRoot: `packages/${name}/src`,
			testRoot: upstream.testRoot,
			license: 'MIT',
			integrity: `sha256:${upstream.tarball}`,
			verification: 'recorded-unverified',
		},
		// Upstream ships placeholder suites (plus two modifier cases), so the
		// repo-authored differential lane carries the behavioral contract.
		upstreamSuites: { runtime: 'insufficient', types: 'absent' },
		adaptedRoots: {
			source: { roots: [`${dir}/src`], include: ['\\.(?:ts|tsx)$'], exclude: [] },
			tests: { roots: testRoots, include: ['\\.test\\.(?:ts|tsx)$'], exclude: [] },
		},
		adaptedRuntimeSummary: {
			inventoryEntries: adapted.tests.length,
			uniqueIdentities: adapted.tests.length,
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
				lockfileSha256: sha256('pnpm-lock.yaml'),
			},
		},
		lanes: [
			{
				id: `dnd-kit-${name}-pristine-upstream`,
				type: 'pristine-upstream',
				oracle: 'required',
				environment: 'workspace-node',
				project: `dnd-kit-${name}-pristine`,
				evidenceOrigin: 'upstream-suite',
				notes: `Runs the pinned @dnd-kit/${name}@${upstream.version} Jest suite unchanged, with Vitest globals, against the pinned source and the published React packages.`,
				execution: { kind: 'vitest-full', inventory: pristinePath },
				files: [support(pristinePath), lock],
			},
			{
				id: `dnd-kit-${name}-adapted-upstream`,
				type: 'adapted-octane',
				oracle: 'required',
				environment: 'workspace-node',
				project: `dnd-kit-${name}-upstream`,
				evidenceOrigin: 'upstream-suite',
				notes: `Regenerates the same suite from the lock with its imports repointed at @octanejs/dnd-kit-${name} and runs it against the port.`,
				execution: { kind: 'vitest-full', inventory: adaptedPath },
				files: [support(adaptedPath), lock],
			},
			{
				id: `dnd-kit-${name}-differential`,
				type: 'differential',
				oracle: 'required',
				environment: 'workspace-node',
				project: `dnd-kit-${name}-differential`,
				evidenceOrigin: 'repo-authored',
				notes: `Runs the same authored fixtures and interactions through @octanejs/dnd-kit-${name} and the published @dnd-kit/${name}@${upstream.version} on React and compares the DOM after every step.`,
				files: [
					...differentialFiles.map((path) => ({
						path,
						role: 'test',
						sha256: sha256(path),
						cases: parityCases(path),
					})),
					support(`${dir}/tests/_fixtures/differential.tsrx`),
					support(`${dir}/tests/differential/_setup.ts`),
					support(REACT_FIXTURE),
					support(`${dir}/audit/test-classifications.json`),
					support(RIG),
				],
			},
		],
		divergences,
	});
}
