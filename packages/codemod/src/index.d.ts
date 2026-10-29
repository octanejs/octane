import type ts from 'typescript';

interface Note {
	rule: string;
	severity: 'info' | 'warning' | 'error';
	line: number;
	message: string;
}
interface TransformOptions {
	target?: 'tsx' | 'tsrx';
	strong?: boolean;
	strictNullChecks?: boolean;
	types?: { sourceFile: ts.SourceFile; checker: ts.TypeChecker };
	resolveSpecifier?(specifier: string): string | null;
	isContext?(specifier: string, name: string): boolean | null;
}
interface TransformResult {
	code: string;
	changed: boolean;
	template: boolean;
	notes: Note[];
	rules: Record<string, number>;
	exports: {
		contexts: string[];
		reexports: { specifier: string; names: [string, string][] | null }[];
	};
}
interface CodemodOptions {
	target?: 'tsrx' | 'tsx';
	strong?: boolean;
	forceStrong?: boolean;
	verify?: boolean;
	write?: boolean;
	root?: string;
}
interface Finding {
	code: string;
	severity: string;
	message: string;
	line: number;
}
interface Compiler {
	from: string;
	collectDiagnostics: typeof import('octane/compiler').collectDiagnostics;
}
interface FileResult {
	file: string;
	output: string;
	changed: boolean;
	rules: Record<string, number>;
	notes: Note[];
	strong: boolean | null;
	strongFixes: string[];
	diagnostics: Finding[];
	code: string;
}
interface CodemodResult {
	root: string;
	files: FileResult[];
	packages: { from: string; to: string }[];
	missing: string[];
	html: string[];
	compiler: string | null;
}
export declare function runCodemod(
	paths: string[],
	options?: CodemodOptions,
): Promise<CodemodResult>;
export declare function transformModule(
	source: string,
	filename: string,
	options?: TransformOptions,
): TransformResult;
export declare function strengthen(
	compiler: Compiler,
	code: string,
	filename: string,
	options?: { force?: boolean },
): { code: string; strong: boolean; fixed: string[]; blockers: Finding[] };
export declare function loadCompiler(root: string): Promise<Compiler>;
