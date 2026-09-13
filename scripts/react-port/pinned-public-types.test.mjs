import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import {
	newOpaquePublicSymbol,
	pinnedPublicEntries,
	pinnedPublicExport,
} from './pinned-public-types.mjs';
import { publicCompatibilityExport } from './public-compatibility.mjs';
import { assertApprovedGateCommand } from './evidence.mjs';
import { buildUpstreamLock, gitBlobSha1 } from './materialize-lib.mjs';
import { buildTarGz, fixtureIdentity } from './__fixtures__/materialize-fixtures.mjs';

function check(actual, expected) {
	const root = mkdtempSync(path.join(tmpdir(), 'public-opacity-'));
	try {
		const files = ['native.ts', 'upstream.ts'].map((file) => path.join(root, file));
		writeFileSync(files[0], actual);
		writeFileSync(files[1], expected);
		const program = ts.createProgram(files, {
			strict: true,
			noEmit: true,
			target: ts.ScriptTarget.ESNext,
			module: ts.ModuleKind.ESNext,
			moduleResolution: ts.ModuleResolutionKind.Bundler,
			paths: { react: [path.resolve('packages/base-ui/node_modules/@types/react/index.d.ts')] },
			types: [],
		});
		const diagnostics = ts.getPreEmitDiagnostics(program);
		assert.deepEqual(
			diagnostics.map((diagnostic) =>
				ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
			),
			[],
		);
		const checker = program.getTypeChecker();
		const symbols = files.map((file) =>
			checker
				.getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(file)))
				.find((symbol) => symbol.name === 'value'),
		);
		return newOpaquePublicSymbol(symbols[0], symbols[1], checker);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

for (const [label, native, upstream] of [
	[
		'discriminated union',
		`export declare const value: { kind: 'a'; data: any } | { kind: 'b'; data: string };`,
		`export declare const value: { kind: 'a'; data: string } | { kind: 'b'; data: any };`,
	],
	[
		'ambiguous union',
		'export declare const value: { data: any };',
		'export declare const value: { data: string } | { data: number };',
	],
	[
		'public class member',
		'export declare class value { private hidden: string; visible: any }',
		'export declare class value { private hidden: any; visible: string }',
	],
	[
		'inlined generic member',
		'interface Box<T> { data: T } export declare const value: Box<any>;',
		'export declare const value: { data: string };',
	],
	[
		'invented internal tag',
		'export declare class value {\n /** @internal */\n visible: any\n }',
		'export declare class value { visible: string }',
	],
	[
		'union generic',
		'export declare const value: Promise<any> | null;',
		'export declare const value: Promise<string> | null;',
	],
	['return', 'export declare function value(): any;', 'export declare function value(): string;'],
	[
		'unknown return',
		'export declare function value(): unknown;',
		'export declare function value(): string;',
	],
	[
		'nested parameter',
		'export declare function value(input: { data: any }): void;',
		'export declare function value(input: { data: string }): void;',
	],
	[
		'nested unknown',
		'export declare const value: { data: unknown };',
		'export declare const value: { data: string };',
	],
	[
		'promise',
		'export declare const value: Promise<any>;',
		'export declare const value: Promise<string>;',
	],
	[
		'array',
		'export declare const value: readonly unknown[];',
		'export declare const value: readonly string[];',
	],
	[
		'inherited promise',
		'interface Value extends Promise<any> {} export declare const value: Value;',
		'interface Value extends Promise<string> {} export declare const value: Value;',
	],
	[
		'unused generic default',
		'export type value<T = any> = string;',
		'export type value<T = string> = string;',
	],
	[
		'unknown generic default',
		'export type value<T = unknown> = T;',
		'export type value<T = string> = T;',
	],
	[
		'unknown widened to any',
		'export declare const value: { data: any };',
		'export declare const value: { data: unknown };',
	],
	[
		'opaque leaf moved',
		'export declare const value: { first: any; second: string };',
		'export declare const value: { first: string; second: any };',
	],
	[
		'unrelated external generic',
		'export declare const value: Map<string, any>;',
		'export declare const value: Map<string, number>;',
	],
]) {
	test(`rejects new ${label} erasure even with a pinned counterpart`, () =>
		assert.ok(check(native, upstream)));
}

for (const source of [
	'export declare function value<T = unknown>(input: T): T;',
	'export declare const value: { data: any; title: string };',
	'export declare const value: Promise<unknown>;',
	'export declare function value(input: unknown): input is string;',
	'export declare const value: Map<string, number>;',
]) {
	test(`preserves the pinned contract: ${source}`, () => assert.equal(check(source, source), null));
}

test('compares each public overload constraint with its corresponding signature', () => {
	const signatures = `export declare function value<T>(input: T): T;
export declare function value<T extends { read(): unknown }>(input: T): T;`;
	assert.equal(check(signatures, signatures), null);
	assert.ok(check(signatures.replace('read(): unknown', 'read(): any'), signatures));
});

test('ignores private implementation fields while checking public members', () =>
	assert.equal(
		check(
			'export declare class value { private hidden: any; visible: string }',
			'export declare class value { private hidden: number; visible: string }',
		),
		null,
	));
