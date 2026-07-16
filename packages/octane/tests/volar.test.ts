import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, it, expect } from 'vitest';
import { compileToVolarMappings } from 'octane/compiler/volar';

const OBJECT_RENDERERS = {
	registry: {
		object: {
			module: '@fixture/object-renderer',
			intrinsics: '@fixture/object-intrinsics',
		},
	},
	rules: [{ include: '**/*.object.tsrx', renderer: 'object' }],
};

/**
 * Volar mappings tests. We exercise the IDE-facing virtual-TSX pipeline:
 *   - Returns a `VolarMappingsResult` (code + mappings + cssMappings + errors).
 *   - Generates TSX (`code`) containing the user identifiers (so TypeScript's
 *     language service can see / type-check them).
 *   - Reports parse errors via `errors` array rather than throwing, so the
 *     editor can show diagnostics on an in-progress file.
 *
 * We don't snapshot the full TSX — its exact shape is `@tsrx/core`'s
 * `createJsxTransform` output, which evolves separately. We just verify
 * the contract.
 */
describe('compileToVolarMappings', () => {
	it('returns a VolarMappingsResult shape', () => {
		const src =
			"import { useState } from 'octane';\n" +
			'export function Counter() @{\n' +
			'  const [n, setN] = useState(0);\n' +
			'  <button onClick={() => setN(n + 1)}>{n as string}</button>\n' +
			'}\n';
		const result = compileToVolarMappings(src, 'counter.tsrx');
		expect(typeof result.code).toBe('string');
		expect(Array.isArray(result.mappings)).toBe(true);
		expect(Array.isArray(result.cssMappings)).toBe(true);
		expect(Array.isArray(result.errors)).toBe(true);
		expect(result.sourceAst).toBeDefined();
		expect(result.sourceAst.type).toBe('Program');
	});

	it('preserves user identifiers in the generated TSX', () => {
		const src =
			"import { useState } from 'octane';\n" +
			'export function MyButton(props) @{\n' +
			'  const [count, setCount] = useState(0);\n' +
			"  <button onClick={() => setCount(count + 1)}>{(props.label + ':' + count) as string}</button>\n" +
			'}\n';
		const result = compileToVolarMappings(src, 'my-button.tsrx');
		// The user's identifiers must appear in the virtual TSX so the language
		// service can resolve them on hover / autocomplete.
		expect(result.code).toContain('MyButton');
		expect(result.code).toContain('count');
		expect(result.code).toContain('setCount');
		expect(result.code).toContain('props.label');
		expect(result.errors).toEqual([]);
	});

	it('produces mappings entries pointing source → generated positions', () => {
		const src = "export function Foo() @{ <span>{'hi'}</span> }\n";
		const result = compileToVolarMappings(src, 'foo.tsrx');
		expect(result.mappings.length).toBeGreaterThan(0);
		// Each Volar mapping carries parallel source/generated offset arrays,
		// length arrays, and a `data` flag bag.
		for (const m of result.mappings) {
			expect(Array.isArray(m.sourceOffsets)).toBe(true);
			expect(Array.isArray(m.generatedOffsets)).toBe(true);
			expect(Array.isArray(m.lengths)).toBe(true);
			expect(m.sourceOffsets.length).toBe(m.generatedOffsets.length);
			expect(m.data).toBeDefined();
		}
	});

	it('selects renderer intrinsics by canonical filename and shifts virtual-code mappings', () => {
		const src = 'export function Scene() @{ <line path="route"><mesh /></line> }\n';
		const baseline = compileToVolarMappings(src, '/src/Scene.object.tsrx');
		const object = compileToVolarMappings(src, String.raw`\src\Scene.object.tsrx?used`, {
			renderers: OBJECT_RENDERERS,
		});
		const dom = compileToVolarMappings(src, '/src/Scene.tsrx', {
			renderers: OBJECT_RENDERERS,
		});
		const prelude = '/** @jsxImportSource @fixture/object-intrinsics */\n';

		expect(object.code.startsWith(prelude)).toBe(true);
		expect(dom.code).not.toContain('@jsxImportSource');
		expect(object.code.slice(prelude.length)).toBe(baseline.code);
		expect(object.mappings).toHaveLength(baseline.mappings.length);
		for (let index = 0; index < object.mappings.length; index++) {
			expect(object.mappings[index].sourceOffsets).toEqual(baseline.mappings[index].sourceOffsets);
			expect(object.mappings[index].generatedOffsets).toEqual(
				baseline.mappings[index].generatedOffsets.map((offset) => offset + prelude.length),
			);
		}
	});

	it('keeps conflicting DOM and renderer intrinsic types isolated per virtual file', () => {
		const root = mkdtempSync(join(tmpdir(), 'octane-volar-renderers-'));
		try {
			const moduleRoot = join(root, 'node_modules/@fixture/object-intrinsics');
			mkdirSync(moduleRoot, { recursive: true });
			writeFileSync(
				join(moduleRoot, 'package.json'),
				JSON.stringify({
					name: '@fixture/object-intrinsics',
					exports: { './jsx-runtime': './jsx-runtime.d.ts' },
				}),
			);
			writeFileSync(
				join(moduleRoot, 'jsx-runtime.d.ts'),
				`export namespace JSX {
	interface IntrinsicElements {
		line: { path: number };
		path: { vertices: number };
		audio: { listener: number };
		source: { buffer: number };
		mesh: { objectOnly?: boolean };
	}
}
`,
			);
			writeFileSync(
				join(root, 'dom-intrinsics.d.ts'),
				`declare namespace JSX {
	interface IntrinsicElements {
		line: { path: string };
		path: { d: string };
		audio: { src: string };
		source: { src: string };
		mesh: { domOnly?: boolean };
	}
}
`,
			);
			const augmentationFile = join(root, 'object-augmentation.d.ts');
			writeFileSync(
				augmentationFile,
				`import '@fixture/object-intrinsics/jsx-runtime';
declare module '@fixture/object-intrinsics/jsx-runtime' {
	namespace JSX {
		interface IntrinsicElements {
			customThing: { custom: string };
		}
	}
}
`,
			);

			const dom = compileToVolarMappings(
				'export function DomScene() @{ <><line path="route"><mesh domOnly /></line><path d="M0 0" /><audio src="tone.mp3" /><source src="tone.ogg" /></> }\n',
				'/src/DomScene.tsrx',
				{ renderers: OBJECT_RENDERERS },
			);
			const object = compileToVolarMappings(
				'export function ObjectScene() @{ <><line path={1}><mesh objectOnly /></line><path vertices={3} /><audio listener={1} /><source buffer={2} /><customThing custom="augmented" /></> }\n',
				'/src/ObjectScene.object.tsrx',
				{ renderers: OBJECT_RENDERERS },
			);
			const invalidDom = compileToVolarMappings(
				'export function InvalidDomScene() @{ <customThing custom="dom" /> }\n',
				'/src/InvalidDomScene.tsrx',
				{ renderers: OBJECT_RENDERERS },
			);
			const domFile = join(root, 'DomScene.tsx');
			const objectFile = join(root, 'ObjectScene.tsx');
			const invalidDomFile = join(root, 'InvalidDomScene.tsx');
			writeFileSync(domFile, dom.code);
			writeFileSync(objectFile, object.code);
			writeFileSync(invalidDomFile, invalidDom.code);

			const program = ts.createProgram({
				rootNames: [
					join(root, 'dom-intrinsics.d.ts'),
					augmentationFile,
					domFile,
					objectFile,
					invalidDomFile,
				],
				options: {
					jsx: ts.JsxEmit.Preserve,
					module: ts.ModuleKind.ESNext,
					moduleResolution: ts.ModuleResolutionKind.Bundler,
					noEmit: true,
					strict: true,
					target: ts.ScriptTarget.ESNext,
				},
			});
			const diagnostics = ts.getPreEmitDiagnostics(program);
			expect(diagnostics).toHaveLength(1);
			expect(diagnostics[0].file?.fileName).toBe(invalidDomFile);
			expect(ts.flattenDiagnosticMessageText(diagnostics[0].messageText, '\n')).toMatch(
				/customThing.*JSX\.IntrinsicElements/,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('reports a typed error array when there are no parse errors', () => {
		// Hard parse errors still throw (the underlying acorn parser can't
		// recover from arbitrary brace mismatches). When parsing succeeds the
		// `errors` field is a typed empty array the language server can append
		// to as it runs further analysis.
		const src = "export function Ok() @{ <span>{'hi'}</span> }\n";
		const result = compileToVolarMappings(src, 'ok.tsrx');
		expect(Array.isArray(result.errors)).toBe(true);
		expect(result.errors).toEqual([]);
	});

	it('handles @if / @for / @try / @switch directives', () => {
		const src =
			"import { useState } from 'octane';\n" +
			'export function App(props) @{\n' +
			'  const [n] = useState(0);\n' +
			'  <div>\n' +
			"    @if (n > 0) { <p>{'pos'}</p> } @else { <p>{'zero'}</p> }\n" +
			'    @for (const x of props.items; key x.id) { <li>{x.label as string}</li> }\n' +
			'    @switch (n) {\n' +
			"      @case 0: { <span>{'z'}</span> }\n" +
			"      @default: { <span>{'else'}</span> }\n" +
			'    }\n' +
			'  </div>\n' +
			'}\n';
		const result = compileToVolarMappings(src, 'app.tsrx');
		expect(result.errors).toEqual([]);
		expect(result.code.length).toBeGreaterThan(0);
		// Identifiers from each directive should leak through to the TSX.
		expect(result.code).toContain('App');
		expect(result.code).toContain('props.items');
		expect(result.code).toContain('x.label');
	});

	it('exposes the (transformed) AST for editor integrations that need to walk it', () => {
		const src = "export function Foo() @{ <p>{'x'}</p> }\n";
		const result = compileToVolarMappings(src, 'foo.tsrx');
		// The AST is the same node graph the transform pass walked (it mutates
		// in place, which is why JSXCodeBlock bodies get lowered to plain
		// BlockStatements en route to TSX). Language plugins use it for symbol
		// indexing, hover queries, refactorings — they read the post-transform
		// shape because that's what the `mappings` array points into.
		expect(result.sourceAst.type).toBe('Program');
		const fnDecl = (result.sourceAst.body as any[]).find(
			(n) => n.type === 'ExportNamedDeclaration' && n.declaration?.type === 'FunctionDeclaration',
		);
		expect(fnDecl?.declaration?.id?.name).toBe('Foo');
	});
});
