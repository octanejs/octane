// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';
import { compileToVolarMappings, compileTypesInspection } from 'octane/compiler/volar';
import ts from 'typescript';

const renderer = {
	id: 'native',
	module: '@test/valdi-writer',
	target: 'valdi',
	server: 'unsupported',
	text: 'host',
	capabilities: ['host-text-site', 'component-runtime'],
} as const;

const source = `import { useEffect } from 'octane';
export function Scene() @{ useEffect(() => {}); <view /> }`;

describe('Valdi component runtime capability', () => {
	it('accepts supported runtime APIs only after the adapter opts in', () => {
		expect(compile(source, '/src/Scene.tsrx', { renderer, hmr: false }).diagnostics).toEqual([]);
		expect(() =>
			compile(source, '/src/Scene.tsrx', {
				renderer: { ...renderer, capabilities: ['host-text-site'] },
				hmr: false,
			}),
		).toThrow(/runtime import "useEffect"/);
	});

	it('requires host-text-site because ABI 4 children use renderText', () => {
		expect(() =>
			compile('export function Scene() @{ <view /> }', '/src/Scene.tsrx', {
				renderer: { ...renderer, capabilities: ['component-runtime'] },
				hmr: false,
			}),
		).toThrow(/component-runtime capability requires host-text-site/);
	});

	it.each(['reject', 'ignore'] as const)(
		'requires host text for ABI 4 authored child sites when text is %s',
		(text) => {
			expect(() =>
				compile('export function Scene() @{ <view /> }', '/src/Scene.tsrx', {
					renderer: { ...renderer, text },
					hmr: false,
				}),
			).toThrow(/host-text-site capability requires text: "host"/);
		},
	);

	it('preserves legacy text-ignore behavior without component-runtime', () => {
		expect(
			compile('export function Scene() @{ <view>label</view> }', '/src/Scene.tsrx', {
				renderer: { ...renderer, text: 'ignore', capabilities: [] },
				hmr: false,
			}).diagnostics,
		).toEqual([]);
	});

	it('projects component values and native child types into both authoring views', () => {
		const input = `import { createContext, useContext, useEffect } from 'octane';
import type { Context, OctaneNode } from 'octane';
const Theme: Context<string> = createContext('light');
export function Scene(props: { children?: OctaneNode }) @{ const theme = useContext(Theme); useEffect(() => {}); <view>{props.children}{theme}</view> }`;
		const { id, ...entry } = renderer;
		const options = {
			renderers: {
				registry: { [id]: entry },
				rules: [{ include: '**/*.native.tsrx', renderer: id }],
			},
		};
		const imports = (code: string) => {
			const ast = ts.createSourceFile(
				'scene.tsx',
				code,
				ts.ScriptTarget.Latest,
				true,
				ts.ScriptKind.TSX,
			);
			return ast.statements.filter(ts.isImportDeclaration).flatMap((statement) => {
				const bindings = statement.importClause?.namedBindings;
				return bindings && ts.isNamedImports(bindings)
					? bindings.elements.map((specifier) => [
							(statement.moduleSpecifier as ts.StringLiteral).text,
							specifier.propertyName?.text ?? specifier.name.text,
							specifier.name.text,
						])
					: [];
			});
		};
		for (const project of [compileToVolarMappings, compileTypesInspection]) {
			const result = project(input, '/src/Scene.native.tsrx', options);
			expect(imports(result.code)).toEqual([
				['octane', 'useEffect', 'useEffect'],
				[renderer.module, 'createContext', 'createContext'],
				[renderer.module, 'useContext', 'useContext'],
				[renderer.module, 'Context', 'Context'],
				[renderer.module, 'ValdiChild', 'OctaneNode'],
			]);
		}
	});
});
