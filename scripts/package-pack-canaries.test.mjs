import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, test } from 'node:test';
import {
	createPackedCommonjsConsumerManifest,
	createPackedExampleManifest,
	createPackedTsrxConsumerConfig,
	createPackedTsrxConsumerManifest,
	isForbiddenNativeGraphModule,
	isWithinDirectory,
	renderPackedExampleWorkspace,
	renderPackedCommonjsConsumerSource,
	renderPackedDraggableEsmConsumerSource,
	renderPackedEsmConsumerSource,
	renderPackedTsrxConsumerSource,
	renderPackedTsrxConsumerTypeProbe,
} from './package-pack-canaries.mjs';

describe('packed CommonJS consumer', () => {
	const archiveSpecs = {
		'@octanejs/base-ui': 'file:/tmp/base-ui.tgz',
		'@octanejs/floating-ui': 'file:/tmp/floating-ui.tgz',
		'@octanejs/radix': 'file:/tmp/radix.tgz',
		'@octanejs/react-draggable': 'file:/tmp/react-draggable.tgz',
		octane: 'file:/tmp/octane.tgz',
	};

	test('installs exactly the complete CommonJS dependency closure', () => {
		assert.deepEqual(createPackedCommonjsConsumerManifest(archiveSpecs).dependencies, archiveSpecs);
		assert.throws(
			() => createPackedCommonjsConsumerManifest({ ...archiveSpecs, octane: undefined }),
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
		assert.match(source, /require\('@octanejs\/react-draggable'\)/);
		assert.match(source, /draggable\.default, draggable/);
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
		assert.match(source, /from '@octanejs\/react-draggable'/);
		assert.match(source, /draggable\.DraggableCore/);
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
		'@octanejs/react-spring': 'file:/tmp/react-spring.tgz',
		'@octanejs/sonner': 'file:/tmp/sonner.tgz',
		'@octanejs/syntax-highlighter': 'file:/tmp/syntax-highlighter.tgz',
		'@octanejs/textarea-autosize': 'file:/tmp/react-textarea-autosize.tgz',
		'@octanejs/tiptap': 'file:/tmp/tiptap.tgz',
		octane: 'file:/tmp/octane.tgz',
	};
	const toolingVersions = {
		nodeTypes: '24.13.3',
		tsrxTypeScriptPlugin: '0.3.116',
		typescript: '5.9.3',
	};

	test('installs the real packed bindings and the pinned consumer TSRX tooling', () => {
		const manifest = createPackedTsrxConsumerManifest(archiveSpecs, toolingVersions);

		assert.deepEqual(manifest.dependencies, archiveSpecs);
		assert.deepEqual(manifest.devDependencies, {
			'@tsrx/typescript-plugin': '0.3.116',
			'@types/node': '24.13.3',
			typescript: '5.9.3',
		});
		assert.equal(manifest.private, true);
	});

	test('rejects a published binding omitted from the packed archive set', () => {
		const { '@octanejs/tiptap': _missingTiptap, ...incompleteArchives } = archiveSpecs;

		assert.throws(
			() => createPackedTsrxConsumerManifest(incompleteArchives, toolingVersions),
			/no packed archive was provided for @octanejs\/tiptap/,
		);
	});

	test('typechecks TSRX with the Octane language plugin and full strict diagnostics', () => {
		const config = createPackedTsrxConsumerConfig();

		assert.equal(config.compilerOptions.strict, true);
		assert.equal(config.compilerOptions.skipLibCheck, false);
		assert.equal(config.compilerOptions.jsx, 'react-jsx');
		assert.equal(config.compilerOptions.jsxImportSource, 'octane');
		assert.deepEqual(config.compilerOptions.plugins, [{ name: '@tsrx/typescript-plugin' }]);
		assert.deepEqual(config.tsrx, { compiler: 'octane/compiler/volar' });
		assert.deepEqual(config.include, ['src/**/*.ts', 'src/**/*.tsrx']);
		assert.equal(config.compilerOptions.paths, undefined);
	});

	test('exercises the published bindings from a real local TSRX component', () => {
		const source = renderPackedTsrxConsumerSource();

		assert.match(source, /from '@octanejs\/cmdk'/);
		assert.match(source, /from '@octanejs\/input-otp'/);
		assert.match(source, /from '@octanejs\/sonner'/);
		assert.match(source, /from '@octanejs\/react-spring'/);
		assert.match(source, /from '@octanejs\/react-spring\/parallax'/);
		assert.match(source, /from '@octanejs\/syntax-highlighter'/);
		assert.match(source, /from '@octanejs\/textarea-autosize'/);
		assert.match(source, /from '@octanejs\/tiptap'/);
		assert.match(source, /<Command\b/);
		assert.match(source, /<OTPInput\b/);
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
