import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import { assertApprovedGateCommand } from './evidence.mjs';
import { copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
	newOpaquePublicSymbol,
	pinnedPublicEntries,
	pinnedPublicExport,
} from './pinned-public-types.mjs';
import { buildUpstreamLock, gitBlobSha1 } from './materialize-lib.mjs';
import { buildTarGz, fixtureIdentity } from './__fixtures__/materialize-fixtures.mjs';

function check(actual, expected, constraintWitness = false) {
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
		const witness = constraintWitness
			? pinnedPublicExport(
					new Map([['@octanejs/tanstack-table', files[1]]]),
					program,
					checker,
					'@octanejs/tanstack-table',
					'TableComponentType',
				)
			: symbols[1];
		return newOpaquePublicSymbol(symbols[0], witness, checker);
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

function pinnedFixture(
	run,
	{ adjacent = false, opaque = false, hiddenManifest = false, legacy = false } = {},
) {
	const workspaceRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'pinned-public-artifact-')));
	const directory = path.join(workspaceRoot, 'packages/widget');
	mkdirSync(directory, { recursive: true });
	try {
		const published = JSON.stringify({
			name: 'mit-widget',
			version: '1.0.0',
			...(legacy
				? { types: 'index.d.mts' }
				: {
						exports: {
							'.': adjacent
								? { import: './index.mjs' }
								: { import: { types: './index.d.mts', default: './index.mjs' } },
							...(hiddenManifest ? {} : { './package.json': './package.json' }),
						},
					}),
		});
		const declaration = opaque
			? 'export declare function widget(value: unknown): unknown;'
			: 'export declare class Widget { value: string; }';
		const source = opaque
			? declaration
			: 'export declare class Widget {\n /** @internal */\n hidden(): unknown;\n value: string;\n }';
		const artifact = buildTarGz([
			['package/package.json', published],
			['package/index.d.mts', declaration],
		]);
		const identity = fixtureIdentity({
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
		put('package.json', '{"name":"@octanejs/widget"}');
		put('audit/upstream.lock.json', JSON.stringify(lock));
		for (const [file, content] of Object.entries(files)) put(`upstream/${file}`, content);
		put('upstream-artifact/widget.tgz', artifact);
		put('node_modules/mit-widget/package.json', published);
		put('node_modules/mit-widget/index.d.mts', declaration);
		const node = { identity, binding: '@octanejs/widget' };
		run({ directory, workspaceRoot, node, put, artifact, declaration });
	} finally {
		rmSync(workspaceRoot, { recursive: true, force: true });
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

test('resolves adjacent declarations for an import export string from authenticated bytes', () =>
	pinnedFixture(
		({ directory, node }) => {
			const entries = pinnedPublicEntries(directory, node);
			assert.equal(
				entries.get('@octanejs/widget'),
				path.join(directory, 'node_modules/mit-widget/index.d.mts'),
			);
		},
		{ adjacent: true },
	));

test('rejects a missing adjacent declaration instead of omitting the public entry', () =>
	pinnedFixture(
		({ directory, node }) => {
			rmSync(path.join(directory, 'node_modules/mit-widget/index.d.mts'));
			assert.throws(() => pinnedPublicEntries(directory, node), /ENOENT|pinned declaration/);
		},
		{ adjacent: true },
	));

for (const mode of ['pristine', 'adapted']) {
	test(`binds ${mode} upstream type probes to exact published opacity without admitting new erasure`, () =>
		pinnedFixture(
			({ directory, workspaceRoot, node, put }) => {
				const assertionDirectory = path.join(workspaceRoot, 'scripts/react-port');
				mkdirSync(assertionDirectory, { recursive: true });
				copyFileSync(
					fileURLToPath(new URL('./type-assertions.d.ts', import.meta.url)),
					path.join(assertionDirectory, 'type-assertions.d.ts'),
				);
				const gate = 'upstream-types-' + mode;
				const specifier = mode === 'pristine' ? 'mit-widget' : '@octanejs/widget';
				put('src/index.ts', 'export declare function widget(value: unknown): unknown;');
				put(
					`typetests/${mode}/probe.ts`,
					`import { widget } from '${specifier}';
import type { Assert, Equal } from '../../../../scripts/react-port/type-assertions.js';
type Result = Assert<Equal<ReturnType<typeof widget>, unknown>>;
// @ts-expect-error one argument is required
widget();
`,
				);
				const config = {
					compilerOptions: {
						strict: true,
						skipLibCheck: false,
						noEmit: true,
						types: [],
						module: 'esnext',
						moduleResolution: 'bundler',
						paths: {
							[specifier]: [
								mode === 'pristine' ? '../../upstream/src/index.ts' : '../../src/index.ts',
							],
						},
					},
					files: ['./probe.ts'],
					reactPortEvidence: { gate, publicMode: 'pinned', upstreamRegistrations: [] },
				};
				put(`typetests/${mode}/tsconfig.json`, JSON.stringify(config));
				const planned = {
					...node,
					packageName: 'mit-widget',
					bindingDirectory: 'packages/widget',
					upstreamTestInventory: [],
				};
				const args = [
					'./node_modules/.bin/' + (mode === 'pristine' ? 'tsc' : 'tsrx-tsc'),
					'--noEmit',
					'-p',
					`packages/widget/typetests/${mode}/tsconfig.json`,
				];
				assert.doesNotThrow(() =>
					assertApprovedGateCommand([gate], args, planned, { workspaceRoot }),
				);
				if (mode === 'adapted') {
					put('src/index.ts', 'export declare function widget(value: unknown): any;');
					assert.throws(
						() => assertApprovedGateCommand([gate], args, planned, { workspaceRoot }),
						/introduces any or unknown/,
					);
				} else {
					put('upstream/src/index.ts', 'export declare function widget(value: unknown): any;');
					assert.throws(
						() => assertApprovedGateCommand([gate], args, planned, { workspaceRoot }),
						/invalid pristine bytes/,
					);
				}
			},
			{ opaque: true, adjacent: true },
		));
}

test('preserves an opaque renderer child when ReactNode is combined with a render function', () => {
	assert.equal(
		check(
			'export declare const value: { children: unknown };',
			"import type { ReactNode } from 'react'; export declare const value: { children: ReactNode | ((value: number) => ReactNode) };",
		),
		null,
	);
});
test('does not use nested ReactNode annotations to waive a surrounding object contract', () => {
	assert.ok(
		check(
			'export declare const value: { children: unknown };',
			"import type { ReactNode } from 'react'; export declare const value: { children: { node: ReactNode; value: string } };",
		),
	);
});
test('does not treat a local ReactNode name as a renderer contract', () => {
	assert.ok(
		check(
			'export declare const value: { children: unknown };',
			'type ReactNode = string; export declare const value: { children: ReactNode | ((value: number) => string) };',
		),
	);
});

test('matches generic arguments across intersection union branches', () => {
	const source = `
  type Options<T> = { select?: (value: T) => T } & { key: string };
  export declare const value: Options<Error> | Options<unknown>;
 `;
	assert.equal(check(source, source), null);
});

test('rejects erasure inside a matched generic intersection branch', () => {
	const upstream = `
  type Options<T> = { select?: (value: T) => T } & { key: string; result: number };
  export declare const value: Options<Error> | Options<unknown>;
 `;
	assert.ok(check(upstream.replace('result: number', 'result: any'), upstream));
});

test('retained Query aliases require an authenticated declaration module', () => {
	pinnedFixture(({ directory, node }) => {
		node.binding = '@octanejs/tanstack-query';
		assert.throws(() => pinnedPublicEntries(directory, node), /Compatibility witness is absent/);
	});
});

test('pairs interface and alias generic constraints structurally', () => {
	assert.equal(
		check(
			'interface Feature { run: (input: any) => void } export interface value<T extends Feature> { data: T }',
			'interface Feature { run: (input: any) => void } export type value<T extends Feature> = { data: T };',
		),
		null,
	);
	assert.match(
		check(
			'interface Feature { run: (input: any) => void } export interface value<T extends Feature> { data: T }',
			'interface Feature { run: (input: string) => void } export type value<T extends Feature> = { data: T };',
		),
		/any/,
	);
});

test('pairs callable renderer constraints with the function component union branch', () => {
	assert.equal(
		check(
			'type Component<P> = (props: P) => unknown; export declare function value<C extends Record<string, Component<any>>>(components: C): C;',
			"import type { ComponentType } from 'react'; export declare function value<C extends Record<string, ComponentType<any>>>(components: C): C;",
		),
		null,
	);
});

test('recognizes an inferred complete ReactNode union but rejects a narrow return', () => {
	const native = 'export declare function value(): unknown;';
	assert.equal(
		check(
			native,
			"import type { ReactNode } from 'react'; type Expanded<T> = T extends unknown ? T : never; export declare function value(): Expanded<ReactNode>;",
		),
		null,
	);
	assert.match(
		check(native, 'export declare function value(): string | number | null;'),
		/unknown/,
	);
});

test('matches intersected call signatures by their argument shape', () => {
	assert.equal(
		check(
			'export declare const value: ((props: {text:string}) => unknown) & (() => boolean);',
			"import type {ReactNode} from 'react'; export declare const value: (() => boolean) & ((props: {text:string}) => ReactNode);",
		),
		null,
	);
	assert.match(
		check(
			'export declare const value: ((props: {text:string}) => unknown) & (() => boolean);',
			'export declare const value: (() => boolean) & ((props: {text:string}) => string);',
		),
		/unknown/,
	);
});

test('derives a native component alias witness from the published registry constraint', () => {
	const expected =
		'type Component<P> = (props: P) => string; export type CreateTableHookOptions<Features, Components extends Record<string, Component<any>>> = {components: Components}; export type value = unknown;';
	assert.equal(check('export type value<P = any> = (props: P) => string;', expected, true), null);
	assert.match(check('export type value<P = any> = (props: P) => any;', expected, true), /any/);
	assert.match(
		check(
			'export type value<P = any> = (props: P) => string;',
			'export type CreateTableHookOptions<Features, Components extends {named: string}> = {components: Components}; export type value = unknown;',
			true,
		),
		/any/,
	);
});

test('distinguishes a callback-bearing union from its string-header sibling', () => {
	const declaration =
		'type Column<T> = {id?:string; accessor:string} & Partial<{header:string} | {id:string; header?:string | ((context:T)=>any)}>; export type value<T> = Column<T>;';
	assert.equal(check(declaration, declaration), null);
	const erased =
		'type Column<T> = {id?:string; accessor:string} & Partial<{header:string} | {id:string; header?:string | ((context:T)=>string)}>; export type value<T> = Column<T>;';
	assert.match(check(declaration, erased), /any/);
});

test('pairs overloaded generic declarations and excludes implementation-only types', () => {
	const actual =
		'interface Feature { run:(input:any)=>void } export function value<T>(input:T):void; export function value<F extends Feature,T>(input:F, other:T):void; export function value(...args:any[]):void {}';
	const expected =
		'interface Feature { run:(input:any)=>void } export declare function value<T>(input:T):void; export declare function value<F extends Feature,T>(input:F, other:T):void;';
	assert.equal(check(actual, expected), null);
	assert.match(check(actual, expected.replace('input:any', 'input:string')), /any/);
});

for (const drift of [false, true]) {
	test(`authenticates an ESM-only package with private metadata${drift ? ' and rejects changed bytes' : ''}`, () =>
		pinnedFixture(
			({ directory, node, put }) => {
				if (drift) {
					put('node_modules/mit-widget/index.d.mts', 'export type Changed = string;');
					assert.throws(
						() => pinnedPublicEntries(directory, node),
						/differs from pinned npm bytes/,
					);
				} else {
					assert.equal(
						pinnedPublicEntries(directory, node).get('@octanejs/widget'),
						path.join(directory, 'node_modules/mit-widget/index.d.mts'),
					);
				}
			},
			{ hiddenManifest: true },
		));
}

test('compares callable type parameters through their constraints without repeating apparent signatures', () => {
	assert.equal(
		check(
			'type Component<P> = (props: P) => unknown; export declare function value<C extends Component<any>>(component: C): C;',
			"import type { ComponentType } from 'react'; export declare function value<C extends ComponentType<any> | undefined>(component: C): C;",
		),
		null,
	);
	assert.match(
		check(
			'type Component = (props: { value: any }) => unknown; export declare function value<C extends Component>(component: C): C;',
			"import type { ReactNode } from 'react'; type Component = ((props: { value: string }) => ReactNode) | undefined; export declare function value<C extends Component>(component: C): C;",
		),
		/any/,
	);
});

test('matches function generics to a published callable alias', () => {
	assert.equal(
		check(
			'export declare function value<T = unknown>(input: T): T;',
			'export declare const value: <T = unknown>(input: T) => T;',
		),
		null,
	);
	assert.ok(
		check(
			'export declare function value<T = any>(input: T): T;',
			'export declare const value: <T = unknown>(input: T) => T;',
		),
	);
});

test('matches native boundary props to a React class constructor without erasing callbacks', () => {
	const upstream =
		"import * as React from 'react'; export declare class value extends React.Component<{resetKey: () => unknown; onError: (error: Error) => void}> {}";
	assert.equal(
		check(
			'export declare function value(props: {resetKey: () => unknown; onError: (error: Error) => void}): void;',
			upstream,
		),
		null,
	);
	assert.ok(
		check(
			'export declare function value(props: {resetKey: () => unknown; onError: (error: any) => void}): void;',
			upstream,
		),
	);
});

test('checks component props while recognizing native compiler arguments', () => {
	const body = path.resolve('packages/octane/src/runtime.ts').replaceAll('\\', '/');
	const upstream =
		"import * as React from 'react'; export declare const value: { component: React.ComponentType<{label: string}> };";
	assert.equal(
		check(
			`import type {ComponentBody} from '${body}'; export declare const value: {component: ComponentBody<{label: string}>};`,
			upstream,
		),
		null,
	);
	assert.ok(
		check(
			`import type {ComponentBody} from '${body}'; export declare const value: {component: ComponentBody<{label: any}>};`,
			upstream,
		),
	);
});

test('resolves a legacy types entry only from authenticated npm declarations', () =>
	pinnedFixture(
		({ directory, node, put }) => {
			assert.equal(
				pinnedPublicEntries(directory, node).get('@octanejs/widget'),
				path.join(directory, 'node_modules/mit-widget/index.d.mts'),
			);
			put('node_modules/mit-widget/index.d.mts', 'export declare const unrelated: any;');
			assert.throws(() => pinnedPublicEntries(directory, node), /differs from pinned npm bytes/);
		},
		{ legacy: true },
	));

test('pristine declarations do not import native compatibility entrypoints', () => {
	pinnedFixture(({ directory, node, put }) => {
		put('audit/compatibility-baseline.json', JSON.stringify({ binding: node.binding }));
		assert.throws(() => pinnedPublicEntries(directory, node), /Compatibility evidence requires/);
		const entries = pinnedPublicEntries(directory, { ...node, binding: node.identity.packageName });
		assert.deepEqual([...entries.keys()], [node.identity.packageName]);
	});
});

import { publicCompatibilityExport } from './public-compatibility.mjs';

test('compares each public overload constraint with its corresponding signature', () => {
	const signatures = `export declare function value<T>(input: T): T;
export declare function value<T extends { read(): unknown }>(input: T): T;`;
	assert.equal(check(signatures, signatures), null);
	assert.ok(check(signatures.replace('read(): unknown', 'read(): any'), signatures));
});

function versionedPinnedFixture(run, versioned = false, opaqueMember = false, options = {}) {
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

test('selects the published type condition supported by the checking compiler', () =>
	versionedPinnedFixture(({ directory, node }) => {
		assert.equal(
			pinnedPublicEntries(directory, node).get('@octanejs/widget'),
			path.join(directory, 'node_modules/mit-widget/index.d.mts'),
		);
	}, true));

test('counts exact structural type equality without allowing opaque or permissive assertions', () =>
	versionedPinnedFixture(
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
	versionedPinnedFixture(
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
	versionedPinnedFixture(
		({ directory, node }) => {
			assert.throws(() => pinnedPublicEntries(directory, node), /Compatibility witness is absent/);
		},
		false,
		false,
		{ ...jotaiCompatibilityFixture, extraDeclarations: [] },
	);
});

test('retained dependency-list aliases resolve only from an explicit pinned import', () => {
	const directory = mkdtempSync(path.join(tmpdir(), 'pinned-import-alias-'));
	try {
		const witness = path.join(directory, 'index.d.ts');
		const dependency = path.join(directory, 'dependency.d.ts');
		writeFileSync(dependency, 'export type DependencyList = readonly unknown[];');
		writeFileSync(
			witness,
			"import type { DependencyList } from './dependency'; export declare function effect(deps: DependencyList): void;",
		);
		const entries = new Map([['@octanejs/alien-signals', witness]]);
		const lookup = () => {
			const program = ts.createProgram([witness, dependency], {
				strict: true,
				types: [],
				noEmit: true,
			});
			const checker = program.getTypeChecker();
			return {
				checker,
				symbol: pinnedPublicExport(
					entries,
					program,
					checker,
					'@octanejs/alien-signals',
					'DependencyList',
				),
			};
		};
		const { checker, symbol } = lookup();
		assert.equal(symbol?.name, 'DependencyList');
		assert.ok(symbol.flags & ts.SymbolFlags.Alias);
		assert.equal(
			checker.getAliasedSymbol(symbol).declarations[0].getSourceFile().fileName,
			dependency,
		);
		assert.equal(publicCompatibilityExport('@octanejs/alien-signals', 'InventedType'), undefined);
		writeFileSync(witness, 'export declare function effect(): void;');
		assert.equal(
			lookup().symbol,
			undefined,
			'a same-named type in another file is not a pinned import',
		);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});
