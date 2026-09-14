// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';
import { compileToVolarMappings } from 'octane/compiler/volar';

const CODE = 'OCTANE_STRONG_UNTRUSTED_HTML';

describe('Strong trusted HTML', () => {
	it.each(['client', 'server'] as const)(
		'rejects raw HTML objects on DOM elements in %s',
		(mode) => {
			const source = `export function App() { return <div dangerouslySetInnerHTML={{ __html: '<b>raw</b>' }} />; }`;
			expect(() => compile(source, 'app.tsx', { mode })).not.toThrow();
			expect(() => compile(source, 'app.tsx', { mode, strong: true })).toThrow(CODE);
		},
	);

	it.each([
		`<div dangerouslySetInnerHTML="raw" />`,
		`<div dangerouslySetInnerHTML />`,
		`<div dangerouslySetInnerHTML={props.show ? { __html: '<b>raw</b>' } : null} />`,
		`<div {...{ dangerouslySetInnerHTML: { __html: '<b>raw</b>' } }} />`,
		String.raw`<div {...{ 'dangerouslySetInnerHTM\L': { __html: 'raw' } }} />`,
		String.raw`<div {...{ 'dangerouslySetInner\x48TML': { __html: 'raw' } }} />`,
	])('rejects a visible untrusted final HTML value: %s', (element) => {
		expect(() =>
			compile(`export function App(props) { return ${element}; }`, 'app.tsx', { strong: true }),
		).toThrow(CODE);
	});

	it.each([
		`<div dangerouslySetInnerHTML={trustHTML('<b>trusted</b>')} />`,
		`<div dangerouslySetInnerHTML={undefined} />`,
		`<div {...{ dangerouslySetInnerHTML: { __html: '<b>raw</b>' } }} dangerouslySetInnerHTML={trustHTML('<b>trusted</b>')} />`,
		`<div {...{ dangerouslySetInnerHTML: { __html: '<b>raw</b>' }, ...props }} />`,
		`<Child dangerouslySetInnerHTML={{ __html: '<b>component prop</b>' }} />`,
	])(
		'permits branded values, absence, and values owned by a later writer or component: %s',
		(element) => {
			expect(() =>
				compile(
					`import { trustHTML } from 'octane'; import { Child } from './child'; export function App(props) { return ${element}; }`,
					'app.tsx',
					{ strong: true },
				),
			).not.toThrow();
		},
	);

	it('leaves object renderer props outside the DOM HTML contract', () => {
		const result = compileToVolarMappings(
			`'use strong'; export function App() @{ <object dangerouslySetInnerHTML={{ __html: 'custom' }} /> }`,
			'app.object.tsrx',
			{
				renderers: {
					registry: { object: { module: '@fixture/object', intrinsics: '@fixture/intrinsics' } },
					rules: [{ include: '**/*.object.tsrx', renderer: 'object' }],
				},
			},
		);
		expect(result.diagnostics.filter((item: { code: string }) => item.code === CODE)).toEqual([]);
		expect(result.code).toContain('@jsxImportSource @fixture/intrinsics');
	});

	it.each([
		[
			"import { createElement } from 'octane';",
			"createElement('div', { dangerouslySetInnerHTML: { __html: '<b>raw</b>' } })",
		],
		[
			"import { createElement as h } from 'octane';",
			"h('div', { dangerouslySetInnerHTML: { __html: '<b>raw</b>' } })",
		],
		[
			"import * as Octane from 'octane';",
			"Octane['createElement']('div', { dangerouslySetInnerHTML: { __html: '<b>raw</b>' } })",
		],
		[
			String.raw`import { create\u0045lement as h } from 'octane';`,
			"h('div', { dangerouslySetInnerHTML: { __html: '<b>raw</b>' } })",
		],
		[
			"import * as Octane from 'octane';",
			String.raw`Octane['create\u0045lement']('div', { dangerouslySetInnerHTML: { __html: '<b>raw</b>' } })`,
		],
		[
			"import * as Octane from 'octane';",
			String.raw`Octane['creat\eElement']('div', { dangerouslySetInnerHTML: { __html: 'raw' } })`,
		],
	])('rejects raw HTML in an Octane element factory', (imports, expression) => {
		expect(() =>
			compile(`${imports} export function App() { return ${expression}; }`, 'app.tsx', {
				strong: true,
			}),
		).toThrow(CODE);
	});

	it('respects shadowed and foreign element factories and component props', () => {
		for (const source of [
			`import { createElement } from './factory'; export function App() { return createElement('div', { dangerouslySetInnerHTML: { __html: 'owned' } }); }`,
			`import { createElement } from 'octane'; export function App(createElement) { return createElement('div', { dangerouslySetInnerHTML: { __html: 'owned' } }); }`,
			`import * as Octane from 'octane'; export function App(Octane) { return Octane.createElement('div', { dangerouslySetInnerHTML: { __html: 'owned' } }); }`,
			`import { createElement } from 'octane'; import { Child } from './child'; export function App() { return createElement(Child, { dangerouslySetInnerHTML: { __html: 'owned' } }); }`,
		])
			expect(() => compile(source, 'app.tsx', { strong: true })).not.toThrow();
	});

	it('keeps an authored line-comment pragma readable when selecting Strong JSX types', () => {
		const result = compileToVolarMappings(
			`// @jsxImportSource octane\n'use strong';\nexport function App() @{ <div>hi</div> }`,
			'app.tsrx',
		);
		expect(result.code.split('\n')[0]).toBe('// @jsxImportSource octane/strong');
	});

	it('reports an editor diagnostic at the untrusted HTML expression', () => {
		const source = `'use strong';\nexport function App() @{ <div dangerouslySetInnerHTML={{ __html: '<b>raw</b>' }} /> }`;
		const result = compileToVolarMappings(source, 'app.tsrx');
		const diagnostic = result.diagnostics.find((item: { code: string }) => item.code === CODE);
		expect(diagnostic).toBeDefined();
		expect(source.slice(diagnostic!.start.offset, diagnostic!.end.offset)).toBe(
			`{ __html: '<b>raw</b>' }`,
		);
	});

	it('checks imported and spread HTML values through the real Strong JSX types', () => {
		const root = mkdtempSync(join(tmpdir(), 'octane-strong-html-'));
		try {
			mkdirSync(join(root, 'node_modules'));
			symlinkSync(
				fileURLToPath(new URL('../..', import.meta.url)),
				join(root, 'node_modules/octane'),
				'dir',
			);
			writeFileSync(
				join(root, 'values.ts'),
				`import { trustHTML } from 'octane'; export const trusted = trustHTML('<b>safe</b>'); export const raw = { __html: '<b>raw</b>' }; export const suppressed = { suppressHydrationWarning: true };`,
			);
			const cases = {
				valid: `'use strong'; import { trusted } from './values'; export function App() @{ <div dangerouslySetInnerHTML={trusted} /> }`,
				invalid: `'use strong'; import { raw } from './values'; export function App() @{ <div dangerouslySetInnerHTML={raw} /> }`,
				spread: `'use strong'; import { raw } from './values'; export function App() @{ <div {...{ dangerouslySetInnerHTML: raw }} /> }`,
				compat: `import { raw } from './values'; export function App() @{ <div dangerouslySetInnerHTML={raw} /> }`,
				pragma: `/** @jsxImportSource octane */\n'use strong'; import { raw } from './values'; export function App() @{ <div dangerouslySetInnerHTML={raw} /> }`,
				absent: `'use strong'; export function App() @{ <div dangerouslySetInnerHTML={null} /> }`,
				suppressed: `'use strong'; import { suppressed } from './values'; export function App() @{ <div {...suppressed} /> }`,
				nativeSuppressed: `'use strong'; export function App(props: { suppressNativeChangeWarning?: boolean }) @{ <div {...props} /> }`,
				compatSuppressed: `import { suppressed } from './values'; export function App() @{ <div {...suppressed} /> }`,
				componentSuppressed: `'use strong'; import { suppressed } from './values'; function Child(props: { suppressHydrationWarning: boolean }) { return String(props.suppressHydrationWarning); } export function App() @{ <Child {...suppressed} /> }`,
				component: `'use strong'; import { raw } from './values'; function Child(props: { dangerouslySetInnerHTML: { __html: string } }) { return props.dangerouslySetInnerHTML.__html; } export function App() @{ <Child dangerouslySetInnerHTML={raw} /> }`,
			};
			const compilations = new Map<string, ReturnType<typeof compileToVolarMappings>>();
			const files = Object.entries(cases).map(([name, source]) => {
				const result = compileToVolarMappings(source, `${name}.tsrx`);
				const file = join(root, `${name}.tsx`);
				compilations.set(name, result);
				writeFileSync(file, result.code);
				return file;
			});
			const program = ts.createProgram({
				rootNames: files,
				options: {
					jsx: ts.JsxEmit.Preserve,
					module: ts.ModuleKind.ESNext,
					moduleResolution: ts.ModuleResolutionKind.Bundler,
					strict: true,
					noEmit: true,
					skipLibCheck: true,
					target: ts.ScriptTarget.ESNext,
					types: [],
				},
			});
			const errors = Object.fromEntries(
				files.map((file) => [
					file.slice(root.length + 1, -4),
					program
						.getSemanticDiagnostics(program.getSourceFile(file)!)
						.map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n')),
				]),
			);
			expect(errors.valid).toEqual([]);
			expect(errors.compat).toEqual([]);
			expect(errors.absent).toEqual([]);
			expect(errors.component).toEqual([]);
			expect(errors.invalid.join('\n')).toContain('TrustedHTML');
			expect(errors.spread.join('\n')).toContain('TrustedHTML');
			expect(errors.pragma.join('\n')).toContain('TrustedHTML');
			expect(errors.suppressed.join('\n')).toContain('suppressHydrationWarning');
			expect(errors.nativeSuppressed.join('\n')).toContain('suppressNativeChangeWarning');
			expect(errors.compatSuppressed).toEqual([]);
			expect(errors.componentSuppressed).toEqual([]);
			expect(
				program.getSemanticDiagnostics(program.getSourceFile(join(root, 'values.ts'))!),
			).toEqual([]);
			const typedError = program.getSemanticDiagnostics(
				program.getSourceFile(join(root, 'pragma.tsx'))!,
			)[0];
			const authoredOffset = cases.pragma.indexOf('dangerouslySetInnerHTML');
			expect(
				compilations
					.get('pragma')!
					.mappings.some((mapping) =>
						mapping.sourceOffsets.some(
							(offset, index) =>
								offset === authoredOffset && mapping.generatedOffsets[index] === typedError.start,
						),
					),
			).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
