import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createTextTypeProject } from 'octane/compiler/typescript';

export type TextTypeProject = ReturnType<typeof createTextTypeProject>;
export type TextTypeFacts = ReturnType<TextTypeProject['snapshot']>;

/** A small, typed consumer project whose diagnostics do not depend on ambient test types. */
export function createTextTypeFixture(
	files: Record<string, string>,
	compilerOptions: Record<string, unknown> = {},
) {
	const directory = mkdtempSync(join(tmpdir(), 'octane-text-types-'));
	const write = (name: string, source: string) => {
		const file = join(directory, name);
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, source);
		return file;
	};
	write(
		'node_modules/octane/package.json',
		JSON.stringify({
			name: 'octane',
			type: 'module',
			exports: {
				'.': './index.d.ts',
				'./jsx-runtime': './jsx-runtime.d.ts',
				'./jsx-dev-runtime': './jsx-runtime.d.ts',
				'./tsrx-iterable': './tsrx-iterable.d.ts',
			},
		}),
	);
	write(
		'node_modules/octane/index.d.ts',
		`export type OctaneNode = unknown;
export declare function createElement(type: unknown, props?: unknown, ...children: unknown[]): object;
export declare function useState<T>(initial: T): [T, (next: T | ((previous: T) => T)) => void, () => T];
`,
	);
	write(
		'node_modules/octane/jsx-runtime.d.ts',
		`export namespace JSX {
	interface Element { readonly __element: unique symbol }
	interface ElementChildrenAttribute { children: {} }
	interface IntrinsicElements { [name: string]: any }
}
`,
	);
	write(
		'node_modules/octane/tsrx-iterable.d.ts',
		`export type IterationValue<T> = T extends Iterable<infer V> | Iterator<infer V> ? V : never;
export declare function map_iterable<T, U>(values: Iterable<T> | Iterator<T>, callback: (value: T, index: number, last: boolean) => U, tail?: () => U | U[], empty?: () => U | U[]): U[];
`,
	);
	const tsconfig = write(
		'tsconfig.json',
		JSON.stringify({
			compilerOptions: {
				target: 'ESNext',
				module: 'ESNext',
				moduleResolution: 'Bundler',
				jsx: 'react-jsx',
				jsxImportSource: 'octane',
				strict: true,
				noEmit: true,
				skipLibCheck: true,
				types: [],
				...compilerOptions,
			},
			include: ['**/*.ts', '**/*.tsx', '**/*.tsrx'],
		}),
	);
	for (const [name, source] of Object.entries(files)) write(name, source);
	const project = createTextTypeProject({ tsconfig });
	return {
		directory,
		tsconfig,
		project,
		file: (name: string) => join(directory, name),
		write,
		dispose() {
			project.dispose();
			rmSync(directory, { recursive: true, force: true });
		},
	};
}

export function stringChildren(source: string, facts: TextTypeFacts): string[] {
	return facts.stringChildRanges.map(([start, end]) => source.slice(start, end));
}
