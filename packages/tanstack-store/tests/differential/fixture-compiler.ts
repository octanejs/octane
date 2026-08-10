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
	sourcePath: string,
	cacheDirectory: string,
	dependencies: FixtureCompilerDependencies,
): void {
	const source = dependencies.readFile(sourcePath, 'utf8');
	const compiled = dependencies.compile(source, sourcePath);
	if (compiled.errors?.length) {
		throw new Error(
			`React fixture compilation failed for ${sourcePath}: ${JSON.stringify(compiled.errors)}`,
		);
	}
	const transformed = dependencies.transform(compiled.code, {
		loader: 'tsx',
		jsx: 'automatic',
		jsxImportSource: 'react',
		target: 'esnext',
		format: 'esm',
		sourcefile: sourcePath,
	});
	const rewritten = transformed.code
		.replace(
			/from\s+["']@octanejs\/tanstack-store(\/[^"']*)?["']/g,
			function rewriteTanstackStore(_match: string, subpath: string | undefined) {
				return `from "@tanstack/react-store${subpath || ''}"`;
			},
		)
		.replace(/from\s+["']octane["']/g, 'from "react"');
	if (
		/(?:from|import)\s+["']@octanejs\//.test(rewritten) ||
		/from\s+["']octane["']/.test(rewritten)
	) {
		throw new Error(
			`React fixture rewrite left Octane-only imports in ${sourcePath}; keep differential oracles under _fixtures/differential`,
		);
	}
	const slug = basename(sourcePath).replace(/\.tsrx$/, '');
	dependencies.writeFile(join(cacheDirectory, `${slug}-${hashString(sourcePath)}.js`), rewritten);
}
