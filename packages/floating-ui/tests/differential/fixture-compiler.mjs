import { basename, join } from 'node:path';

/**
 * @typedef {object} FixtureCompilerDependencies
 * @property {(path: string, encoding: 'utf8') => string} readFile
 * @property {(source: string, sourcePath: string) => {code: string, errors?: unknown[]}} compile
 * @property {(code: string, options: import('esbuild').TransformOptions) => {code: string}} transform
 * @property {(path: string, source: string) => void} writeFile
 */

function hashString(value) {
	let hash = 5381;
	for (let index = 0; index < value.length; index++)
		hash = ((hash << 5) + hash + value.charCodeAt(index)) | 0;
	return Math.abs(hash).toString(36);
}

/**
 * @param {string} sourcePath
 * @param {string} cacheDirectory
 * @param {FixtureCompilerDependencies} dependencies
 */
export function compileFixture(sourcePath, cacheDirectory, dependencies) {
	const compiled = dependencies.compile(dependencies.readFile(sourcePath, 'utf8'), sourcePath);
	if (compiled.errors?.length)
		throw new Error(
			`React fixture compilation failed for ${sourcePath}: ${JSON.stringify(compiled.errors)}`,
		);
	const transformed = dependencies.transform(compiled.code, {
		loader: 'tsx',
		jsx: 'automatic',
		jsxImportSource: 'react',
		target: 'esnext',
		format: 'esm',
		sourcefile: sourcePath,
	});
	const rewritten = transformed.code
		.replace(/from\s+["']@octanejs\/floating-ui["']/g, 'from "@floating-ui/react"')
		.replace(/from\s+["']octane["']/g, 'from "react"');
	const slug = basename(sourcePath).replace(/\.tsrx$/, '');
	dependencies.writeFile(join(cacheDirectory, `${slug}-${hashString(sourcePath)}.js`), rewritten);
}
