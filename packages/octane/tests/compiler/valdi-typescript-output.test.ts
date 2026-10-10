// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { compile } from 'octane/compiler';
import { evaluateCompiledFixtureCode } from '../_server-fixture.js';
import { decodeMappings } from '../_source-map.js';

const parser = vi.hoisted(() => ({ javascript: false }));
vi.mock('../../src/compiler/parser.node.js', async (importOriginal) => {
	const native = await importOriginal<typeof import('../../src/compiler/parser.node.js')>();
	const javascript = await import('../../src/compiler/parser.browser.js');
	return {
		...native,
		parseModule: (...args: Parameters<typeof native.parseModule>) =>
			(parser.javascript ? javascript.parseModule : native.parseModule)(...args),
	};
});
afterEach(() => {
	parser.javascript = false;
	vi.unstubAllEnvs();
});

const renderer = {
	id: 'native',
	module: '@test/valdi-writer',
	target: 'valdi',
	server: 'unsupported',
	text: 'reject',
} as const;

// Both the compiler consumer and real Valdi Workspace fixture resolve this
// adapter through the published contract rather than copied hook signatures.
const ADAPTER = readFileSync(
	new URL('../../../../scripts/fixtures/valdi-typescript-build/writer.d.ts', import.meta.url),
	'utf8',
);

