// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { compile } from 'octane/compiler';
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

const PATHS = {
	octane: [fileURLToPath(new URL('../../src/index.ts', import.meta.url))],
	'octane/server': [fileURLToPath(new URL('../../src/server/index.ts', import.meta.url))],
	'octane/internal/client': [
		fileURLToPath(new URL('../../src/internal/client.ts', import.meta.url)),
	],
	'octane/internal/server': [
		fileURLToPath(new URL('../../src/internal/server.ts', import.meta.url)),
	],
};

// Resolve against the runtime's actual signatures: synthetic adapters cannot
// catch a generated numeric slot or helper call that its real declaration rejects.
function typecheck(files: Record<string, string>) {
	const directory = mkdtempSync(join(tmpdir(), 'octane-web-ts-'));
	try {
		for (const [name, source] of Object.entries(files))
			writeFileSync(join(directory, name), source);
		const program = ts.createProgram({
			rootNames: Object.keys(files).map((name) => join(directory, name)),
			options: {
				module: ts.ModuleKind.ESNext,
				moduleResolution: ts.ModuleResolutionKind.Bundler,
				noEmit: true,
				strict: true,
				verbatimModuleSyntax: true,
				skipLibCheck: true,
				target: ts.ScriptTarget.ESNext,
				lib: ['lib.esnext.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
				types: [],
				paths: PATHS,
			},
		});
		// The runtime has its own project checks. Here its types supply the real
		// contract, while diagnostics belong to the emitted module and its consumer.
		const diagnostics = [
			...program.getOptionsDiagnostics(),
			...Object.keys(files).flatMap((name) => {
				const source = program.getSourceFile(join(directory, name))!;
				return [
					...program.getSyntacticDiagnostics(source),
					...program.getSemanticDiagnostics(source),
				];
			}),
		];
		return diagnostics.map((diagnostic) => ({
			file: diagnostic.file?.fileName.slice(directory.length + 1),
			code: diagnostic.code,
			message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
		}));
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

const COMPONENTS = {
	empty: `export function App() @{ <p>ready</p> }`,
	annotated: `export interface Props { label: string }
		export function format(__s: string): string { return __s.toUpperCase(); }
		export function App(props: Props) @{
			const label = [props.label].map((__s: string) => format(__s))[0];
			<p>{label as string}</p>
		}`,
	generic: `export function App<T extends { label: string }>(props: { value: T }) @{
		<p>{props.value.label as string}</p>
	}
	export function Defaulted<T = string, U = T>(props: { value: U; show: boolean }) @{
		<section>@if (props.show) {
			const value: U = props.value;
			<p>{String(value)}</p>
		}</section>
	}`,
	contextual: `interface Props { label: string }
		export const App: (props: Props) => unknown = props => @{ <p>{props.label as string}</p> };`,
	asserted: `interface Props { label: string }
		export const App = (props => @{ <p>{props.label as string}</p> }) as ((props: Props) => unknown);`,
	satisfies: `interface Props { label: string }
		export const App = (props => @{ <p>{props.label as string}</p> }) satisfies ((props: Props) => unknown);`,
	wrappedDefault: `interface Props { label: string }
		export default ((props) => @{ <p title={props.label} /> }) satisfies ((props: Props) => unknown);`,
	returned: `export interface Props { label: string }
		export function App(props: Props) { return <p>{props.label as string}</p>; }`,
};

const IMPORTS = `import { App as Empty } from './empty';
import { App as Annotated } from './annotated';
import { App as Generic, Defaulted } from './generic';
import { App as Contextual } from './contextual';
import { App as Asserted } from './asserted';
import { App as Satisfied } from './satisfies';
import Default from './wrappedDefault';
import { App as Returned } from './returned';
const Specialized = Generic<{ label: string; count: number }>;`;

for (const parserName of ['native', 'javascript']) {
	for (const mode of ['client', 'server'] as const) {
		describe(`web TypeScript output with the ${parserName} parser in ${mode} mode`, () => {
			it('preserves authored component props and generic declarations for TypeScript consumers', () => {
				parser.javascript = parserName === 'javascript';
				const files: Record<string, string> = {};
				for (const [name, source] of Object.entries(COMPONENTS)) {
					const result = compile(source, `/src/${name}.tsrx`, { mode, hmr: false, output: 'ts' });
					expect(result.lang).toBe('ts');
					expect(result.diagnostics).toEqual([]);
					files[`${name}.ts`] = result.code;
				}
				files['good.ts'] = `${IMPORTS}
					Empty();
					const a: Parameters<typeof Annotated>[0] = { label: 'ok' };
					const b: Parameters<typeof Specialized>[0] = { value: { label: 'ok', count: 1 } };
					const defaults: Parameters<typeof Defaulted<string>>[0] = { value: 'ok', show: true };
					const c: Parameters<typeof Contextual>[0] = { label: 'ok' };
					const d: Parameters<typeof Asserted>[0] = { label: 'ok' };
					const e: Parameters<typeof Satisfied>[0] = { label: 'ok' };
					const f: Parameters<typeof Returned>[0] = { label: 'ok' };
					const g: Parameters<typeof Default>[0] = { label: 'ok' };`;
				files['bad.ts'] = `${IMPORTS}
					const a: Parameters<typeof Annotated>[0] = {};
					const b: Parameters<typeof Specialized>[0] = { value: { label: 'ok' } };
					const c: Parameters<typeof Contextual>[0] = {};
					const d: Parameters<typeof Asserted>[0] = {};
					const e: Parameters<typeof Satisfied>[0] = {};
					const f: Parameters<typeof Returned>[0] = {};
					const g: Parameters<typeof Default>[0] = {};`;
				const diagnostics = typecheck(files);
				expect(diagnostics.filter((diagnostic) => diagnostic.file !== 'bad.ts')).toEqual([]);
				expect(diagnostics).toHaveLength(7);
				for (const diagnostic of diagnostics) {
					expect(diagnostic.code).toBe(2741);
					expect(diagnostic.message).toMatch(/Property '(label|count)' is missing/);
				}
			});

			it('emits valid typed hook and control-flow code with scoped type aliases', () => {
				parser.javascript = parserName === 'javascript';
				vi.stubEnv('OCTANE_COMPILE_FROZEN_AST', '1');
				vi.stubEnv('OCTANE_COMPILE_ASSERT_LOC', '1');
				const source = `import { useState, useMemo, useCallback, useLayoutEffect } from 'octane';
					export interface Props<T> { items: T[]; visible: boolean; prefix: string; report: (value: string) => void }
					export function App<T extends { id: string; label: string }>(props: Props<T>) @{
						type Label = string;
						type Item = T;
						type Key = string;
						const [count, setCount, getCount] = useState<number | null>(null);
						const suffix = useMemo<Label>(() => props.prefix + (count ?? 0));
						const click = useCallback(() => setCount((getCount() ?? 0) + 1));
						useLayoutEffect(() => { props.report(suffix); });
						<section>
							@if (props.visible) {
								const labels = props.items.map(item => item.label).join(',');
								const namedLabels = props.items.map(__s => __s.label).join(',');
								<ul title={labels + namedLabels}>@for (const item of props.items; key item.id as Key) {
									type ItemLabel = Label;
									const selected: Item = item;
									const read = (__s: T): ItemLabel => __s.label;
									const label: ItemLabel = read(selected);
									<li><button onClick={click}>{label + suffix}</button></li>
								}</ul>
							} @else { <p>hidden</p> }
						</section>
					}
					export function First(props: { show: boolean }) @{
						type Value = string;
						<section>@if (props.show) {
							const value: Value = 'first';
							<p>{value as string}</p>
						}</section>
					}
					export function Second(props: { show: boolean }) @{
						type Value = number;
						<section>@if (props.show) {
							const value: Value = 2;
							<p>{String(value)}</p>
							}</section>
					}
					export function Boundary(props: { read: () => string }) @{
						type Failure = { message: string };
						@try { <p>{props.read() as string}</p> }
						@catch (error: unknown) {
							const failure = error as Failure;
							<p>{failure.message as string}</p>
						}
					}`;
				const result = compile(source, '/src/control.tsrx', { mode, hmr: false, output: 'ts' });
				const catchMisuse = compile(
					`export function App() @{
					@try { <p>ready</p> }
					@catch (error: unknown) { const message: string = error; <p>{message}</p> }
				}`,
					'/src/catch-misuse.tsrx',
					{ mode, hmr: false, output: 'ts' },
				);
				const catchDiagnostics = typecheck({ 'catch-misuse.ts': catchMisuse.code });
				expect(catchDiagnostics).toEqual([
					{
						file: 'catch-misuse.ts',
						code: 2322,
						message: "Type 'unknown' is not assignable to type 'string'.",
					},
				]);
				expect(
					typecheck({
						'control.ts': result.code,
						'consumer.ts': `import { App } from './control'; const props: Parameters<typeof App>[0] = { items: [{ id: 'a', label: 'A' }], visible: true, prefix: ':', report(value) { value.toUpperCase(); } };`,
					}),
				).toEqual([]);
			});

			it('preserves declaration comments and authored type-expression source locations', () => {
				parser.javascript = parserName === 'javascript';
				const annotation = '/** Public view props.\n * Keep  two spaces.\n */';
				const componentAnnotation = '/** Public component */';
				const source = `import { useState } from 'octane';
${annotation}
export interface ViewProps { initial: string }
type StateValue = string | null;
${componentAnnotation}
export function App(props: ViewProps) @{
	const [value] = useState<StateValue>(props.initial);
	<p>{value as string}</p>
}`;
				const result = compile(source, '/src/view.tsrx', { mode, hmr: false, output: 'ts' });
				const parsed = ts.createSourceFile('view.ts', result.code, ts.ScriptTarget.Latest, true);
				const declaration = parsed.statements.find(ts.isInterfaceDeclaration)!;
				expect(
					(ts.getLeadingCommentRanges(result.code, declaration.pos) ?? []).map(({ pos, end }) =>
						result.code.slice(pos, end),
					),
				).toEqual([annotation]);
				const component = parsed.statements.find(
					(node) =>
						(ts.isFunctionDeclaration(node) && node.name?.text === 'App') ||
						(ts.isVariableStatement(node) &&
							node.declarationList.declarations.some(
								(declaration) =>
									ts.isIdentifier(declaration.name) && declaration.name.text === 'App',
							)),
				)!;
				expect(
					(ts.getLeadingCommentRanges(result.code, component.pos) ?? []).map(({ pos, end }) =>
						result.code.slice(pos, end),
					),
				).toEqual([componentAnnotation]);
				expect(result.code.split(componentAnnotation)).toHaveLength(2);
				expect(result.map.sourcesContent).toEqual([source]);
				const position = (text: string, token: string, last = false) => {
					const offset = last ? text.lastIndexOf(token) : text.indexOf(token);
					expect(offset).toBeGreaterThanOrEqual(0);
					const before = text.slice(0, offset);
					return [before.split('\n').length - 1, offset - before.lastIndexOf('\n') - 1];
				};
				for (const [token, last] of [
					['ViewProps', false],
					['StateValue', true],
					['value as string', false],
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

			it('keeps default JavaScript output identical to explicitly requested JavaScript', () => {
				parser.javascript = parserName === 'javascript';
				const source = COMPONENTS.annotated;
				const options = { mode, hmr: false };
				expect(compile(source, '/src/App.tsrx', { ...options, output: 'js' })).toEqual(
					compile(source, '/src/App.tsrx', options),
				);
			});
		});
	}
}
