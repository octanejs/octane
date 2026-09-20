// @vitest-environment node
//
// U4 — typed theme-token declaration helper (`octane/theme-tokens`), the R3/R4
// surface of the typed-styling plan.
//
// API-SHAPE DECISION (recorded for U10/U8):
//   `defineThemeTokens(tokens, options?)` — a `defineVars`-shaped declaration
//   mirroring the in-repo `createTheme`/`CSSVarTheme<T>` precedent
//   (packages/styled-components/src/constructors/createTheme.ts). The returned
//   object carries the same nested shape with every leaf a `var(--name, fallback)`
//   string, plus `vars` (bare `--name` leaves), `raw` (declared values), and
//   `css` (the `:root` + variant custom-property sheet, the
//   packages/shadcn/src/styles/theme.css emission target).
//   Consumption form: leaf values ARE `var(--*)` strings, so `style={{ color:
//   tokens.colors.bg }}` and generated CSS text consume them with zero `<style>`
//   grammar change, and in-`<style>` static CSS writes the same `var(--*)`
//   spelling U10 resolves against the contract — the shape holds whether U1's
//   spike lands `var(--*)`-typed references or a new consumption form.
//   Criteria: StyleX familiarity (`defineVars`-shaped literal, refs object),
//   minimal diff from today's `<style>` authoring (static `var(--*)` text, no
//   interpolation), and one contract object shared by the typecheck gate (R3/R4)
//   and the compile-path resolver (R5/U10).
//
// Type-gate assertions run two ways: `@ts-expect-error` lines in this file are
// exercised by `pnpm typecheck:files`, and `tokenContractFixture` below runs a
// real ts.Program so the same contract fails under vitest too — an
// `@ts-expect-error` that consumes no error surfaces TS2578 in the semantic
// diagnostics and turns the test red (the native-read-types.test.ts pattern).

import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { defineThemeTokens } from '../src/theme-tokens.js';

const FIXTURE = fileURLToPath(new URL('./_theme_tokens_typecheck_fixture.ts', import.meta.url));

/** Compile a virtual source file importing the real helper; return semantic diagnostics. */
function tokenContractFixture(source: string): string[] {
	const options: ts.CompilerOptions = {
		target: ts.ScriptTarget.ES2022,
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		strict: true,
		noEmit: true,
		skipLibCheck: true,
		types: [],
	};
	const host = ts.createCompilerHost(options);
	const readFile = host.readFile;
	const fileExists = host.fileExists;
	const getSourceFile = host.getSourceFile;
	host.readFile = (path) => (path === FIXTURE ? source : readFile(path));
	host.fileExists = (path) => path === FIXTURE || fileExists(path);
	host.getSourceFile = (path, languageVersion, onError, shouldCreateNewSourceFile) =>
		path === FIXTURE
			? ts.createSourceFile(path, source, languageVersion, true)
			: getSourceFile(path, languageVersion, onError, shouldCreateNewSourceFile);
	const program = ts.createProgram({ rootNames: [FIXTURE], options, host });
	return program
		.getSemanticDiagnostics(program.getSourceFile(FIXTURE)!)
		.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
}

const contract = {
	colors: { bg: '#fff', fg: '#111' },
	space: { md: '0.5rem' },
};

// The same contract failures the fixture asserts through ts.Program are pinned
// here for the repo typecheck gate (`pnpm typecheck:files` / tsrx-tsc).

defineThemeTokens(contract, {
	variants: {
		dark: {
			selector: '.d',
			// @ts-expect-error typo'd variant keys fail the contract (R4)
			values: { colors: { bgg: '#000' } },
		},
	},
});
// @ts-expect-error token leaves are strings or numbers — a wrong-typed value is a type error (R3)
defineThemeTokens({ colors: { bg: true } });
// @ts-expect-error an explicitly declared contract makes a missing token a type error (R3)
defineThemeTokens<{ colors: { bg: string; fg: string } }>({ colors: { bg: '#fff' } });

