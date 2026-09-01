import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import {
	createPackedJavascriptConsumerManifest,
	assertPackedTsrxConsumerSucceeded,
	createPackedExampleManifest,
	createPackedTsrxConsumerConfig,
	resolvePackedTsrxSourceDirectories,
	createPackedTsrxConsumerManifest,
	findPackedTsrxSourceConsumerPackages,
	findPackedTsrxSourceConsumerSpecifiers,
	findPackedTsrxBrowserSourceConsumerPackages,
	findPackedWorkspaceDependencyClosure,
	findExternalDependencySpecs,
	isForbiddenNativeGraphModule,
	isWithinDirectory,
	renderPackedExampleWorkspace,
	renderPackedCommonjsConsumerSource,
	renderPackedDraggableEsmConsumerSource,
	renderPackedEsmConsumerSource,
	renderPackedTsrxConsumerSource,
	renderPackedTsrxBrowserAmbientProbe,
	renderPackedTsrxSourceImports,
	renderPackedTsrxConsumerTypeProbe,
	renderPackedStrictBrowserConsumerTypeProbe,
	renderPackedStrictBrowserConsumerSource,
	PACKED_TSRX_CONSUMER_PROJECTS,
	PACKED_TSRX_BROWSER_AMBIENT_FILE,
	PACKED_TSRX_PROBE_PACKAGES,
	PACKED_TSRX_STRICT_BROWSER_PACKAGES,
} from './package-pack-canaries.mjs';

const repositoryRequire = createRequire(import.meta.url);

describe('packed JavaScript consumers', () => {
	const archiveSpecs = {
		'@octanejs/base-ui': 'file:/tmp/base-ui.tgz',
		'@octanejs/floating-ui': 'file:/tmp/floating-ui.tgz',
		'@octanejs/radix': 'file:/tmp/radix.tgz',
		'@octanejs/draggable': 'file:/tmp/react-draggable.tgz',
		octane: 'file:/tmp/octane.tgz',
	};

	test('installs exactly the complete JavaScript dependency closure', () => {
		assert.deepEqual(
			createPackedJavascriptConsumerManifest(archiveSpecs).dependencies,
			archiveSpecs,
		);
		assert.throws(
			() => createPackedJavascriptConsumerManifest({ ...archiveSpecs, octane: undefined }),
			/no packed archive was provided for octane/,
		);
	});

	test('requires every CommonJS package and executes Octane SSR', () => {
		const source = renderPackedCommonjsConsumerSource();
		assert.match(source, /require\('octane'\)/);
		assert.match(source, /require\('octane\/server'\)/);
		assert.match(source, /require\('@octanejs\/floating-ui'\)/);
		assert.match(source, /require\('@octanejs\/base-ui'\)/);
		assert.match(source, /require\('@octanejs\/radix'\)/);
		assert.doesNotMatch(source, /require\('@octanejs\/draggable'\)/);
		assert.match(source, /renderToString/);
	});

	test('imports the same package graph for the ESM parity probe', () => {
		const source = renderPackedEsmConsumerSource();
		assert.match(source, /from 'octane'/);
		assert.match(source, /from 'octane\/server'/);
		assert.match(source, /from '@octanejs\/floating-ui'/);
		assert.match(source, /from '@octanejs\/base-ui'/);
		assert.match(source, /from '@octanejs\/radix'/);
		assert.match(source, /renderToString/);
	});

	test('compiles the TSRX draggable ESM entry through the Octane toolchain', () => {
		const source = renderPackedDraggableEsmConsumerSource();
		assert.match(source, /from '@octanejs\/draggable'/);
		assert.match(source, /draggable\.DraggableCore/);
		assert.doesNotMatch(source, /node:/);
	});
});

describe('isForbiddenNativeGraphModule', () => {
	test('rejects built and source DOM or React runtime modules from native graphs', () => {
		for (const identifier of [
			'/app/node_modules/octane/dist/runtime.js',
			'/app/node_modules/octane/src/runtime.ts',
			'/app/node_modules/octane/dist/runtime.server.mjs',
			'/app/node_modules/octane/dist/universal-dom-boundary.js',
			'/app/node_modules/octane/src/dom-tables.js',
			'/app/node_modules/octane/src/hydration/index.ts',
			'/app/node_modules/react-dom/index.js',
			'C:\\app\\node_modules\\@lynx-js\\react\\runtime.js',
		]) {
			assert.equal(isForbiddenNativeGraphModule(identifier), true, identifier);
		}

		for (const identifier of [
			'/app/node_modules/octane/dist/universal-core.js',
			'/app/node_modules/octane/dist/universal-native.js',
			'/app/node_modules/octane/dist/profiling.js',
			'/app/src/runtime-utils.js',
		]) {
			assert.equal(isForbiddenNativeGraphModule(identifier), false, identifier);
		}
	});
});

