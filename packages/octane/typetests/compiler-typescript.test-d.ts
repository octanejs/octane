import { compile, type CompileOptions, type CompileResult } from 'octane/compiler';
import {
	createTextTypeProject,
	type TextTypeFacts,
	type TextTypeProject,
	type TextTypeProjectOptions,
} from 'octane/compiler/typescript';

export const options = {
	tsconfig: './tsconfig.json',
} satisfies TextTypeProjectOptions;

export const project: TextTypeProject = createTextTypeProject(options);
export const facts: TextTypeFacts = project.snapshot('src/App.tsrx', 'export const label = "x";');
export const ranges: readonly (readonly [number, number])[] = facts.stringChildRanges;
export const version: 1 = facts.version;

export const compileOptions = {
	mode: 'client',
	hmr: false,
	textTypeFacts: facts,
} satisfies CompileOptions;
export const compiled: CompileResult = compile('', facts.filename, compileOptions);
export const generatedCode: string = compiled.code;
export const sourceMap: string = compiled.map.mappings;

project.invalidate('src/model.ts');
project.invalidate();
project.dispose();

// @ts-expect-error — a configured TypeScript project is required.
createTextTypeProject({});
// @ts-expect-error — adapter options are a closed public surface.
createTextTypeProject({ tsconfig: './tsconfig.json', watch: true });
// @ts-expect-error — authored source is text, not a TypeScript AST.
project.snapshot('src/App.tsrx', {});
// @ts-expect-error — snapshots expose immutable authored ranges.
facts.stringChildRanges.push([0, 1]);
// @ts-expect-error — compile accepts source-bound facts, not a TypeScript type.
compile('', facts.filename, { textTypeFacts: 'string' });
// @ts-expect-error — the compiler has only client and server modes.
compile('', facts.filename, { mode: 'types' });
