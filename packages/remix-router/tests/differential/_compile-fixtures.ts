/** Side-effect-free compiler shared by the client and SSR global setups. */
import { compile as compileToReact } from '@tsrx/react';
import { transformSync as esbuildTransformSync } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';

const FIXTURE_DIR = join(import.meta.dirname, '../_fixtures');

function hashString(s: string): string {
	let h = 5381;
	for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
	return Math.abs(h).toString(36);
}

function compileOne(srcPath: string, cacheDir: string): void {
	const source = readFileSync(srcPath, 'utf8');
	const compiled = compileToReact(source, srcPath);
	if (compiled.errors && compiled.errors.length > 0) {
		throw new Error(
			`React differential precompile failed for ${srcPath}:\n${compiled.errors.join('\n')}`,
		);
	}
	const transformed = esbuildTransformSync(compiled.code, {
		loader: 'tsx',
		jsx: 'automatic',
		jsxImportSource: 'react',
		target: 'esnext',
		format: 'esm',
		sourcefile: srcPath,
	});
	const rewritten = transformed.code
		.replace(
			/from\s+["']@octanejs\/remix-router(\/[^"']*)?["']/g,
			(_match, subpath) => `from "react-router${subpath || ''}"`,
		)
		.replace(/from\s+["']octane["']/g, 'from "react"');
	const slug = basename(srcPath).replace(/\.tsrx$/, '');
	writeFileSync(join(cacheDir, `${slug}-${hashString(srcPath)}.js`), rewritten);
}

export function compileFixtures(cacheDir: string, fixtures: readonly string[]): void {
	rmSync(cacheDir, { recursive: true, force: true });
	mkdirSync(cacheDir, { recursive: true });
	for (const fixture of fixtures) compileOne(join(FIXTURE_DIR, fixture), cacheDir);
}