describe('createPackedExampleManifest', () => {
	test('rewrites a real example for packed dependencies without mutating its source manifest', () => {
		const source = {
			name: 'example-app',
			dependencies: {
				'@octanejs/example-binding': 'workspace:*',
				external: '^1.0.0',
				octane: 'workspace:*',
			},
			devDependencies: {
				typescript: 'catalog:default',
				vite: 'catalog:default',
			},
			pnpm: { onlyBuiltDependencies: ['external'] },
		};
		const archiveSpecs = {
			'@octanejs/example-binding': 'file:/tmp/example-binding.tgz',
			octane: 'file:/tmp/octane.tgz',
		};

		const packed = createPackedExampleManifest(source, archiveSpecs, '8.0.16', 'Example');

		assert.deepEqual(packed.dependencies, {
			'@octanejs/example-binding': 'file:/tmp/example-binding.tgz',
			external: '^1.0.0',
			octane: 'file:/tmp/octane.tgz',
		});
		assert.deepEqual(packed.devDependencies, { vite: '8.0.16' });
		assert.equal(packed.pnpm, undefined);
		assert.equal(source.dependencies.octane, 'workspace:*');
		assert.equal(source.devDependencies.vite, 'catalog:default');
		assert.deepEqual(source.pnpm, { onlyBuiltDependencies: ['external'] });
	});

	test('rejects a workspace dependency omitted from the packed archive set', () => {
		assert.throws(
			() =>
				createPackedExampleManifest(
					{ dependencies: { octane: 'workspace:*' } },
					{},
					'8.0.16',
					'Example',
				),
			/package\.json\.dependencies\.octane: workspace:\*/,
		);
	});
});

describe('renderPackedExampleWorkspace', () => {
	test('pins transitive internal dependencies to the produced archives', () => {
		assert.equal(
			renderPackedExampleWorkspace({
				'@octanejs/app-core': 'file:/tmp/app-core.tgz',
				octane: 'file:/tmp/octane.tgz',
			}),
			`overrides:
  "@octanejs/app-core": "file:/tmp/app-core.tgz"
  "octane": "file:/tmp/octane.tgz"
`,
		);
	});
});

