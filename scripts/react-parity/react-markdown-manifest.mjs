#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const sha256 = (path) =>
	createHash('sha256')
		.update(readFileSync(resolve(root, path)))
		.digest('hex');
const support = (path) => ({ path, role: 'support', sha256: sha256(path) });
const test = (path, cases) => ({ path, role: 'test', sha256: sha256(path), cases });
const adaptedRuntimeCount = JSON.parse(
	readFileSync(resolve(root, 'packages/markdown/audit/adapted-runtime.json'), 'utf8'),
).tests.length;

const manifest = {
	$schema: '../../hook-form/audit/react-parity.schema.json',
	schemaVersion: 1,
	provenance: {
		repo: 'https://github.com/remarkjs/react-markdown.git',
		version: '10.1.0',
		commit: '44d2e4a44b37461ab7778d6870c1a9eb36393ad2',
		sourceRoot: 'lib',
		testRoot: 'test.jsx',
		license: 'MIT',
		integrity: 'sha256:205f5c607c68e1e42b8d7a036326bdb3a105ae55e6469ecfcaf998004609d5f7',
		verification: 'verified',
	},
	upstreamSuites: { runtime: 'present', types: 'absent' },
	adaptedRoots: {
		source: {
			roots: ['packages/markdown/src'],
			include: ['\\.(?:[cm]?[jt]s|[jt]sx|tsrx)$'],
			exclude: [],
		},
		tests: {
			roots: ['packages/markdown/tests'],
			include: ['\\.(?:test|spec)\\.(?:[cm]?[jt]s|[jt]sx|tsrx)$'],
			exclude: [
				'packages/markdown/tests/pristine/',
				'packages/markdown/tests/adoption/',
				'packages/markdown/tests/audit/',
				'packages/markdown/tests/probes/',
				'packages/markdown/tests/hydration/',
				'packages/markdown/tests/ssr/',
				'packages/markdown/tests/parity/',
				'\\.local\\.',
			],
		},
	},
	adaptedRuntimeSummary: {
		inventoryEntries: adaptedRuntimeCount,
		uniqueIdentities: adaptedRuntimeCount,
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
			lockfileSha256: sha256('pnpm-lock.yaml'),
		},
	},
	lanes: [
		{
			id: 'react-markdown-pristine-runtime',
			type: 'pristine-upstream',
			oracle: 'required',
			environment: 'workspace-node',
			project: 'node:test',
			evidenceOrigin: 'upstream-suite',
			notes:
				'Executes the vendored test.jsx byte-for-byte with Node test, the pinned JSX loader, React 19.0.0, and every declared upstream test dependency; all 87 leaf assertions and interactions must pass.',
			execution: {
				kind: 'node-full',
				root: 'packages/markdown/upstream/source',
				file: 'packages/markdown/upstream/source/test.jsx',
				loader: 'packages/markdown/upstream/source/script/load-jsx.js',
				inventory: 'packages/markdown/audit/pristine-runtime.json',
			},
			files: [
				support('packages/markdown/audit/test-inventory.json'),
				support('packages/markdown/audit/pristine-runtime.json'),
				support('packages/markdown/upstream/source/test.jsx'),
				support('packages/markdown/upstream/source/script/load-jsx.js'),
				support('packages/markdown/upstream/source/package.json'),
				support('scripts/react-parity/node-full-runner.mjs'),
			],
		},
		{
			id: 'react-markdown-adapted-runtime',
			type: 'adapted-octane',
			oracle: 'required',
			environment: 'workspace-node',
			project: 'markdown',
			evidenceOrigin: 'upstream-suite',
			notes:
				'Executes the one-for-one adapted Octane counterparts of the 87 upstream test.jsx identities with exact collected and executed identities.',
			execution: {
				kind: 'vitest-full',
				inventory: 'packages/markdown/audit/adapted-runtime.json',
			},
			files: [
				support('packages/markdown/audit/adapted-runtime.json'),
				support('packages/markdown/audit/adapted-case-crosswalk.json'),
				support('scripts/react-parity/react-markdown-runtime-inventory.mjs'),
				support('scripts/react-parity/react-markdown-crosswalk.mjs'),
				support('vitest.config.js'),
			],
		},
		{
			id: 'react-markdown-differential',
			type: 'differential',
			oracle: 'required',
			environment: 'workspace-node',
			project: 'markdown-differential',
			evidenceOrigin: 'repo-authored',
			notes:
				'Runs the same Markdown and URL fixtures through pristine React and Octane public entry points.',
			files: [
				test('packages/markdown/tests/parity/differential.test.ts', [
					{
						id: 'react-markdown:differential:sync',
						testName: 'sync Markdown output matches pristine React',
						fullName: 'sync Markdown output matches pristine React',
					},
					{
						id: 'react-markdown:differential:unsafe-url',
						testName: 'unsafe URL filtering matches pristine React',
						fullName: 'unsafe URL filtering matches pristine React',
					},
					{
						id: 'react-markdown:differential:image-preload',
						testName: 'image markup matches apart from React framework preloading',
						fullName: 'image markup matches apart from React framework preloading',
					},
				]),
			],
		},
		{
			id: 'react-markdown-pristine-types',
			type: 'pristine-types',
			oracle: 'required',
			environment: 'workspace-node',
			project: 'react-markdown-pristine-types',
			evidenceOrigin: 'repo-authored',
			notes:
				'Repo-authored React declaration probes against pinned react-markdown 10.1.0, including negative controls, with file/assertion-group inventory and permitted-transformation verification.',
			execution: {
				kind: 'typescript',
				compiler: 'tsc',
				project: 'packages/markdown/audit/type-probes/tsconfig.pristine.json',
			},
			files: [
				test('packages/markdown/audit/pristine-types.json', [
					{
						id: 'types:react-markdown-pristine',
						testName: 'pinned React declaration probes',
						fullName: 'pinned React declaration probes',
					},
				]),
				support('packages/markdown/audit/type-probes/public-api.test-d.ts'),
				support('packages/markdown/audit/type-probes/tsconfig.pristine.json'),
				support('packages/markdown/audit/type-parity.json'),
			],
		},
		{
			id: 'react-markdown-adapted-types',
			type: 'adapted-types',
			oracle: 'required',
			environment: 'workspace-node',
			project: 'react-markdown-adapted-types',
			evidenceOrigin: 'repo-authored',
			notes:
				'One-for-one Octane public type probes with matching negative controls after permitted renderable-type transformations; dedicated typetest project only.',
			execution: {
				kind: 'typescript',
				compiler: 'tsrx-tsc',
				project: 'packages/markdown/typetests/tsconfig.json',
			},
			files: [
				test('packages/markdown/audit/adapted-types.json', [
					{
						id: 'types:react-markdown-adapted',
						testName: 'adapted Octane declaration probes',
						fullName: 'adapted Octane declaration probes',
					},
				]),
				support('packages/markdown/typetests/public-api.test-d.ts'),
				support('packages/markdown/typetests/tsconfig.json'),
				support('packages/markdown/audit/type-parity.json'),
				support('scripts/react-parity/react-markdown-types-lib.mjs'),
			],
		},
	],
	divergences: [
		{
			id: 'react-markdown-react-image-preload',
			caseIds: ['react-markdown:differential:image-preload'],
			upstreamResult:
				'React 19 server rendering inserts an image preload link before Markdown image markup.',
			octaneResult:
				'Octane renders the equivalent image element without React framework-managed preloading.',
			rationale:
				'Automatic resource hint insertion belongs to the framework renderer rather than react-markdown.',
			classification: 'server-rendering',
			consumerImpact: 'Raw server markup lacks React 19 automatic image preload hints.',
			migrationGuidance:
				'Add an explicit preload hint when an above-the-fold Markdown image requires one.',
			owner: 'octane',
			reviewCondition: 'Review if Octane adds renderer-managed image resource hints.',
		},
		{
			id: 'react-markdown-async-sync-render',
			caseIds: ['runtime:0c41907154f06242'],
			upstreamResult:
				"React's synchronous renderer throws when MarkdownAsync suspends during renderToStaticMarkup.",
			octaneResult:
				'MarkdownAsync returns a Promise<ElementDescriptor> that resolves to ordinary Octane output.',
			rationale:
				'Octane has no React Suspense boundary for sync render of an async Markdown entry; the public call site is awaitable instead.',
			classification: 'execution-model',
			consumerImpact:
				'Callers must await MarkdownAsync rather than treating it as a sync React element that suspends.',
			migrationGuidance:
				'Await MarkdownAsync (or stream through Octane SSR) instead of renderToStaticMarkup.',
			owner: 'octane',
			reviewCondition: 'Review if Octane adds a sync Suspense path for async Markdown.',
		},
	],
};

const destination = resolve(root, 'packages/markdown/audit/react-parity.json');
writeFileSync(
	destination,
	await format(JSON.stringify(manifest), {
		...(await resolveConfig(destination)),
		filepath: destination,
	}),
);
console.log('packages/markdown/audit/react-parity.json');