test('matches an inlined generic public contract', () =>
	assert.equal(
		check(
			'interface Box<T> { data: T } export declare const value: Box<unknown>;',
			'export declare const value: { data: unknown };',
		),
		null,
	));

function pinnedFixture(run, versioned = false, opaqueMember = false, options = {}) {
	const {
		packageName = 'mit-widget',
		binding = '@octanejs/widget',
		extraDeclarations = [],
	} = options;
	const directory = realpathSync(mkdtempSync(path.join(tmpdir(), 'pinned-public-artifact-')));
	try {
		const published = JSON.stringify({
			name: packageName,
			version: '1.0.0',
			exports: {
				'.': versioned
					? { 'types@>=5.5': './index.d.mts', types: './unsupported.d.mts', default: './index.mjs' }
					: { import: { types: './index.d.mts', default: './index.mjs' } },
				'./package.json': './package.json',
			},
		});
		const member = opaqueMember ? 'metadata: unknown; ' : '';
		const declaration = `export declare class Widget { ${member}value: string; }`;
		const source = `export declare class Widget {\n /** @internal */\n hidden(): unknown;\n ${member}value: string;\n }`;
		const artifact = buildTarGz([
			['package/package.json', published],
			['package/index.d.mts', declaration],
			['package/unsupported.d.mts', 'export {};'],
			...extraDeclarations.map(([file, source]) => [`package/${file}`, source]),
		]);
		const identity = fixtureIdentity({
			packageName,
			integrity: `sha512-${createHash('sha512').update(artifact).digest('base64')}`,
		});
		const files = { 'package.json': published, 'src/index.ts': source };
		const lock = buildUpstreamLock({
			identity,
			license: { spdx: 'MIT' },
			treeEntries: Object.entries(files).map(([file, content]) => ({
				type: 'blob',
				path: file,
				sha: gitBlobSha1(Buffer.from(content)),
				size: Buffer.byteLength(content),
			})),
			adaptedMappings: [],
		});
		const put = (file, contents) => {
			mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
			writeFileSync(path.join(directory, file), contents);
		};
		put('package.json', JSON.stringify({ name: binding }));
		put('audit/upstream.lock.json', JSON.stringify(lock));
		for (const [file, content] of Object.entries(files)) put(`upstream/${file}`, content);
		put('upstream-artifact/widget.tgz', artifact);
		put(`node_modules/${packageName}/package.json`, published);
		put(`node_modules/${packageName}/index.d.mts`, declaration);
		put(`node_modules/${packageName}/unsupported.d.mts`, 'export {};');
		for (const [file, source] of extraDeclarations)
			put(`node_modules/${packageName}/${file}`, source);
		const node = { identity, binding };
		run({ directory, node, put, artifact, declaration });
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

test('uses published declarations only after source, tarball, and installed bytes agree', () =>
	pinnedFixture(({ directory, node }) => {
		const entries = pinnedPublicEntries(directory, node);
		assert.deepEqual([...entries.keys()], ['@octanejs/widget']);
		assert.equal(
			entries.get('@octanejs/widget'),
			path.join(directory, 'node_modules/mit-widget/index.d.mts'),
		);
		assert.deepEqual([...entries.internalMembers], [`${directory}/src/index.ts#Widget.hidden`]);
	}));

test('selects the published type condition supported by the checking compiler', () =>
	pinnedFixture(({ directory, node }) => {
		assert.equal(
			pinnedPublicEntries(directory, node).get('@octanejs/widget'),
			path.join(directory, 'node_modules/mit-widget/index.d.mts'),
		);
	}, true));

for (const [label, mutate, message] of [
	[
		'changed pin',
		({ node }) => {
			node.identity = { ...node.identity, version: '2.0.0' };
		},
		/different pinned version/,
	],
	[
		'source drift',
		({ put }) => put('upstream/src/index.ts', 'export const value = 1;'),
		/invalid pristine bytes/,
	],
	[
		'changed installed declaration',
		({ put }) => put('node_modules/mit-widget/index.d.mts', 'export declare const value: any;'),
		/differs from pinned npm bytes/,
	],
	[
		'corrupt tarball',
		({ put }) => put('upstream-artifact/widget.tgz', 'invalid'),
		/exactly one npm tarball/,
	],
	[
		'ambiguous tarball',
		({ put, artifact }) => put('upstream-artifact/duplicate.tgz', artifact),
		/exactly one npm tarball/,
	],
	[
		'declaration symlink escape',
		({ directory, put, declaration }) => {
			put('elsewhere.d.mts', declaration);
			rmSync(path.join(directory, 'node_modules/mit-widget/index.d.mts'));
			symlinkSync(
				path.join(directory, 'elsewhere.d.mts'),
				path.join(directory, 'node_modules/mit-widget/index.d.mts'),
			);
		},
		/differs from pinned npm bytes/,
	],
])
	test(`rejects ${label} in the public type witness`, () =>
		pinnedFixture((fixture) => {
			mutate(fixture);
			assert.throws(() => pinnedPublicEntries(fixture.directory, fixture.node), message);
		}));

for (const target of ['any', 'unknown'])
	test(`rejects ${target} hidden in recursive native refs`, () => {
		const native = `import type { Ref } from 'react'; type NativeRef<T> = Ref<T> | readonly NativeRef<T>[]; export declare const value: NativeRef<${target}>;`;
		const upstream = `import type { Ref } from 'react'; export declare const value: Ref<HTMLDivElement>;`;
		assert.ok(check(native, upstream));
	});
test('preserves the ref target through native nested ref arrays', () => {
	assert.equal(
		check(
			`import type { Ref } from 'react'; type NativeRef<T> = Ref<T> | readonly NativeRef<T>[]; export declare const value: NativeRef<HTMLDivElement>;`,
			`import type { Ref } from 'react'; export declare const value: Ref<HTMLDivElement>;`,
		),
		null,
	);
});

test('counts exact structural type equality without allowing opaque or permissive assertions', () =>
	pinnedFixture(
		({ directory, node, put, declaration }) => {
			put(
				'package.json',
				JSON.stringify({ name: '@octanejs/widget', exports: { '.': './src/index.ts' } }),
			);
			put('src/index.ts', declaration);
			put(
				'tests/types/tsconfig.json',
				JSON.stringify({
					compilerOptions: {
						strict: true,
						skipLibCheck: false,
						noEmit: true,
						module: 'ESNext',
						moduleResolution: 'Bundler',
						types: [],
						paths: { '@octanejs/widget': ['../../src/index.ts'] },
					},
					files: ['public.ts'],
					reactPortEvidence: { gate: 'public-types', publicMode: 'pinned' },
				}),
			);
			const checkAssertion = (assertion) => {
				put(
					'tests/types/public.ts',
					`import { expectTypeOf } from 'vitest';
import { Widget } from '@octanejs/widget';
${assertion}
// @ts-expect-error value must be a string
new Widget().value = 1;
`,
				);
				return () =>
					assertApprovedGateCommand(
						['public-types'],
						[
							'pnpm',
							'exec',
							'tsrx-tsc',
							'--noEmit',
							'-p',
							`${path.basename(directory)}/tests/types/tsconfig.json`,
						],
						{ ...node, bindingDirectory: path.basename(directory) },
						{ workspaceRoot: path.dirname(directory) },
					);
			};
			assert.doesNotThrow(
				checkAssertion(
					'expectTypeOf<Widget>().toEqualTypeOf<{ value: string; metadata: unknown }>();',
				),
			);
			assert.throws(
				checkAssertion('expectTypeOf<Widget>().toEqualTypeOf<unknown>();'),
				/positive.*assertion/i,
			);
			assert.throws(
				checkAssertion('expectTypeOf<Widget>().toMatchTypeOf<{ metadata: unknown }>();'),
				/positive.*assertion/i,
			);
		},
		false,
		true,
	));

const hydrationDeclaration = 'dist/react/utils/useHydrateAtoms.d.ts';
const jotaiCompatibilityFixture = {
	packageName: 'jotai',
	binding: '@octanejs/jotai',
	extraDeclarations: [
		[hydrationDeclaration, 'export type INTERNAL_InferAtomTuples<T> = readonly [T];'],
	],
};
test('retained Jotai utility alias requires its authenticated published declaration', () => {
	pinnedFixture(
		({ directory, node, put }) => {
			const entries = pinnedPublicEntries(directory, node);
			const program = ts.createProgram([...entries.values()], {
				strict: true,
				noEmit: true,
				types: [],
			});
			const checker = program.getTypeChecker();
			for (const specifier of ['@octanejs/jotai/utils', '@octanejs/jotai/react/utils']) {
				const symbol = pinnedPublicExport(
					entries,
					program,
					checker,
					specifier,
					'INTERNAL_InferAtomTuples',
				);
				assert.equal(symbol?.name, 'INTERNAL_InferAtomTuples');
				assert.equal(
					symbol?.declarations[0].getSourceFile().fileName,
					path.join(directory, 'node_modules/jotai', hydrationDeclaration),
				);
			}
			assert.equal(
				publicCompatibilityExport('@octanejs/jotai', 'INTERNAL_InferAtomTuples'),
				undefined,
			);
			assert.equal(
				publicCompatibilityExport('@octanejs/widget/utils', 'INTERNAL_InferAtomTuples'),
				undefined,
			);
			assert.equal(publicCompatibilityExport('@octanejs/jotai/utils', 'invented'), undefined);
			put(
				`node_modules/jotai/${hydrationDeclaration}`,
				'export type INTERNAL_InferAtomTuples<T> = any;',
			);
			assert.throws(() => pinnedPublicEntries(directory, node), /differs from pinned npm bytes/);
		},
		false,
		false,
		jotaiCompatibilityFixture,
	);
});
test('rejects a compatibility declaration absent from the authenticated tarball', () => {
	pinnedFixture(
		({ directory, node }) => {
			assert.throws(() => pinnedPublicEntries(directory, node), /Compatibility witness is absent/);
		},
		false,
		false,
		{ ...jotaiCompatibilityFixture, extraDeclarations: [] },
	);
});