describe('packed TSRX source consumers', () => {
	const archiveSpecs = {
		'@octanejs/cmdk': 'file:/tmp/cmdk.tgz',
		'@octanejs/floating-ui': 'file:/tmp/floating-ui.tgz',
		'@octanejs/input-otp': 'file:/tmp/input-otp.tgz',
		'@octanejs/radix': 'file:/tmp/radix.tgz',
		'@octanejs/recharts': 'file:/tmp/recharts.tgz',
		'@octanejs/spring': 'file:/tmp/react-spring.tgz',
		'@octanejs/sonner': 'file:/tmp/sonner.tgz',
		'@octanejs/syntax-highlighter': 'file:/tmp/syntax-highlighter.tgz',
		'@octanejs/textarea-autosize': 'file:/tmp/react-textarea-autosize.tgz',
		'@octanejs/tiptap': 'file:/tmp/tiptap.tgz',
		octane: 'file:/tmp/octane.tgz',
	};
	const toolingVersions = {
		nodeTypes: '24.13.3',
		packageManager: 'pnpm@11.15.1',
		tsrxTypeScriptPlugin: '0.3.116',
		typescript: '5.9.3',
	};

	test('installs the real packed bindings and the pinned consumer TSRX tooling', () => {
		const manifest = createPackedTsrxConsumerManifest(
			archiveSpecs,
			toolingVersions,
			Object.keys(archiveSpecs),
			{ esrap: '^2.3.2' },
		);

		assert.deepEqual(manifest.dependencies, archiveSpecs);
		assert.deepEqual(manifest.devDependencies, {
			'@tsrx/typescript-plugin': '0.3.116',
			'@types/node': '24.13.3',
			esrap: '2.3.6',
			typescript: '5.9.3',
		});
		assert.equal(manifest.private, true);
		assert.equal(manifest.packageManager, 'pnpm@11.15.1');
	});

	test('rejects a published binding omitted from the packed archive set', () => {
		const { '@octanejs/tiptap': _missingTiptap, ...incompleteArchives } = archiveSpecs;

		assert.throws(
			() =>
				createPackedTsrxConsumerManifest(
					incompleteArchives,
					toolingVersions,
					Object.keys(archiveSpecs),
				),
			/no packed archive was provided for @octanejs\/tiptap/,
		);
	});

	test('typechecks TSRX with the Octane language plugin and full strict diagnostics', () => {
		const config = createPackedTsrxConsumerConfig({
			nodeTypes: true,
			sourcePackageDirectories: ['node_modules/@octanejs/jotai'],
		});

		assert.equal(config.compilerOptions.strict, true);
		assert.equal(config.compilerOptions.skipLibCheck, false);
		assert.equal(config.compilerOptions.jsx, 'react-jsx');
		assert.equal(config.compilerOptions.jsxImportSource, 'octane');
		assert.deepEqual(config.compilerOptions.lib, ['dom', 'dom.iterable', 'es2024']);
		assert.equal(config.compilerOptions.target, 'es2024');
		assert.deepEqual(config.compilerOptions.plugins, [{ name: '@tsrx/typescript-plugin' }]);
		assert.deepEqual(config.tsrx, { compiler: 'octane/compiler/volar' });
		assert.deepEqual(config.include, [
			'src/**/*.ts',
			'src/**/*.tsrx',
			'node_modules/@octanejs/jotai/**/*.tsrx',
		]);
		assert.equal(config.compilerOptions.paths, undefined);
	});

	test('uses canonical installed source roots without duplicating package symlinks', (context) => {
		const directory = mkdtempSync(path.join(tmpdir(), 'packed-source-roots-'));
		context.after(() => rmSync(directory, { recursive: true, force: true }));
		const packageDirectory = 'node_modules/.pnpm/source@file+archive/node_modules/@octanejs/source';
		const installedPackage = path.join(directory, packageDirectory);
		mkdirSync(installedPackage, { recursive: true });
		mkdirSync(path.join(directory, 'node_modules/@octanejs'), { recursive: true });
		for (const packageName of ['source', 'alias']) {
			symlinkSync(
				installedPackage,
				path.join(directory, 'node_modules/@octanejs', packageName),
				'junction',
			);
		}
		const sourcePackageDirectories = resolvePackedTsrxSourceDirectories(directory, [
			'@octanejs/source',
			'@octanejs/alias',
		]);
		const config = createPackedTsrxConsumerConfig({ sourcePackageDirectories });
		assert.deepEqual(config.include, [
			'src/**/*.ts',
			'src/**/*.tsrx',
			`${packageDirectory}/**/*.tsrx`,
		]);
	});

	test('also models browser consumers without Node ambient types', () => {
		const config = createPackedTsrxConsumerConfig({
			consumerSourceFiles: ['src/published-browser-source-imports.ts'],
			nodeTypes: false,
		});

		assert.deepEqual(config.compilerOptions.types, []);
		assert.deepEqual(config.include, [
			'src/published-browser-source-imports.ts',
			PACKED_TSRX_BROWSER_AMBIENT_FILE,
		]);
		assert.equal(config.compilerOptions.strict, true);
		assert.equal(config.compilerOptions.skipLibCheck, false);
		assert.deepEqual(config.tsrx, { compiler: 'octane/compiler/volar' });
	});

	test('rejects Node ambient types leaked by an imported declaration', async (context) => {
		const ts = (await import('typescript')).default;
		const directory = mkdtempSync(path.join(tmpdir(), 'packed-browser-ambient-'));
		context.after(() => rmSync(directory, { recursive: true, force: true }));
		mkdirSync(path.join(directory, 'src'));
		const nodeTypes = path.join(directory, 'node_modules/@types/node');
		mkdirSync(nodeTypes, { recursive: true });
		writeFileSync(
			path.join(nodeTypes, 'index.d.ts'),
			`declare const process: { env: { NODE_ENV?: string } };
declare const Buffer: { from(value: string): Uint8Array };
declare namespace NodeJS { interface Process { env: { NODE_ENV?: string } } }
`,
		);
		const source = path.join(directory, 'src/imports.ts');
		writeFileSync(source, 'export {};\n');
		const ambientProbe = path.join(directory, PACKED_TSRX_BROWSER_AMBIENT_FILE);
		writeFileSync(ambientProbe, renderPackedTsrxBrowserAmbientProbe());
		const config = ts.parseJsonConfigFileContent(
			createPackedTsrxConsumerConfig({
				consumerSourceFiles: ['src/imports.ts'],
				nodeTypes: false,
			}),
			ts.sys,
			directory,
		);
		const diagnostics = () =>
			ts.getPreEmitDiagnostics(ts.createProgram(config.fileNames, config.options));
		assert.deepEqual(diagnostics(), []);

		// A dependency can include Node's ambient declarations even with types: [].
		writeFileSync(source, '/// <reference types="node" />\nexport {};\n');
		assert.deepEqual(
			diagnostics().map(({ code, file }) => ({ code, file: file?.fileName })),
			Array.from({ length: 3 }, () => ({ code: 2578, file: ambientProbe })),
		);
	});

	test('adds an ESNext browser project for the strict consumer regressions', () => {
		assert.deepEqual(PACKED_TSRX_CONSUMER_PROJECTS, [
			'tsconfig.json',
			'tsconfig.browser.json',
			'tsconfig.strict-browser.json',
		]);
		const config = createPackedTsrxConsumerConfig({
			consumerSourceFiles: ['strict-browser/**/*'],
			ecmaVersion: 'esnext',
			nodeTypes: false,
		});
		assert.deepEqual(config.compilerOptions.lib, ['dom', 'dom.iterable', 'esnext']);
		assert.equal(config.compilerOptions.target, 'esnext');
		assert.deepEqual(config.compilerOptions.types, []);
		assert.deepEqual(config.include, ['strict-browser/**/*', PACKED_TSRX_BROWSER_AMBIENT_FILE]);
		const source = renderPackedStrictBrowserConsumerSource();
		assert.match(source, /<Provider\b/);
		assert.match(source, /<MemoryRouter\b/);
		assert.match(source, /<Group\b/);
		assert.match(source, /<BarChart\b/);
	});

	test('checks precise public contracts rather than only rejecting top-level any', () => {
		const source = renderPackedStrictBrowserConsumerTypeProbe();
		for (const packageName of PACKED_TSRX_STRICT_BROWSER_PACKAGES) {
			assert.ok(
				source.includes(`from '${packageName}${packageName.endsWith('/visx') ? '/group' : ''}'`),
			);
		}
		assert.match(source, /AssertNotAny<BarProps\['dataKey'\]>/);
		assert.match(source, /AssertNotAny<BarShapeProps\['x'\]>/);
		assert.match(source, /invalidBarComponent: Parameters<typeof Bar>\[0\]/);
		assert.match(source, /nativeTarget: SVGGElement = event.currentTarget/);
		assert.match(source, /event\.nativeEvent/);
		assert.match(source, /setCount\('not-a-number'\)/);
		assert.match(source, /invalidSelection: string = selected/);
		assert.match(source, /invalidGroupOffset/);
		assert.match(source, /invalidFormRef/);
		assert.match(source, /invalidNavLinkRef/);
		assert.match(source, /Parameters<typeof Bar<Datum, number>>/);
	});

	test('rejects TSRX parser diagnostics even when the checker exits successfully', () => {
		const diagnostic =
			'[tsrx-tsc] node_modules/@octanejs/source/src/Component.tsrx: Add a trailing comma, as in `<T,>() => ...`.\n';
		for (const stream of ['stdout', 'stderr']) {
			assert.throws(
				() => assertPackedTsrxConsumerSucceeded({ status: 0, [stream]: diagnostic }, 'browser'),
				/Component\.tsrx: Add a trailing comma/,
			);
		}
		assert.doesNotThrow(() =>
			assertPackedTsrxConsumerSucceeded({ status: 0, stdout: 'Typecheck completed.\n' }, 'browser'),
		);
		assert.throws(
			() =>
				assertPackedTsrxConsumerSucceeded(
					{ status: 2, stdout: 'error TS2322: invalid prop' },
					'browser',
				),
			/TS2322: invalid prop/,
		);
	});

	test('keeps declaration-only probe packages installed independently of source enrollment', () => {
		assert.ok(PACKED_TSRX_PROBE_PACKAGES.includes('@octanejs/recharts'));
		assert.ok(PACKED_TSRX_PROBE_PACKAGES.includes('octane'));
	});

	test('discovers every published framework binding containing TSRX', () => {
		const packages = [
			{ name: '@octanejs/plain', private: false, role: 'framework binding' },
			{ name: '@octanejs/source', private: false, role: 'framework binding' },
			{ name: '@octanejs/private', private: true, role: 'framework binding' },
			{ name: '@octanejs/integration', private: false, role: 'framework integration' },
		];
		const packedFiles = new Map([
			['@octanejs/plain', new Set(['src/index.ts'])],
			['@octanejs/source', new Set(['src/index.ts', 'src/Component.tsrx'])],
			['@octanejs/private', new Set(['src/Component.tsrx'])],
			['@octanejs/integration', new Set(['src/Component.tsrx'])],
		]);

		assert.deepEqual(findPackedTsrxSourceConsumerPackages(packages, packedFiles), [
			'@octanejs/source',
			'octane',
		]);
		assert.deepEqual(
			findPackedTsrxSourceConsumerPackages(packages, packedFiles, new Set(['@octanejs/source'])),
			['octane'],
		);
	});

	test('installs the complete packed workspace dependency closure', () => {
		const manifests = new Map([
			['@octanejs/source', { dependencies: { '@octanejs/helper': '1.0.0' } }],
			['@octanejs/helper', { optionalDependencies: { '@octanejs/optional': '1.0.0' } }],
			['@octanejs/optional', { peerDependencies: { octane: '1.0.0', redux: '5.0.0' } }],
			['octane', {}],
		]);

		assert.deepEqual(
			findPackedWorkspaceDependencyClosure(manifests, ['@octanejs/source', 'octane']),
			['@octanejs/helper', '@octanejs/optional', '@octanejs/source', 'octane'],
		);
	});

	test('excludes Node-only packages and their dependants from the browser source consumer', () => {
		const manifests = new Map([
			['@octanejs/browser', {}],
			['@octanejs/node-only', { octane: { sourceEnvironment: 'node' } }],
			['@octanejs/node-dependent', { dependencies: { '@octanejs/node-only': '1.0.0' } }],
			['@octanejs/deferred', {}],
		]);

		assert.deepEqual(
			findPackedTsrxBrowserSourceConsumerPackages(
				manifests,
				[
					'@octanejs/browser',
					'@octanejs/node-only',
					'@octanejs/node-dependent',
					'@octanejs/deferred',
				],
				new Set(['@octanejs/deferred']),
			),
			['@octanejs/browser'],
		);
	});

	test('keeps the published email renderer out of the browser source consumer', () => {
		const emailManifest = repositoryRequire('../packages/email/package.json');
		const manifests = new Map([
			['@octanejs/email', emailManifest],
			['octane', {}],
		]);

		assert.deepEqual(
			findPackedTsrxBrowserSourceConsumerPackages(manifests, ['@octanejs/email']),
			[],
		);
	});

	test('promotes external dependencies and optional peers into the consumer', () => {
		const manifests = new Map([
			[
				'@octanejs/source',
				{
					dependencies: { '@octanejs/helper': '1.0.0', concrete: '2.0.0' },
					peerDependencies: { concrete: '^2.0.0', peer: '^3.0.0' },
				},
			],
			[
				'@octanejs/helper',
				{ optionalDependencies: { optional: '4.0.0' }, peerDependencies: { peer: '>=3' } },
			],
		]);

		assert.deepEqual(
			findExternalDependencySpecs(manifests, ['@octanejs/source', '@octanejs/helper']),
			{ concrete: '2.0.0', optional: '4.0.0', peer: '^3.0.0' },
		);
	});

	test('imports each discovered package root through its published type entry', () => {
		assert.equal(
			renderPackedTsrxSourceImports(['@octanejs/jotai', '@octanejs/redux']),
			"import '@octanejs/jotai';\nimport '@octanejs/redux';\n",
		);
	});

	test('discovers rootless public TSRX subpaths from the packed manifest', () => {
		assert.deepEqual(
			findPackedTsrxSourceConsumerSpecifiers(
				'@octanejs/components',
				{
					exports: {
						'./Button': './src/Button.tsrx',
						'./theme.css': './src/theme.css',
						'./package.json': './package.json',
					},
				},
				new Set(['src/Button.tsrx', 'src/theme.css']),
			),
			['@octanejs/components/Button'],
		);
	});

	test('discovers source entry points that expose separate public subpath graphs', () => {
		assert.deepEqual(
			findPackedTsrxSourceConsumerSpecifiers(
				'@octanejs/components',
				{
					exports: {
						'.': './src/index.ts',
						'./utils': './src/utils.ts',
						'./server': { types: './src/server.d.ts', default: './src/server.js' },
						'./Button': './src/Button.tsrx',
						'./theme.css': './src/theme.css',
						'./package.json': './package.json',
					},
				},
				new Set([
					'src/index.ts',
					'src/utils.ts',
					'src/server.d.ts',
					'src/server.js',
					'src/Button.tsrx',
				]),
			),
			[
				'@octanejs/components',
				'@octanejs/components/utils',
				'@octanejs/components/server',
				'@octanejs/components/Button',
			],
		);
	});

	test('exercises the published bindings from a real local TSRX component', () => {
		const source = renderPackedTsrxConsumerSource();

		assert.match(source, /from '@octanejs\/cmdk'/);
		assert.match(source, /from '@octanejs\/input-otp'/);
		assert.match(source, /from '@octanejs\/recharts'/);
		assert.match(source, /from '@octanejs\/sonner'/);
		assert.match(source, /from '@octanejs\/spring'/);
		assert.match(source, /from '@octanejs\/spring\/parallax'/);
		assert.match(source, /from '@octanejs\/syntax-highlighter'/);
		assert.match(source, /from '@octanejs\/textarea-autosize'/);
		assert.match(source, /from '@octanejs\/tiptap'/);
		assert.match(source, /<Command\b/);
		assert.match(source, /<OTPInput\b/);
		assert.match(source, /<BarChart\b/);
		assert.match(source, /<Toaster\b/);
		assert.match(source, /<animated\.div\b/);
		assert.match(source, /<Parallax\b/);
		assert.match(source, /<Light\b/);
		assert.match(source, /<TextareaAutosize\b/);
		assert.match(source, /<EditorProvider\b/);
		assert.match(source, /<Tiptap\b/);
	});

	test('rejects erased component props and invalid published consumer contracts', () => {
		const source = renderPackedTsrxConsumerTypeProbe();

		assert.match(source, /type IsAny<T>/);
		assert.match(source, /AssertNotAny<CommandProps>/);
		assert.match(source, /AssertNotAny<BarProps>/);
		assert.match(source, /AssertNotAny<Parameters<typeof Bar>\[0\]>/);
		assert.match(source, /AssertNotAny<Parameters<typeof BarChart>\[0\]>/);
		assert.match(source, /AssertNotAny<typeof Cell>/);
		assert.match(source, /AssertNotAny<typeof ErrorBar>/);
		assert.match(source, /AssertNotAny<typeof Layer>/);
		assert.match(source, /AssertNotAny<typeof Surface>/);
		assert.match(source, /AssertNotAny<typeof useChartWidth>/);
		assert.match(source, /@ts-expect-error Brush is not supported/);
		assert.match(source, /@ts-expect-error Treemap is not supported/);
		assert.match(source, /AssertNotAny<OTPInputProps>/);
		assert.match(source, /AssertNotAny<Parameters<typeof Command>\[0\]>/);
		assert.match(source, /AssertNotAny<ToasterProps>/);
		assert.match(source, /AssertNotAny<Parameters<typeof Toaster>\[0\]>/);
		assert.match(source, /AssertNotAny<EditorContentProps>/);
		assert.match(source, /AssertNotAny<SpringValue<number>>/);
		assert.match(source, /AssertNotAny<ParallaxProps>/);
		assert.match(source, /AssertNotAny<SyntaxHighlighterProps>/);
		assert.match(source, /AssertNotAny<TextareaAutosizeProps>/);
		assert.match(source, /AssertNotAny<Parameters<typeof EditorContent>\[0\]>/);
		assert.match(source, /--consumer-offset/);
		assert.match(source, /@ts-expect-error/g);
	});
});

describe('isWithinDirectory', () => {
	test('distinguishes workspace entries from similarly prefixed external paths', () => {
		const workspace = path.join(path.sep, 'repo', 'octane');
		assert.equal(isWithinDirectory(workspace, path.join(workspace, 'packages', 'octane')), true);
		assert.equal(isWithinDirectory(workspace, path.join(path.sep, 'repo', 'octane-copy')), false);
	});
});
