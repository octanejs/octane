// @vitest-environment node

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { describe, it, expect } from 'vitest';
import { compileToVolarMappings, compileTypesInspection } from 'octane/compiler/volar';
import { bundleVolarCompiler } from '../../scripts/bundle-volar.mjs';

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
 * Minimal `octane/jsx-runtime` stub for the type-level programs below: the DOM
 * renderer's virtual TSX pins `@jsxImportSource octane`, so a program that
 * compiles it needs the module resolvable from its root.
 */
function writeOctaneJsxRuntimeStub(root: string, intrinsics: string): void {
	const octaneRoot = join(root, 'node_modules/octane');
	mkdirSync(octaneRoot, { recursive: true });
	writeFileSync(
		join(octaneRoot, 'package.json'),
		JSON.stringify({ name: 'octane', exports: { './jsx-runtime': './jsx-runtime.d.ts' } }),
	);
	writeFileSync(
		join(octaneRoot, 'jsx-runtime.d.ts'),
		`export namespace JSX {\n\tinterface IntrinsicElements {\n${intrinsics}\n\t}\n}\n`,
	);
}

/**
 * Volar mappings tests. We exercise the IDE-facing virtual-TSX pipeline:
 *   - Returns a `VolarMappingsResult` plus Octane's non-fatal diagnostics.
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
		expect(Array.isArray(result.diagnostics)).toBe(true);
		expect(result.sourceAst).toBeDefined();
		expect(result.sourceAst.type).toBe('Program');
		expect(result.generatedAst).toBeDefined();
		expect(result.generatedAst.type).toBe('Program');
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

	it.each([false, true])(
		'type-checks authored Suspense alongside pending directives (nativeReads: %s)',
		(nativeReads) => {
			const source = `import { Suspense } from 'octane';
export function Panel(props: { primaryLabel: string; pendingLabel: string }) @{
	<Suspense fallback={'outer'}>
		@try {
			<span>{props.primaryLabel.toUpperCase()}</span>
		} @pending {
			<span>{props.pendingLabel.toUpperCase()}</span>
		} @catch (error) {
			<span>{String(error)}</span>
		}
	</Suspense>
}
`;
			const root = mkdtempSync(join(tmpdir(), 'octane-volar-suspense-'));
			try {
				mkdirSync(join(root, 'node_modules'));
				symlinkSync(
					fileURLToPath(new URL('../..', import.meta.url)),
					join(root, 'node_modules/octane'),
					'dir',
				);
				const validSources = [
					source,
					source
						.replaceAll('Suspense', 'Boundary')
						.replace('import { Boundary }', 'import { Suspense as Boundary }'),
					`import { Suspense } from 'octane';
export function Repeated() @{
	<Suspense fallback={'outer'}>
		@try {
			@try { <span>{'inner'}</span> } @pending {}
		} @pending {}
		@try { <span>{'sibling'}</span> } @pending { <span>{'waiting'}</span> }
	</Suspense>
}
`,
					`export function Pending() @{
	@try { <span>{'ready'}</span> } @pending {}
}
`,
				];
				const files = validSources.map((input, index) => {
					const result = compileToVolarMappings(input, `Panel${index}.tsrx`, { nativeReads });
					expect(result.errors).toEqual([]);
					expect(result.diagnostics).toEqual([]);
					if (index === 0) {
						for (const offset of [input.indexOf('Suspense'), input.indexOf('<Suspense') + 1]) {
							const mapping = result.mappings.find(
								(candidate) => candidate.sourceOffsets[0] === offset,
							);
							expect(mapping).toBeDefined();
							expect(
								result.code.slice(mapping!.generatedOffsets[0], mapping!.generatedOffsets[0] + 8),
							).toBe('Suspense');
						}
					}
					const file = join(root, `Panel${index}.tsx`);
					writeFileSync(file, result.code);
					return file;
				});
				const inspectionFile = join(root, 'Inspection.tsx');
				writeFileSync(inspectionFile, compileTypesInspection(source, 'Inspection.tsrx').code);
				files.push(inspectionFile);
				const invalidSource = source.replace('pendingLabel: string', 'pendingLabel: number');
				const invalid = compileToVolarMappings(invalidSource, 'Invalid.tsrx', { nativeReads });
				expect(invalid.errors).toEqual([]);
				const invalidFile = join(root, 'Invalid.tsx');
				writeFileSync(invalidFile, invalid.code);
				const program = ts.createProgram({
					rootNames: [...files, invalidFile],
					options: {
						jsx: ts.JsxEmit.Preserve,
						module: ts.ModuleKind.ESNext,
						moduleResolution: ts.ModuleResolutionKind.Bundler,
						noEmit: true,
						noUnusedLocals: true,
						skipLibCheck: false,
						strict: true,
						target: ts.ScriptTarget.ESNext,
						types: [],
					},
				});
				// Check the editor's virtual files against the real Octane declarations;
				// this fixture does not type-check Octane's implementation sources.
				const diagnostics = [...files, invalidFile].flatMap((file) => {
					const sourceFile = program.getSourceFile(file)!;
					return [
						...program.getSyntacticDiagnostics(sourceFile),
						...program.getSemanticDiagnostics(sourceFile),
					];
				});
				expect(
					diagnostics
						.filter(({ file }) => file?.fileName !== invalidFile)
						.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')),
				).toEqual([]);
				const invalidDiagnostics = diagnostics.filter(({ file }) => file?.fileName === invalidFile);
				expect(invalidDiagnostics.map(({ code }) => code)).toEqual([2339]);
				const authoredError = invalidSource.lastIndexOf('toUpperCase');
				expect(
					invalid.mappings.some((mapping) =>
						mapping.sourceOffsets.some(
							(offset, index) =>
								offset === authoredError &&
								mapping.generatedOffsets[index] === invalidDiagnostics[0].start,
						),
					),
				).toBe(true);
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		},
	);

	it.each([false, true])(
		'preserves typed tuple parameters and their mappings (loose: %s)',
		(loose) => {
			// esrap 2.3.6 began printing ArrayPattern annotations itself. Combined
			// with @tsrx/core 0.1.60's wrapper, a valid one-argument function was
			// printed with two annotations and TypeScript inferred two parameters.
			const source =
				'export function ratio([width, height]: [number, number]): number {\n' +
				'  return width / height;\n' +
				'}\n';
			const root = mkdtempSync(join(tmpdir(), 'octane-volar-tuple-'));
			try {
				const result = compileToVolarMappings(source, 'tuple.tsrx', { loose });
				expect(result.errors).toEqual([]);
				for (const name of ['width', 'height']) {
					const offset = source.indexOf(name);
					const mapping = result.mappings.find(
						(candidate) =>
							candidate.sourceOffsets[0] === offset && candidate.lengths[0] === name.length,
					);
					expect(mapping).toBeDefined();
					const generated = mapping!.generatedOffsets[0];
					expect(result.code.slice(generated, generated + name.length)).toBe(name);
				}
				const valid = join(root, 'tuple.tsx');
				const invalid = join(root, 'invalid.tsx');
				writeFileSync(valid, result.code + '\nexport const value: number = ratio([20, 10]);\n');
				writeFileSync(
					invalid,
					"import { ratio } from './tuple';\nratio([20, 'wrong']);\nratio(20, 10);\n",
				);
				const program = ts.createProgram({
					rootNames: [valid, invalid],
					options: {
						jsx: ts.JsxEmit.Preserve,
						module: ts.ModuleKind.ESNext,
						moduleResolution: ts.ModuleResolutionKind.Bundler,
						noEmit: true,
						skipLibCheck: false,
						strict: true,
						target: ts.ScriptTarget.ESNext,
						types: [],
					},
				});
				expect(
					ts
						.getPreEmitDiagnostics(program)
						.map(({ file, code }) => ({ file: file?.fileName, code })),
				).toEqual([
					{ file: invalid, code: 2322 },
					{ file: invalid, code: 2554 },
				]);
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		},
	);

	it('publishes the tested Volar dependency graph without duplicating Octane modules', async () => {
		const packageDir = fileURLToPath(new URL('../../', import.meta.url));
		const root = mkdtempSync(join(tmpdir(), 'octane-volar-bundle-'));
		try {
			const { metafile, dependencies } = await bundleVolarCompiler({ packageDir, outdir: root });
			const output = Object.values(metafile.outputs).find((file) => file.entryPoint)!;
			writeFileSync(join(root, 'package.json'), JSON.stringify({ type: 'module' }));
			for (const dependency of output.imports) {
				// The real helper modules retain their normal package resolution;
				// the bundle owns only the third-party parser/transform/printer.
				symlinkSync(join(packageDir, 'src/compiler', dependency.path), join(root, dependency.path));
			}
			const source =
				'export function ratio([width, height]: [number, number]) { return width / height; }\n' +
				'export function App() @{ <div>{ratio([20, 10]) as string}</div> }';
			const filename = 'published.tsrx';
			// Native Node imports the actual build product, without Vitest's
			// source aliases or a loader replacing the compiler under test.
			const actual = JSON.parse(
				execFileSync(
					process.execPath,
					[
						'--input-type=module',
						'-e',
						`import * as compiler from ${JSON.stringify(pathToFileURL(join(root, 'volar.js')).href)};
const source = ${JSON.stringify(source)};
const result = compiler.compileToVolarMappings(source, ${JSON.stringify(filename)}, { loose: true });
const inspection = compiler.compileTypesInspection(source, ${JSON.stringify(filename)});
process.stdout.write(JSON.stringify({
	exports: Object.keys(compiler),
	code: result.code,
	mappings: result.mappings,
	errors: result.errors,
	inspectionCode: inspection.code,
	nativeBody: result.sourceAst.body[1].declaration.metadata.native_tsrx_body,
}));`,
					],
					{ encoding: 'utf8' },
				),
			);
			const expected = compileToVolarMappings(source, filename, { loose: true });
			expect(actual.exports).toEqual(['compileToVolarMappings', 'compileTypesInspection']);
			expect(actual.code).toBe(expected.code);
			expect(actual.mappings).toEqual(expected.mappings);
			expect(actual.errors).toEqual([]);
			expect(actual.inspectionCode).toBe(expected.code);
			expect(actual.nativeBody).toBe(true);
			const notices = readFileSync(join(root, 'volar.LICENSES.txt'), 'utf8');
			expect(dependencies.some((id) => id.startsWith('@tsrx/core@'))).toBe(true);
			expect(dependencies.some((id) => id.startsWith('esrap@'))).toBe(true);
			for (const id of dependencies) expect(notices).toContain(`${id}\n\n`);
			expect(notices).toContain('Copyright (c) 2025 Dominic Gannaway');
			expect(notices).toContain('Permission is hereby granted, free of charge');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('rejects a public declaration that no longer matches the source JSDoc', async () => {
		const root = mkdtempSync(join(tmpdir(), 'octane-volar-stale-declaration-'));
		try {
			const compiler = join(root, 'src/compiler');
			mkdirSync(compiler, { recursive: true });
			writeFileSync(
				join(compiler, 'volar.js'),
				'/** @param {string} source */\nexport function compileToVolarMappings(source) { return source; }',
			);
			writeFileSync(
				join(compiler, 'volar.d.ts'),
				'export function compileToVolarMappings(source: number): string;',
			);
			await expect(
				bundleVolarCompiler({ packageDir: root, outdir: join(root, 'dist/compiler') }),
			).rejects.toThrow('volar.d.ts is stale');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
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

	it('maps type-only structural closing tokens to their own source boundaries', () => {
		const src =
			'const value = { list: [run(input)] };\n' +
			'export function Foo() @{ <p>{value.list[0] as string}</p> }\n';
		const result = compileToVolarMappings(src, 'foo.tsrx');

		const expectExactSpan = (text: string): void => {
			const sourceOffset = src.indexOf(text);
			const mapping = result.mappings.find(
				(candidate) =>
					candidate.sourceOffsets[0] === sourceOffset && candidate.lengths[0] === text.length,
			);
			expect(mapping).toBeDefined();
			const generatedOffset = mapping!.generatedOffsets[0];
			const generatedLength = mapping!.generatedLengths?.[0] ?? mapping!.lengths[0];
			expect(result.code.slice(generatedOffset, generatedOffset + generatedLength)).toBe(text);
		};

		// @tsrx/core's typeOnly print enables esrap `boundaryTokens`: the closing
		// object brace and computed-member bracket resolve at their own mapped
		// positions instead of inheriting the preceding token's location.
		expectExactSpan('{ list: [run(input)] }');
		expectExactSpan('value.list[0]');
	});

	it('selects renderer intrinsics by canonical filename in the mapped virtual-code print', () => {
		const src = 'export function Scene() @{ <line path="route"><mesh /></line> }\n';
		const baseline = compileToVolarMappings(src, '/src/Scene.object.tsrx');
		const object = compileToVolarMappings(src, String.raw`\src\Scene.object.tsrx?used`, {
			renderers: OBJECT_RENDERERS,
		});
		const dom = compileToVolarMappings(src, '/src/Scene.tsrx', {
			renderers: OBJECT_RENDERERS,
		});
		const prelude = '/** @jsxImportSource @fixture/object-intrinsics */\n';
		// The built-in DOM renderer pins octane's own jsx-runtime: a `.tsrx`
		// file's JSX is octane's dialect regardless of the HOST tsconfig's
		// `jsxImportSource` (a React shell hosting islands must not type them
		// against React's JSX).
		const domPrelude = '/** @jsxImportSource octane */\n';

		expect(object.code.startsWith(prelude)).toBe(true);
		expect(dom.code.startsWith(domPrelude)).toBe(true);
		expect(baseline.code.startsWith(domPrelude)).toBe(true);
		expect(object.code.slice(prelude.length)).toBe(baseline.code.slice(domPrelude.length));
		expect(object.mappings).toHaveLength(baseline.mappings.length);
		// The synthetic semantic pragma itself maps to the start of the source
		// and generated file in both variants. Authored tokens after it move by
		// exactly the difference in pragma length, as recorded by the one print's
		// native map (no post-print mapping shift).
		expect(baseline.mappings[0].sourceOffsets).toEqual([0]);
		expect(baseline.mappings[0].generatedOffsets).toEqual([0]);
		expect(object.mappings[0].sourceOffsets).toEqual([0]);
		expect(object.mappings[0].generatedOffsets).toEqual([0]);
		const shift = prelude.length - domPrelude.length;
		for (let index = 1; index < object.mappings.length; index++) {
			expect(object.mappings[index].sourceOffsets).toEqual(baseline.mappings[index].sourceOffsets);
			expect(object.mappings[index].generatedOffsets).toEqual(
				baseline.mappings[index].generatedOffsets.map((offset) => offset + shift),
			);
		}
	});

	it('keeps a leading @jsxImportSource pragma ahead of the virtual TSX', () => {
		// An authored file-local pragma (TS's own per-file intrinsics mechanism)
		// must survive into the virtual TSX in leading position — this is how a
		// `.three.tsrx` opts into `@octanejs/three/intrinsics` when the host
		// (tsrx-tsc, generic language plugins) passes no renderer config.
		// @tsrx/core re-emits preserved leading comments; TS honors the first
		// pragma, so nothing may be prepended ahead of the authored one.
		const jsx = 'export function Scene() @{ <mesh /> }\n';
		const pragma = '@jsxImportSource @fixture/object-intrinsics';
		const leadsWithPragma = (code: string) => {
			const at = code.indexOf(pragma);
			expect(at).toBeGreaterThanOrEqual(0);
			expect(at).toBeLessThan(code.indexOf('export function Scene'));
			// The authored pragma is the FIRST pragma in the file.
			expect(code.indexOf('@jsxImportSource')).toBe(code.indexOf(pragma));
		};

		leadsWithPragma(compileToVolarMappings(`/** ${pragma} */\n` + jsx, '/src/Scene.tsrx').code);
		leadsWithPragma(
			compileToVolarMappings(`// with a ${pragma} pragma\n` + jsx, '/src/Scene.tsrx').code,
		);

		// The source pragma wins over config-selected renderer intrinsics — same
		// precedence TypeScript gives an in-file pragma over compilerOptions.
		const overridden = compileToVolarMappings(
			`/** ${pragma} */\n` + jsx,
			'/src/Scene.object.tsrx',
			{
				renderers: OBJECT_RENDERERS,
			},
		);
		leadsWithPragma(overridden.code);
		expect(overridden.code).not.toContain('@fixture/object-renderer');

		// Only leading trivia counts: a pragma after the first statement is not a
		// TS pragma and must not suppress the renderer prelude — the virtual TSX
		// still leads with the DOM renderer's own octane pragma, so TS reads
		// octane's types, not the trailing comment's module.
		const trailing = compileToVolarMappings(jsx + `/** ${pragma} */\n`, '/src/Scene.tsrx');
		expect(trailing.code.startsWith('/** @jsxImportSource octane */\n')).toBe(true);
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
			// The "DOM side" of the intrinsics conflict lives where dom virtual
			// files actually read it now: octane's own jsx-runtime module.
			writeOctaneJsxRuntimeStub(
				root,
				`		line: { path: string };
		path: { d: string };
		audio: { src: string };
		source: { src: string };
		mesh: { domOnly?: boolean };`,
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
				rootNames: [augmentationFile, domFile, objectFile, invalidDomFile],
				options: {
					jsx: ts.JsxEmit.Preserve,
					module: ts.ModuleKind.ESNext,
					moduleResolution: ts.ModuleResolutionKind.Bundler,
					noEmit: true,
					skipLibCheck: true,
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

	it('keeps a component with CSS split across multiple <style> blocks analyzable', () => {
		// One component scope may split its scoped CSS across several <style>
		// blocks (tests/_fixtures/return-style.tsrx is the runtime proof). The
		// unpatched @tsrx/core transform threw "TSRX fragments can only have one
		// style tag" here, and tsrx-tsc's fallback then presented the raw source
		// as the virtual TSX — every CSS brace became a TSX parse error.
		const src =
			'export function Split(props: { active: boolean }) {\n' +
			'\treturn <>\n' +
			"\t\t<section class={['mailbox', { active: props.active }]}>{'hi'}</section>\n" +
			'\t\t<style>\n' +
			'\t\t\t.mailbox { color: rgb(10, 20, 30); }\n' +
			'\t\t</style>\n' +
			'\t\t<>\n' +
			'\t\t\t<style>\n' +
			'\t\t\t\t.active { background-color: rgb(40, 50, 60); }\n' +
			'\t\t\t</style>\n' +
			'\t\t</>\n' +
			'\t</>;\n' +
			'}\n';
		const result = compileToVolarMappings(src, 'split-style.tsrx');
		expect(result.errors).toEqual([]);
		// Both blocks surface as CSS embedded regions, and neither leaks its
		// raw CSS text into the TSX the language service parses.
		expect(result.cssMappings).toHaveLength(2);
		expect(result.code).toContain('Split');
		expect(result.code).not.toContain('rgb(10, 20, 30)');
		expect(result.code).not.toContain('rgb(40, 50, 60)');
	});

	/**
	 * `ref` plus a spread on a HOST element is ordinary authoring — nothing in
	 * docs/differences-from-react.md or the tsrx-authoring rule restricts where
	 * such an element may sit. The type-only lowering rewrites the spread to a
	 * generated binding and reads the composed ref back off it, so the binding
	 * must be declared wherever the element appears, and it must be produced
	 * once. Every entry below is the SAME element in a different position.
	 */
	const REF_SPREAD_POSITIONS: ReadonlyArray<readonly [name: string, body: string]> = [
		['return statement', 'return <text ref={props.nodeRef} {...props.rest} />;'],
		[
			'nested in a returned element',
			'return <svg><text ref={props.nodeRef} {...props.rest} /></svg>;',
		],
		[
			'declarator init',
			'const label = <text ref={props.nodeRef} {...props.rest} />;\n\treturn <svg>{label}</svg>;',
		],
		[
			'ternary arm of a return',
			'return props.show ? <text ref={props.nodeRef} {...props.rest} /> : null;',
		],
		[
			'ternary arm inside a JSX hole',
			'return <svg>{props.show ? <text ref={props.nodeRef} {...props.rest} /> : null}</svg>;',
		],
		[
			'logical operand inside a JSX hole',
			'return <svg>{props.show && <text ref={props.nodeRef} {...props.rest} />}</svg>;',
		],
		[
			'callback body',
			'return <svg>{props.rows.map((row: number) => <text key={row} ref={props.nodeRef} {...props.rest} />)}</svg>;',
		],
		['attribute value', 'return <svg>{<text ref={props.nodeRef} {...props.rest} />}</svg>;'],
		[
			'array literal element',
			'return <svg>{[<text ref={props.nodeRef} {...props.rest} />]}</svg>;',
		],
		[
			'element with two spreads',
			'return <svg>{props.show ? <text ref={props.nodeRef} {...props.rest} {...props.more} /> : null}</svg>;',
		],
	];

	/** The same element as a concise arrow body, which has no statement slot. */
	const CONCISE_ARROW_POSITION =
		'export const Chart = (props: Props) => <text ref={props.nodeRef} {...props.rest} />;\n';

	/** The same element inside plain JS nested in a native `@{ … }` template. */
	const NATIVE_TEMPLATE_POSITIONS: ReadonlyArray<readonly [name: string, body: string]> = [
		[
			'native @if directive',
			'<svg>@if (props.show) { <text ref={props.nodeRef} {...props.rest} /> }</svg>',
		],
		[
			'plain-JS callback inside a native template',
			'<svg>{props.rows.map((row: number) => <text key={row} ref={props.nodeRef} {...props.rest} />)}</svg>',
		],
	];

	const REF_SPREAD_PROPS_TYPE =
		'type Props = {\n' +
		'\tnodeRef: (node: SVGTextElement | null) => void;\n' +
		'\trest: { x?: number };\n' +
		'\tmore: { y?: number };\n' +
		'\trows: number[];\n' +
		'\tshow: boolean;\n' +
		'};\n\n';

	function refSpreadModules(): ReadonlyArray<readonly [name: string, source: string]> {
		return [
			...REF_SPREAD_POSITIONS.map(
				([name, body]) =>
					[
						name,
						`${REF_SPREAD_PROPS_TYPE}export function Chart(props: Props) {\n\t${body}\n}\n`,
					] as const,
			),
			['concise arrow body', REF_SPREAD_PROPS_TYPE + CONCISE_ARROW_POSITION] as const,
			...NATIVE_TEMPLATE_POSITIONS.map(
				([name, body]) =>
					[
						name,
						`${REF_SPREAD_PROPS_TYPE}export function Chart(props: Props) @{\n\t${body}\n}\n`,
					] as const,
			),
		];
	}

	it('declares the generated host ref/spread binding in every element position', () => {
		// The binding used to ride on the element's metadata for a later pass to
		// hoist, and only the render-block statement builder and the native
		// directive path hoisted it. Everywhere else the declaration was dropped
		// while the rewritten attributes still referenced the name, so the
		// language service reported "Cannot find name" on source that compiles
		// and runs correctly (octanejs/octane#737).
		//
		// Undefined names are reported without resolving any import, so the
		// program below deliberately runs without an `octane` stub: unresolved
		// module diagnostics are irrelevant to this contract and filtered out.
		const root = mkdtempSync(join(tmpdir(), 'octane-volar-ref-spread-'));
		try {
			const files = refSpreadModules().map(([name, source], index) => {
				const compiled = compileToVolarMappings(source, `/src/Chart${index}.tsrx`);
				expect(compiled.errors).toEqual([]);
				const file = join(root, `Chart${index}.tsx`);
				writeFileSync(file, compiled.code);
				return { name, file };
			});

			const program = ts.createProgram({
				rootNames: files.map(({ file }) => file),
				options: {
					jsx: ts.JsxEmit.Preserve,
					module: ts.ModuleKind.ESNext,
					moduleResolution: ts.ModuleResolutionKind.Bundler,
					noEmit: true,
					skipLibCheck: true,
					strict: true,
					target: ts.ScriptTarget.ESNext,
				},
			});
			const undefinedNames = ts
				.getPreEmitDiagnostics(program)
				.filter((diagnostic) => diagnostic.code === 2304)
				.map((diagnostic) => {
					const position = files.find(({ file }) => file === diagnostic.file?.fileName);
					return `${position?.name ?? diagnostic.file?.fileName}: ${ts.flattenDiagnosticMessageText(
						diagnostic.messageText,
						' ',
					)}`;
				});
			expect(undefinedNames).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('lowers a host element ref/spread exactly once, whatever position it sits in', () => {
		// An element in plain-JS expression position reached both lowering sites,
		// and the lowering is not idempotent: the second pass read the composed
		// `ref={[authored, generated.ref]}` array as an authored ref and composed
		// it again, so the element ended up with a second generated binding and a
		// ref nested one level deeper than the runtime ever produces.
		for (const [name, source] of refSpreadModules()) {
			const compiled = compileToVolarMappings(source, '/src/Chart.tsrx');
			const generated = ts.createSourceFile(
				'/src/Chart.tsx',
				compiled.code,
				ts.ScriptTarget.ESNext,
				true,
				ts.ScriptKind.TSX,
			);

			const refArrays: ts.ArrayLiteralExpression[] = [];
			const visit = (node: ts.Node): void => {
				if (
					ts.isJsxAttribute(node) &&
					ts.isIdentifier(node.name) &&
					node.name.text === 'ref' &&
					node.initializer &&
					ts.isJsxExpression(node.initializer) &&
					node.initializer.expression &&
					ts.isArrayLiteralExpression(node.initializer.expression)
				) {
					refArrays.push(node.initializer.expression);
				}
				ts.forEachChild(node, visit);
			};
			visit(generated);

			// One composed ref per element: the authored ref and the spread bag's.
			expect(refArrays, name).toHaveLength(1);
			const nested = refArrays[0].elements
				.filter((element) => ts.isArrayLiteralExpression(element))
				.map((element) => element.getText(generated));
			expect(nested, name).toEqual([]);
		}
	});

	it('type-checks absent and optional host spread refs without weakening authored prop types', () => {
		const root = mkdtempSync(join(tmpdir(), 'octane-volar-spread-types-'));
		try {
			mkdirSync(join(root, 'node_modules'));
			symlinkSync(
				fileURLToPath(new URL('../..', import.meta.url)),
				join(root, 'node_modules/octane'),
				'dir',
			);
			const sources: ReadonlyArray<readonly [name: string, source: string]> = [
				...refSpreadModules(),
				[
					'optional refs in a typed SVG spread',
					`import type { Octane } from 'octane/jsx-runtime';
export function Chart({ innerRef, ...rest }: Octane.SVGProps<SVGTextElement> & {
	innerRef?: Octane.Ref<SVGTextElement>;
}) {
	return <svg><text ref={innerRef} {...rest} /></svg>;
}`,
				],
				[
					'destructured ref with a ref-less HTML spread',
					`import type { Octane } from 'octane/jsx-runtime';
export const Tooltip = ({ ref, ...rest }: Octane.HTMLAttributes<HTMLDivElement> & {
	ref?: Octane.Ref<HTMLDivElement>;
}) => <div ref={ref} {...rest} />;`,
				],
				[
					'union spread with and without a ref',
					`import type { Octane } from 'octane/jsx-runtime';
export function Chart(props: {
	ref?: Octane.Ref<SVGTextElement>;
	rest: { x: number } | { ref?: Octane.Ref<SVGTextElement> };
}) {
	return <text ref={props.ref} {...props.rest} />;
}`,
				],
				[
					'conditional empty spread',
					`export function Tooltip(props: { rest: { id?: string } | false | null | undefined }) {
	return <div ref={null} {...props.rest} />;
}`,
				],
				[
					'generic ref-less spread',
					`export function Tooltip<T extends { id?: string }>(props: T) {
	return <div ref={null} {...props} />;
}`,
				],
				[
					'generic SVG props',
					`import type { Octane } from 'octane/jsx-runtime';
export function Chart<T extends Octane.SVGProps<SVGTextElement>>(props: T) {
	return <text ref={null} {...props} />;
}`,
				],
			];
			const files = sources.map(([name, source], index) => {
				const compiled = compileToVolarMappings(source, `/src/Spread${index}.tsrx`);
				expect(compiled.errors, name).toEqual([]);
				const file = join(root, `Spread${index}.tsx`);
				writeFileSync(file, compiled.code);
				return { name, file };
			});
			const invalidSources: ReadonlyArray<readonly [source: string, errorCode: number]> = [
				[
					`export function Invalid(props: { ref: (node: SVGSVGElement | null) => void; rest: { id: string } }) {
	return <input ref={props.ref} {...props.rest} />;
}`,
					2322,
				],
				[
					`export function Invalid(props: { ref: (node: HTMLInputElement | null) => void; rest: { ref: (node: SVGSVGElement | null) => void } }) {
	return <input ref={props.ref} {...props.rest} />;
}`,
					2322,
				],
				[
					`export function Invalid(props: { ref: (node: HTMLInputElement | null) => void; rest: { value: { invalid: true } } }) {
	return <input ref={props.ref} {...props.rest} />;
}`,
					2322,
				],
				[
					`export function Invalid(props: { rest: { id: string } | { ref: (node: SVGSVGElement | null) => void } }) {
	return <input ref={null} {...props.rest} />;
}`,
					2322,
				],
				[
					`export function Invalid(props: { rest: unknown }) {
	return <input ref={null} {...props.rest} />;
}`,
					2698,
				],
				[
					`export function Invalid(props: { rest: number }) {
	return <input ref={null} {...props.rest} />;
}`,
					2698,
				],
				[
					`export function Invalid(props: { rest: Record<string, unknown> }) {
	return <input ref={null} {...props.rest} />;
}`,
					2322,
				],
			];
			const invalidFiles = invalidSources.map(([source], index) => {
				const compiled = compileToVolarMappings(source, `/src/Invalid${index}.tsrx`);
				expect(compiled.errors).toEqual([]);
				const file = join(root, `Invalid${index}.tsx`);
				writeFileSync(file, compiled.code);
				return file;
			});
			const program = ts.createProgram({
				rootNames: [...files.map(({ file }) => file), ...invalidFiles],
				options: {
					jsx: ts.JsxEmit.Preserve,
					module: ts.ModuleKind.ESNext,
					moduleResolution: ts.ModuleResolutionKind.Bundler,
					noEmit: true,
					skipLibCheck: false,
					strict: true,
					target: ts.ScriptTarget.ESNext,
					types: [],
				},
			});
			const diagnostics = ts.getPreEmitDiagnostics(program);
			const validDiagnostics = diagnostics
				.filter((diagnostic) => !invalidFiles.includes(diagnostic.file?.fileName ?? ''))
				.map((diagnostic) => {
					const position = files.find(({ file }) => file === diagnostic.file?.fileName);
					return `${position?.name ?? diagnostic.file?.fileName}: ${ts.flattenDiagnosticMessageText(
						diagnostic.messageText,
						' ',
					)}`;
				});
			expect(validDiagnostics).toEqual([]);
			for (const [index, file] of invalidFiles.entries()) {
				const errors = diagnostics.filter((diagnostic) => diagnostic.file?.fileName === file);
				expect(
					errors.map(({ code }) => code),
					file,
				).toContain(invalidSources[index][1]);
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
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

	it('preserves declare global as a type-checkable global augmentation', () => {
		const src =
			'export {};\n' +
			'declare global {\n' +
			'\tvar __octaneAmbientValue: string | undefined;\n' +
			'}\n' +
			'export const ambientValue = globalThis.__octaneAmbientValue;\n';
		const result = compileToVolarMappings(src, '/src/ambient-global.tsrx');

		expect(result.errors).toEqual([]);
		expect(result.code).toContain('declare global');
		expect(result.code).not.toContain('declare module global');

		const root = mkdtempSync(join(tmpdir(), 'octane-volar-ambient-global-'));
		try {
			const virtualFile = join(root, 'ambient-global.tsx');
			writeFileSync(virtualFile, result.code);
			const program = ts.createProgram({
				rootNames: [virtualFile],
				options: {
					jsx: ts.JsxEmit.Preserve,
					module: ts.ModuleKind.ESNext,
					moduleResolution: ts.ModuleResolutionKind.Bundler,
					noEmit: true,
					skipLibCheck: true,
					strict: true,
					target: ts.ScriptTarget.ESNext,
				},
			});
			expect(ts.getPreEmitDiagnostics(program)).toHaveLength(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('lowers `module server` blocks to checkable TS with types flowing across the boundary', () => {
		// The documented dialect (docs/ssr.md) puts a static import INSIDE the
		// server block. Verbatim that can never typecheck (TS1147 for the
		// in-block import, TS2307 for `from 'server'`), so the Volar path must
		// lower the block to plain TS: hoisted imports + a namespace-valued
		// binding the checker can see through.
		const src =
			'module server {\n' +
			"\timport { commitOrder } from './server-domain.ts';\n" +
			'\n' +
			'\texport type Receipt = { id: string };\n' +
			'\n' +
			'\texport async function placeOrder(request: unknown) {\n' +
			'\t\treturn commitOrder(request);\n' +
			'\t}\n' +
			'}\n' +
			'\n' +
			"import { placeOrder, type Receipt } from 'server';\n" +
			'\n' +
			'export function App() @{\n' +
			"\tconst pending: Promise<{ id: string }> = placeOrder('r1');\n" +
			'\tconst receipt: Receipt = { id: String(pending) };\n' +
			'\t<button>{receipt.id}</button>\n' +
			'}\n';
		const result = compileToVolarMappings(src, '/src/App.tsrx');
		expect(result.errors).toEqual([]);
		// The dialect never reaches the virtual TSX...
		expect(result.code).not.toContain('module server');
		expect(result.code).not.toContain("from 'server'");
		// ...the block import is hoisted to module top level, ahead of the
		// namespace the block lowered into. The namespace keeps the AUTHORED
		// block name so the `server` identifier resolves and stays "used".
		const hoistedAt = result.code.indexOf("import { commitOrder } from './server-domain.ts';");
		const namespaceAt = result.code.indexOf('namespace server');
		expect(hoistedAt).toBeGreaterThanOrEqual(0);
		expect(namespaceAt).toBeGreaterThan(hoistedAt);
		// Authored code keeps its mappings: the language server can still
		// translate positions inside the block, at the boundary import, and on
		// the block's own `server` name.
		const mappedSourceOffsets = new Set(result.mappings.flatMap((m) => m.sourceOffsets));
		expect(mappedSourceOffsets.has(src.indexOf('commitOrder'))).toBe(true);
		expect(mappedSourceOffsets.has(src.indexOf('placeOrder'))).toBe(true);
		expect(mappedSourceOffsets.has('module '.length)).toBe(true);

		// Type-level end-to-end: the virtual TSX must produce ZERO diagnostics
		// under the real TypeScript checker, and the server function's type must
		// genuinely flow to the client side (a misuse must fail).
		const misuse = compileToVolarMappings(
			src.replace('Promise<{ id: string }>', 'Promise<number>'),
			'/src/App.tsrx',
		);
		const root = mkdtempSync(join(tmpdir(), 'octane-volar-server-module-'));
		try {
			writeFileSync(
				join(root, 'server-domain.ts'),
				'export async function commitOrder(request: unknown): Promise<{ id: string }> {\n' +
					'\treturn { id: String(request) };\n' +
					'}\n',
			);
			writeOctaneJsxRuntimeStub(root, '\t\tbutton: { children?: unknown };');
			const appFile = join(root, 'App.tsx');
			const misuseFile = join(root, 'AppMisuse.tsx');
			writeFileSync(appFile, result.code);
			writeFileSync(misuseFile, misuse.code);
			// noUnusedLocals proves the lowering leaves nothing dangling: the
			// namespace is "used" via the boundary destructure, and the hoisted
			// block import's only uses sit INSIDE the namespace, which count.
			const options = {
				allowImportingTsExtensions: true,
				jsx: ts.JsxEmit.Preserve,
				module: ts.ModuleKind.ESNext,
				moduleResolution: ts.ModuleResolutionKind.Bundler,
				noEmit: true,
				noUnusedLocals: true,
				skipLibCheck: true,
				strict: true,
				target: ts.ScriptTarget.ESNext,
			};
			const program = ts.createProgram({
				rootNames: [appFile],
				options,
			});
			expect(ts.getPreEmitDiagnostics(program)).toHaveLength(0);

			const misuseProgram = ts.createProgram({
				rootNames: [misuseFile],
				options,
			});
			const misuseDiagnostics = ts.getPreEmitDiagnostics(misuseProgram);
			expect(misuseDiagnostics).toHaveLength(1);
			expect(ts.flattenDiagnosticMessageText(misuseDiagnostics[0].messageText, '\n')).toMatch(
				/Promise<number>/,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('keeps plain overload signatures non-ambient in the virtual TSX', () => {
		// esrap <2.3.2 printed `declare` on EVERY bodyless function, so a plain
		// overload pair next to its implementation typechecked as TS2384
		// ("Overload signatures must all be ambient or non-ambient") in the
		// editor and under tsrx-tsc, on source that compiles and runs fine
		// (issue #736). An authored ambient declaration must keep `declare`.
		const src =
			'export function pick(a: string): string;\n' +
			'export function pick(a: number): number;\n' +
			'export function pick(a: unknown): unknown {\n' +
			'\treturn a;\n' +
			'}\n' +
			'\n' +
			'declare function ambient(a: string): string;\n' +
			"export const kept = ambient('x');\n" +
			'\n' +
			'export function Overloaded() @{\n' +
			"\t<p>{pick('label')}</p>\n" +
			'}\n';
		const result = compileToVolarMappings(src, '/src/Overloaded.tsrx');
		expect(result.errors).toEqual([]);

		// The full TypeScript checker is the oracle, covering both directions:
		// overloads wrongly made ambient report TS2384; an authored `declare`
		// wrongly dropped reports TS2391 (implementation missing).
		const root = mkdtempSync(join(tmpdir(), 'octane-volar-overloads-'));
		try {
			writeOctaneJsxRuntimeStub(root, '\t\tp: { children?: unknown };');
			const file = join(root, 'Overloaded.tsx');
			writeFileSync(file, result.code);
			const program = ts.createProgram({
				rootNames: [file],
				options: {
					jsx: ts.JsxEmit.Preserve,
					module: ts.ModuleKind.ESNext,
					moduleResolution: ts.ModuleResolutionKind.Bundler,
					noEmit: true,
					skipLibCheck: true,
					strict: true,
					target: ts.ScriptTarget.ESNext,
				},
			});
			expect(
				ts
					.getPreEmitDiagnostics(program)
					.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')),
			).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('exposes both authored and generated ASTs for editor and playground integrations', () => {
		const src = "export function Foo() @{ <p>{'x'}</p> }\n";
		const result = compileToVolarMappings(src, 'foo.tsrx');
		// `sourceAst` remains the parsed authored tree used for route-generator
		// markers and source-side editor queries.
		expect(result.sourceAst.type).toBe('Program');
		const fnDecl = (result.sourceAst.body as any[]).find(
			(n) => n.type === 'ExportNamedDeclaration' && n.declaration?.type === 'FunctionDeclaration',
		);
		expect(fnDecl?.declaration?.id?.name).toBe('Foo');
		expect(fnDecl?.declaration?.body?.type).toBe('JSXCodeBlock');

		// `generatedAst` is the exact transformed Program @tsrx/core printed to
		// produce `code`; the playground can show the types AST or virtual TSX
		// without reparsing.
		expect(result.generatedAst.type).toBe('Program');
		const generatedFn = (result.generatedAst.body as any[]).find(
			(n) => n.type === 'ExportNamedDeclaration' && n.declaration?.type === 'FunctionDeclaration',
		);
		expect(generatedFn?.declaration?.body?.type).toBe('BlockStatement');
	});

	it('marks native template bodies on the source AST (route-generator contract)', () => {
		// The Octane route-generator plugin (@octanejs/tanstack-router/
		// generator-plugin) masks `@{ … }` template bodies before handing route
		// files to a babel-based transform. It identifies them on THIS entry
		// point's `sourceAst` via `metadata.native_tsrx_body` plus the body's
		// source offsets — a published consumer contract of the volar surface.
		const source =
			'export function About() @{\n\t<p>hi</p>\n}\n' +
			'const Fn = function () @{\n\t<p>fn</p>\n}\nvoid Fn;\n';
		const { sourceAst } = compileToVolarMappings(source, 'routes/about.tsrx');

		const marked: Array<{ start: number; end: number }> = [];
		const seen = new WeakSet<object>();
		const visit = (value: unknown): void => {
			if (!value || typeof value !== 'object' || seen.has(value)) return;
			seen.add(value);
			if (Array.isArray(value)) {
				for (const item of value) visit(item);
				return;
			}
			const node = value as {
				metadata?: { native_tsrx_body?: boolean };
				body?: { start?: unknown; end?: unknown };
			};
			if (node.metadata?.native_tsrx_body === true) {
				expect(typeof node.body?.start).toBe('number');
				expect(typeof node.body?.end).toBe('number');
				marked.push({ start: node.body!.start as number, end: node.body!.end as number });
			}
			for (const [key, child] of Object.entries(node)) {
				if (key !== 'metadata' && key !== 'loc') visit(child);
			}
		};
		visit(sourceAst);

		// Both the exported declaration and the function expression are found
		// WITHOUT descending through metadata back-references, and their body
		// spans cover the authored `{ … }` region (maskable in place).
		expect(marked).toHaveLength(2);
		for (const span of marked) {
			// The span opens at the `@` sigil and closes at the template's `}` —
			// the exact shape the masker rewrites in place (`@{` → ` {`).
			expect(source.slice(span.start, span.start + 2)).toBe('@{');
			expect(source[span.end - 1]).toBe('}');
		}
	});
});
