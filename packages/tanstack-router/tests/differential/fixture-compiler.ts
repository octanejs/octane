import { basename, join } from 'node:path';

export type FixtureCompilerDependencies = {
	readFile(path: string, encoding: 'utf8'): string;
	compile(source: string, path: string): { code: string; errors?: unknown[] };
	transform(code: string, options: Record<string, unknown>): { code: string };
	writeFile(path: string, contents: string): void;
};

function hashString(value: string): string {
	let hash = 5381;
	for (let index = 0; index < value.length; index++) {
		hash = ((hash << 5) + hash + value.charCodeAt(index)) | 0;
	}
	return Math.abs(hash).toString(36);
}

export function compileFixture(
	srcPath: string,
	cacheDir: string,
	dependencies: FixtureCompilerDependencies,
): void {
	const source = dependencies.readFile(srcPath, 'utf8');
	const compiled = dependencies.compile(source, srcPath);
	if (compiled.errors?.length) {
		throw new Error(
			`React fixture compilation failed for ${srcPath}: ${JSON.stringify(compiled.errors)}`,
		);
	}
	const transformed = dependencies.transform(compiled.code, {
		loader: 'tsx',
		jsx: 'automatic',
		jsxImportSource: 'react',
		target: 'esnext',
		format: 'esm',
		sourcefile: srcPath,
	});
	const rewritten = transformed.code
		.replace(
			/from\s+["']@octanejs\/tanstack-router(\/[^"']*)?["']/g,
			(_match, subpath) => `from "@tanstack/react-router${subpath || ''}"`,
		)
		.replace(/from\s+["']octane["']/g, 'from "react"');
	const slug = basename(srcPath).replace(/\.tsrx$/, '');
	dependencies.writeFile(join(cacheDir, `${slug}-${hashString(srcPath)}.js`), rewritten);
}