function typecheck(code: string, consumer: string, extraFiles: Record<string, string> = {}) {
	const directory = mkdtempSync(join(tmpdir(), 'octane-valdi-ts-'));
	try {
		const adapterDirectory = join(directory, 'node_modules/@test/valdi-writer');
		mkdirSync(adapterDirectory, { recursive: true });
		writeFileSync(join(adapterDirectory, 'index.d.ts'), ADAPTER);
		writeFileSync(
			join(adapterDirectory, 'package.json'),
			JSON.stringify({ name: '@test/valdi-writer', types: './index.d.ts' }),
		);
		symlinkSync(
			fileURLToPath(new URL('../../', import.meta.url)),
			join(directory, 'node_modules/octane'),
			'dir',
		);
		const files = {
			'scene.ts': code,
			'consumer.ts': consumer,
			...extraFiles,
		};
		for (const [name, source] of Object.entries(files)) {
			writeFileSync(join(directory, name), source);
		}
		const program = ts.createProgram({
			rootNames: Object.keys(files).map((name) => join(directory, name)),
			options: {
				module: ts.ModuleKind.ESNext,
				moduleResolution: ts.ModuleResolutionKind.Bundler,
				noEmit: true,
				strict: true,
				verbatimModuleSyntax: true,
				target: ts.ScriptTarget.ESNext,
				lib: ['lib.es2020.d.ts'],
				types: [],
				// Tests of preserved author-facing types supply a small root-module
				// fixture. The compiler/valdi subpath still uses real package resolution.
				...(extraFiles['octane.d.ts']
					? { paths: { octane: [join(directory, 'octane.d.ts')] } }
					: {}),
			},
		});
		return ts.getPreEmitDiagnostics(program).map((diagnostic) => ({
			file: diagnostic.file?.fileName.slice(directory.length + 1),
			code: diagnostic.code,
			message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
		}));
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

const SOURCE = `import { useState, useMemo, useCallback } from 'octane';
export interface Props { label: string; active: boolean }
export function Scene(props: Props) @{
	if (props.active) {
		const [count, setCount, getCount] = useState<number | null>(null);
		const label = useMemo<string>(() => props.label + (count ?? 0));
		const onPress = useCallback(() => setCount((getCount() ?? 0) + label.length));
		onPress();
	}
	<label value={props.label} />
}`;

describe.each(['native', 'javascript'])(
	'Valdi TypeScript output with the %s parser',
	(parserName) => {
		it.each([false, true])(
			'preserves component and hook types for a strict TypeScript consumer in dev=%s',
			(dev) => {
				parser.javascript = parserName === 'javascript';
				const result = compile(SOURCE, '/src/Scene.tsrx', {
					renderer,
					hmr: false,
					output: 'ts',
					dev,
				});
				expect(result.lang).toBe('ts');
				expect(result.diagnostics).toEqual([]);
				expect(
					typecheck(
						result.code,
						`import { Scene } from './scene'; Scene({ label: 'ok', active: true });`,
					),
				).toEqual([]);
				const misuse = typecheck(
					result.code,
					`import { Scene } from './scene'; Scene({ active: true });`,
				);
				expect(misuse).toHaveLength(1);
				expect(misuse[0]).toMatchObject({ file: 'consumer.ts', code: 2345 });
				expect(misuse[0].message).toMatch(/label.*missing|missing.*label/);
			},
		);

		it('keeps typed conditionals, keyed loops and ordinary spreads valid TypeScript', () => {
			parser.javascript = parserName === 'javascript';
			vi.stubEnv('OCTANE_COMPILE_ASSERT_LOC', '1');
			vi.stubEnv('OCTANE_COMPILE_FROZEN_AST', '1');
			const source = `export interface Item { id: string; label: string }
			export interface Props { items: Item[]; visible: boolean; attrs: { padding: number } }
			function Row(props: { value: string }) @{ <label value={props.value} /> }
			export function Scene(props: Props) @{
				<view {...props.attrs}>
					@if (props.visible) {
						@for (const item of props.items; key item.id) {
							<Row {...{ value: item.label }} />
						} @empty { <label value="empty" /> }
					} @else { <label value="hidden" /> }
				</view>
			}`;
			const result = compile(source, '/src/Scene.tsrx', { renderer, hmr: false, output: 'ts' });
			expect(
				typecheck(
					result.code,
					`import { Scene } from './scene'; Scene({ items: [{ id: 'a', label: 'A' }], visible: true, attrs: { padding: 4 } });`,
				),
			).toEqual([]);
		});

		it('preserves omitted initializers and spread hook arguments through the public adapter types', () => {
			parser.javascript = parserName === 'javascript';
			const source = `import { useState, useRef } from 'octane';
			export function useOptional() {
				const [value, setValue, getValue] = useState<string>();
				const ref = useRef<string>();
				return { value, setValue, getValue, ref };
			}
			export function useEmptySpread() {
				const [value, setValue, getValue] = useState<string>(...([] as []));
				const ref = useRef<string>(...([] as []));
				return { value, setValue, getValue, ref };
			}
			export function useSpread(initial: number) {
				const [value, setValue, getValue] = useState<number>(...([initial] as [number]));
				const ref = useRef<number>(...([initial] as [number]));
				return { value, setValue, getValue, ref };
			}`;
			const result = compile(source, '/src/useValue.ts', { renderer, hmr: false, output: 'ts' });
			expect(
				typecheck(
					result.code,
					`import { useOptional, useEmptySpread, useSpread } from './scene';
					const optional = useOptional();
					const value: string | undefined = optional.value;
					const current: string | undefined = optional.getValue();
					optional.setValue(previous => previous?.toUpperCase());
					optional.ref.current = value;
					const empty = useEmptySpread();
					const absent: string | undefined = empty.getValue();
					empty.ref.current = absent;
					empty.setValue(previous => previous?.toUpperCase());
					const spread = useSpread(1);
					const count: number = spread.getValue();
					const ref: number = spread.ref.current;
					spread.setValue(previous => previous + count + ref);`,
				),
			).toEqual([]);
			const misuse = typecheck(
				result.code,
				`import { useOptional, useEmptySpread, useSpread } from './scene';
				const optional = useOptional();
				optional.setValue(1);
				const required: string = optional.getValue();
				const absent: string = useEmptySpread().getValue();
				useSpread(1).setValue('wrong');`,
			);
			expect(misuse.map(({ file, code }) => ({ file, code }))).toEqual([
				{ file: 'consumer.ts', code: 2345 },
				{ file: 'consumer.ts', code: 2322 },
				{ file: 'consumer.ts', code: 2322 },
				{ file: 'consumer.ts', code: 2345 },
			]);
		});

		it('types inferred guarded method dependencies without narrowing the runtime probes', () => {
			parser.javascript = parserName === 'javascript';
			const source = `import { useMemo, useCallback, useLayoutEffect } from 'octane';
			interface Receiver { value: string; read?(): string }
			export function useLabels(receiver: Receiver | null, count: number, enabled: boolean) {
				const label = useMemo(() => receiver?.read?.() ?? count.toFixed(0));
				const value = useMemo(() => enabled && receiver?.value);
				const format = useCallback((input: number) => receiver?.read?.() ?? input.toFixed(0));
				useLayoutEffect(() => { receiver?.read?.(); });
				return { label, value, format };
			}`;
			const result = compile(source, '/src/useLabels.ts', { renderer, hmr: false, output: 'ts' });
			expect(
				typecheck(
					result.code,
					`import { useLabels } from './scene';
					const result = useLabels(null, 1, true);
					const label: string = result.label;
					const value: string | false | undefined = result.value;
					const formatted: string = result.format(2);`,
				),
			).toEqual([]);
			const misuse = typecheck(
				result.code,
				`import { useLabels } from './scene'; useLabels(null, 1, true).format('wrong');`,
			);
			expect(misuse).toHaveLength(1);
			expect(misuse[0]).toMatchObject({ file: 'consumer.ts', code: 2345 });
		});

		it.each([
			{ name: 'ABI 2 append-only text', capabilities: [] },
			{ name: 'ABI 3 authored text sites', capabilities: ['host-text-site'] },
		])('typechecks $name against the public writer contract', ({ capabilities }) => {
			parser.javascript = parserName === 'javascript';
			const source = `export interface Props {
				value: string | number | null;
				items: { id: string; value: string }[];
			}
			export function Scene(props: Props) @{
				<view>
					Heading {props.value}
					@for (const item of props.items; key item.id) {
						<label>{item.value as string}</label>
					}
				</view>
			}`;
			const result = compile(source, '/src/Scene.tsrx', {
				renderer: { ...renderer, text: 'host', capabilities },
				hmr: false,
				output: 'ts',
			});
			expect(
				typecheck(
					result.code,
					`import { Scene } from './scene';
					Scene({ value: 1, items: [{ id: 'one', value: 'first' }] });`,
				),
			).toEqual([]);
		});

		it.each([
			`export const Scene: (props: Props) => void = (props) => @{ <label value={props.label} /> };`,
			`export const Scene = ((props) => @{ <label value={props.label} /> }) satisfies ((props: Props) => void);`,
			`export const Scene = ((props) => @{ <label value={props.label} /> }) as ((props: Props) => void);`,
		])('preserves contextual props types for %s', (component) => {
			parser.javascript = parserName === 'javascript';
			const result = compile(`interface Props { label: string }\n${component}`, '/src/Scene.tsrx', {
				renderer,
				hmr: false,
				output: 'ts',
			});
			expect(
				typecheck(result.code, `import { Scene } from './scene'; Scene({ label: 'ok' });`),
			).toEqual([]);
			const misuse = typecheck(result.code, `import { Scene } from './scene'; Scene({});`);
			expect(misuse).toHaveLength(1);
			expect(misuse[0]).toMatchObject({ file: 'consumer.ts', code: 2345 });
			expect(misuse[0].message).toMatch(/label.*missing|missing.*label/);
		});

		it('retains TypeScript declarations and expressions in ordinary hook modules', () => {
			parser.javascript = parserName === 'javascript';
			const source = `import { useState } from 'octane';
			import type { Label } from './types';
			export type { Label as PublicLabel };
			export enum Mode { Quiet, Loud }
			export namespace Domain { export interface Value { label: string } }
			export class Box<T> { constructor(public readonly value: T) {} }
			export function identity(value: string): 'text';
			export function identity<T>(value: T): T;
			export function identity<T>(value: T): T | 'text' { return typeof value === 'string' ? 'text' : value; }
			export const initial = { label: 'first' as Label } satisfies Domain.Value;
			export function useValue<T extends Domain.Value>(value: T | null) {
				const [current, update, getCurrent] = useState<T>(value!);
				return { current, update, getCurrent };
			}`;
			const result = compile(source, '/src/useValue.ts', { renderer, hmr: false, output: 'ts' });
			expect(result.lang).toBe('ts');
			expect(
				typecheck(
					result.code,
					`import { Box, identity, initial, Mode, useValue, type Domain, type PublicLabel } from './scene';
			const value: Domain.Value = new Box(identity(initial)).value;
			const kind: 'text' = identity('input');
			const state = useValue(value);
			const current: PublicLabel = state.getCurrent().label;
			state.update({ label: current + Mode.Loud });`,
					{ 'types.ts': 'export type Label = string;' },
				),
			).toEqual([]);
			const parsed = ts.createSourceFile('scene.ts', result.code, ts.ScriptTarget.Latest, true);
			expect(parsed.statements.some(ts.isEnumDeclaration)).toBe(true);
			expect(parsed.statements.some(ts.isModuleDeclaration)).toBe(true);
			const kinds = new Set<ts.SyntaxKind>();
			const visit = (node: ts.Node) => {
				kinds.add(node.kind);
				ts.forEachChild(node, visit);
			};
			visit(parsed);
			expect(kinds.has(ts.SyntaxKind.SatisfiesExpression)).toBe(true);
			expect(kinds.has(ts.SyntaxKind.NonNullExpression)).toBe(true);
			const box = parsed.statements.find(ts.isClassDeclaration)!;
			const constructor = box.members.find(ts.isConstructorDeclaration)!;
			expect(constructor.parameters[0].modifiers?.map((modifier) => modifier.kind)).toEqual([
				ts.SyntaxKind.PublicKeyword,
				ts.SyntaxKind.ReadonlyKeyword,
			]);
		});

		it('preserves typed utility modules without Octane imports', () => {
			parser.javascript = parserName === 'javascript';
			const result = compile(
				`export interface Model { label: string }\nexport const model: Model = { label: 'ok' };`,
				'/src/model.ts',
				{ renderer, hmr: false, output: 'ts' },
			);
			expect(result.lang).toBe('ts');
			expect(
				typecheck(
					result.code,
					`import { model, type Model } from './scene'; const copy: Model = model;`,
				),
			).toEqual([]);
		});

		it('preserves type-only Octane imports while retargeting runtime hooks', () => {
			parser.javascript = parserName === 'javascript';
			const result = compile(
				`import type { OctaneNode } from 'octane';
				 import { useState, type OctaneNode as NodeAlias } from 'octane';
				 export function useText(initial: OctaneNode): NodeAlias {
					 const [value] = useState<OctaneNode>(initial);
					 return value;
				 }`,
				'/src/useText.ts',
				{ renderer, hmr: false, output: 'ts' },
			);
			expect(
				typecheck(
					result.code,
					`import { useText } from './scene'; const value: string | number | null = useText('ok');`,
					{
						'octane.d.ts': `export type OctaneNode = string | number | null;`,
					},
				),
			).toEqual([]);
		});

		it('preserves generic component props while inferring the lowered writer return type', () => {
			parser.javascript = parserName === 'javascript';
			const result = compile(
				`import type { OctaneNode } from 'octane';
				 export function Scene<T extends { label: string }>(props: { value: T }): OctaneNode @{
					<label value={props.value.label} />
				 }`,
				'/src/Scene.tsrx',
				{ renderer, hmr: false, output: 'ts' },
			);
			const types = {
				'octane.d.ts': `export type OctaneNode = string | number | null;`,
			};
			expect(
				typecheck(
					result.code,
					`import { Scene } from './scene'; Scene({ value: { label: 'ok', extra: 1 } });`,
					types,
				),
			).toEqual([]);
			const misuse = typecheck(
				result.code,
				`import { Scene } from './scene'; Scene({ value: {} });`,
				types,
			);
			expect(misuse).toHaveLength(1);
			expect(misuse[0]).toMatchObject({ file: 'consumer.ts', code: 2741 });
			expect(misuse[0].message).toMatch(/label.*missing|missing.*label/);
		});

		it('preserves return values when a parenthesized expression contains a multiline comment', () => {
			parser.javascript = parserName === 'javascript';
			const result = compile(
				`export function read(): { label: string } {
					return (/* expression comment
						whose newline must not terminate the return */ { label: 'kept' });
				}`,
				'/src/read.ts',
				{ renderer, hmr: false, output: 'ts' },
			);
			expect(
				typecheck(
					result.code,
					`import { read } from './scene'; const label: string = read().label;`,
				),
			).toEqual([]);
			const { outputText } = ts.transpileModule(result.code, {
				compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
			});
			const module = evaluateCompiledFixtureCode(outputText, '/src/read.ts', 'client', {
				[renderer.module]: { assertValdiCompilerAbi() {} },
			});
			expect(module.read()).toEqual({ label: 'kept' });
		});

		it('preserves Valdi declaration annotations verbatim on their original declarations', () => {
			parser.javascript = parserName === 'javascript';
			const comments = {
				Model: `/**\n * @ExportModel({ ios: 'SCExampleModel', android: 'com.example.Model' })\n * Keep  two spaces and \\n literal.\n */`,
				Props: '/** @Component */\n/** @ViewModel */',
				Context: '/** @Context */',
				Scene: '/** @Component */',
			};
			const source = `${comments.Model}\nexport interface Model { label: string }\n${comments.Props}\nexport interface Props { model: Model }\n${comments.Context}\nexport class Context { constructor(public readonly name: string) {} }\n${comments.Scene}\nexport function Scene(props: Props) @{ <label value={props.model.label} /> }`;
			const result = compile(source, '/src/Scene.tsrx', { renderer, hmr: false, output: 'ts' });
			const parsed = ts.createSourceFile('scene.ts', result.code, ts.ScriptTarget.Latest, true);
			for (const [name, expected] of Object.entries(comments)) {
				const declaration = parsed.statements.find(
					(node) =>
						((ts.isInterfaceDeclaration(node) || ts.isClassDeclaration(node)) &&
							node.name?.text === name) ||
						(ts.isVariableStatement(node) &&
							node.declarationList.declarations.some(
								(declaration) =>
									ts.isIdentifier(declaration.name) && declaration.name.text === name,
							)),
				)!;
				expect(declaration).toBeDefined();
				const actual = (ts.getLeadingCommentRanges(result.code, declaration.pos) ?? [])
					.map(({ pos, end }) => result.code.slice(pos, end))
					.join('\n');
				expect(actual).toBe(expected);
			}
			expect(
				typecheck(
					result.code,
					`import { Scene, Context } from './scene'; Scene({ model: { label: new Context('ok').name } });`,
				),
			).toEqual([]);
		});

		it.each(['.ts', '.tsrx'])(
			'preserves each annotation once on plain %s declarations and members',
			(extension) => {
				parser.javascript = parserName === 'javascript';
				const comments = {
					Model: "/** @ExportModel({ ios: 'SCModel', android: 'com.example.Model' }) */",
					label: '/** Model label.\n\t * Keep  two spaces.\n\t */',
					Store: '/** @Context */',
					value: '/** The current model. */',
					read: '/** Read the current label.\n\t * Preserve\tthis tab too.\n\t */',
				};
				const source = `${comments.Model}\nexport interface Model {\n\t${comments.label}\n\tlabel: string;\n}\n${comments.Store}\nexport class Store {\n\t${comments.value}\n\treadonly value: Model = { label: 'ok' };\n\t${comments.read}\n\tread(): string { return this.value.label; }\n}`;
				const result = compile(source, `/src/model${extension}`, {
					renderer,
					hmr: false,
					output: 'ts',
				});
				const parsed = ts.createSourceFile('scene.ts', result.code, ts.ScriptTarget.Latest, true);
				const model = parsed.statements.find(ts.isInterfaceDeclaration)!;
				const store = parsed.statements.find(ts.isClassDeclaration)!;
				for (const [declaration, expected] of [
					[model, comments.Model],
					[model.members[0], comments.label],
					[store, comments.Store],
					[store.members[0], comments.value],
					[store.members[1], comments.read],
				] as const) {
					const actual = (ts.getLeadingCommentRanges(result.code, declaration.pos) ?? []).map(
						({ pos, end }) => result.code.slice(pos, end),
					);
					expect(actual).toEqual([expected]);
					expect(result.code.split(expected)).toHaveLength(2);
				}
				expect(
					typecheck(
						result.code,
						`import { Store, type Model } from './scene'; const model: Model = new Store().value; const label: string = new Store().read();`,
					),
				).toEqual([]);
			},
		);

		it('maps preserved type identifiers, generic arguments and assertions to authored positions', () => {
			parser.javascript = parserName === 'javascript';
			const source = `import { useState } from 'octane';
interface SceneProps { initial: number }
type StateValue = number;
export function Scene(props: SceneProps) @{
	const [value] = useState<StateValue>(props.initial);
	<label value={value as number} />
}`;
			const result = compile(source, '/src/Scene.tsrx', { renderer, hmr: false, output: 'ts' });
			expect(result.map.sourcesContent).toEqual([source]);
			const position = (text: string, token: string, last = false) => {
				const offset = last ? text.lastIndexOf(token) : text.indexOf(token);
				expect(offset).toBeGreaterThanOrEqual(0);
				const before = text.slice(0, offset);
				return [before.split('\n').length - 1, offset - before.lastIndexOf('\n') - 1];
			};
			for (const [token, last] of [
				['SceneProps', false],
				['StateValue', true],
				['value as number', false],
				['number', true],
			] as const) {
				const [line, column] = position(result.code, token, last);
				const [authoredLine, authoredColumn] = position(source, token, last);
				expect(decodeMappings(result.map.mappings)[line]).toContainEqual([
					column,
					0,
					authoredLine,
					authoredColumn,
				]);
			}
		});

		it.each(['/src/Scene.tsrx', '/src/Scene.ts'])(
			'keeps default JavaScript output identical to explicit JavaScript for %s',
			(filename) => {
				parser.javascript = parserName === 'javascript';
				const source = filename.endsWith('.tsrx') ? SOURCE : 'export const value: number = 1;';
				const options = { renderer, hmr: false };
				expect(compile(source, filename, { ...options, output: 'js' })).toEqual(
					compile(source, filename, options),
				);
			},
		);
	},
);

describe('TypeScript output option boundaries', () => {
	it('rejects an unsupported output language', () => {
		expect(() =>
			compile(SOURCE, '/src/Scene.tsrx', {
				renderer,
				hmr: false,
				// @ts-expect-error Exercise the runtime boundary for JavaScript callers.
				output: 'tsx',
			}),
		).toThrow(/output/);
	});
	it('rejects TypeScript output for the universal renderer', () => {
		expect(() =>
			compile(SOURCE, '/src/Scene.tsrx', {
				renderer: { ...renderer, target: 'universal' },
				hmr: false,
				output: 'ts',
			}),
		).toThrow(/TypeScript|output.*ts/i);
	});
	it.each([
		[{ mode: 'server' as const }, /server/],
		[{ hmr: true }, /HMR/],
		[{ profile: true }, /profiling/],
	])('continues to reject unsupported TypeScript execution modes: %j', (options, diagnostic) => {
		expect(() =>
			compile(SOURCE, '/src/Scene.tsrx', { renderer, hmr: false, output: 'ts', ...options }),
		).toThrow(diagnostic);
	});
});
