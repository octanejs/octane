import { basename, join } from 'node:path';

export type Dependencies = {
	readFile(path: string, encoding: 'utf8'): string;
	compile(source: string, path: string): { code: string; errors?: unknown[] };
	transform(code: string, options: Record<string, unknown>): { code: string };
	writeFile(path: string, contents: string): void;
};

function hashString(value: string): string {
	let hash = 5381;
	for (let index = 0; index < value.length; index++)
		hash = ((hash << 5) + hash + value.charCodeAt(index)) | 0;
	return Math.abs(hash).toString(36);
}

export function compileFixture(path: string, cache: string, dependencies: Dependencies): void {
	const compiled = dependencies.compile(dependencies.readFile(path, 'utf8'), path);
	if (compiled.errors?.length)
		throw new Error(
			`React fixture compilation failed for ${path}: ${JSON.stringify(compiled.errors)}`,
		);
	const transformed = dependencies.transform(compiled.code, {
		loader: 'tsx',
		jsx: 'automatic',
		jsxImportSource: 'react',
		target: 'esnext',
		format: 'esm',
		sourcefile: path,
	});
	const rewritten = transformed.code
		.replace(
			/from\s+["']@octanejs\/tiptap(\/[^"']*)?["']/g,
			(_match, subpath) => `from "@tiptap/react${subpath || ''}"`,
		)
		.replace(/from\s+["']octane["']/g, 'from "react"')
		.replace(/\bconst\s+paritySide\s*=\s*["']octane["']/g, 'const paritySide = "react"');
	dependencies.writeFile(
		join(cache, `${basename(path).replace(/\.tsrx$/, '')}-${hashString(path)}.js`),
		rewritten,
	);
}
