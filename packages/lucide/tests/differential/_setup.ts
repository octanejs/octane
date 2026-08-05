/**
 * Precompile Lucide's differential fixtures for React. The same `.tsrx`
 * source is loaded by Octane and rewritten to use published lucide-react on
 * the React side.
 */
import { compile as compileToReact } from '@tsrx/react';
import { transformSync as esbuildTransformSync } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE_DIR = join(__dirname, '../_fixtures');
const CACHE_DIR = join(__dirname, '.react-cache');
const ICONS_RUNTIME = join(CACHE_DIR, 'icons-runtime.js');

function hashString(value: string): string {
	let hash = 5381;
	for (let index = 0; index < value.length; index++) {
		hash = ((hash << 5) + hash + value.charCodeAt(index)) | 0;
	}
	return Math.abs(hash).toString(36);
}

function compileOne(sourcePath: string): void {
	const source = readFileSync(sourcePath, 'utf8');
	let compiled;
	try {
		compiled = compileToReact(source, sourcePath);
	} catch {
		return;
	}
	if (compiled.errors && compiled.errors.length > 0) return;

	let transformed;
	try {
		transformed = esbuildTransformSync(compiled.code, {
			loader: 'tsx',
			jsx: 'automatic',
			jsxImportSource: 'react',
			target: 'esnext',
			format: 'esm',
			sourcefile: sourcePath,
		});
	} catch {
		return;
	}

	const rewritten = transformed.code
		.replace(
			/from\s+["']@octanejs\/lucide(\/[^"']*)?["']/g,
			(_match, subpath) => `from "lucide-react${subpath || ''}"`,
		)
		.replace(/from\s+["']octane["']/g, 'from "react"');
	const slug = basename(sourcePath).replace(/\.tsrx$/, '');
	writeFileSync(join(CACHE_DIR, `${slug}-${hashString(sourcePath)}.js`), rewritten);
}

function walk(directory: string): string[] {
	const files: string[] = [];
	for (const name of readdirSync(directory)) {
		const fullPath = join(directory, name);
		if (statSync(fullPath).isDirectory()) files.push(...walk(fullPath));
		else if (fullPath.endsWith('.tsrx')) files.push(fullPath);
	}
	return files;
}

export async function setup(): Promise<void> {
	if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
	// icons.tsrx uses a narrow Octane implementation facade so the unbundled
	// test does not load every generated icon. Give the compiled React fixture
	// the equivalent facade; the root export inventories are tested separately.
	writeFileSync(
		ICONS_RUNTIME,
		"export { Camera, CircleAlert, Icon, LucideProvider, Search } from 'lucide-react';\n",
	);
	if (!existsSync(FIXTURE_DIR)) return;
	for (const sourcePath of walk(FIXTURE_DIR)) compileOne(sourcePath);
}

export async function teardown(): Promise<void> {}