describe('defineThemeTokens', () => {
	it('maps every leaf to a var(--name, fallback) reference and exposes bare names via vars', () => {
		const tokens = defineThemeTokens({
			colors: { bg: '#fff', fg: '#111' },
			space: { md: '0.5rem' },
		});
		expect(tokens.colors.bg).toBe('var(--colors-bg, #fff)');
		expect(tokens.colors.fg).toBe('var(--colors-fg, #111)');
		expect(tokens.space.md).toBe('var(--space-md, 0.5rem)');
		expect(tokens.vars.colors.bg).toBe('--colors-bg');
		expect(tokens.vars.space.md).toBe('--space-md');
		expect(tokens.raw).toEqual({ colors: { bg: '#fff', fg: '#111' }, space: { md: '0.5rem' } });
	});

	it('emits the :root custom-property sheet and variant blocks as css', () => {
		const tokens = defineThemeTokens(
			{ colors: { bg: '#fff', fg: '#111' }, space: { md: '0.5rem' } },
			{
				variants: {
					dark: { selector: '.dark', values: { colors: { bg: '#000' } } },
					auto: {
						media: '(prefers-color-scheme: dark)',
						values: { colors: { fg: '#eee' } },
					},
				},
			},
		);
		expect(tokens.css).toBe(
			':root {\n' +
				'\t--colors-bg: #fff;\n' +
				'\t--colors-fg: #111;\n' +
				'\t--space-md: 0.5rem;\n' +
				'}\n' +
				'.dark {\n' +
				'\t--colors-bg: #000;\n' +
				'}\n' +
				'@media (prefers-color-scheme: dark) {\n' +
				'\t:root {\n' +
				'\t\t--colors-fg: #eee;\n' +
				'\t}\n' +
				'}\n',
		);
	});

	it('prefixes custom-property names and honors a base selector', () => {
		const tokens = defineThemeTokens(
			{ accent: { DEFAULT: 'blue' } },
			{ prefix: 'app', selector: ':host' },
		);
		expect(tokens.accent.DEFAULT).toBe('var(--app-accent-DEFAULT, blue)');
		expect(tokens.vars.accent.DEFAULT).toBe('--app-accent-DEFAULT');
		expect(tokens.css).toBe(':host {\n\t--app-accent-DEFAULT: blue;\n}\n');
	});

	it('rejects contract violations at the typecheck gate (R3/R4)', () => {
		expect(
			tokenContractFixture(`import { defineThemeTokens } from '../src/theme-tokens.js';

const tokens = defineThemeTokens(
	{ colors: { bg: '#fff', fg: '#111' }, space: { md: '0.5rem' } },
	{
		variants: {
			dark: { selector: '.dark', values: { colors: { bg: '#000', fg: '#eee' } } },
			contrast: { media: '(prefers-contrast: more)', values: { space: {} } },
		},
	},
);
const color: string = tokens.colors.bg;
const name: \`--\${string}\` = tokens.vars.colors.bg;

// @ts-expect-error a variant may not invent tokens the contract does not declare (R4)
defineThemeTokens(tokens.raw, { variants: { bad: { selector: '.x', values: { colors: { bgg: '#000' } } } } });
// @ts-expect-error a variant leaf must match the declared value type (R4)
defineThemeTokens(tokens.raw, { variants: { bad: { selector: '.x', values: { colors: { bg: 42 } } } } });
// @ts-expect-error a variant may not invent groups (R4)
defineThemeTokens(tokens.raw, { variants: { bad: { selector: '.x', values: { border: { w: '1px' } } } } });
// @ts-expect-error a token the contract never declared does not exist (R3)
tokens.colors.bgg;
// @ts-expect-error token leaves are strings or numbers — wrong-typed values error (R3)
defineThemeTokens({ colors: { bg: true } });
// @ts-expect-error an explicit contract makes a missing token a type error (R3)
defineThemeTokens<{ colors: { bg: string; fg: string } }>({ colors: { bg: '#fff' } });
`),
		).toEqual([]);
	});
});
