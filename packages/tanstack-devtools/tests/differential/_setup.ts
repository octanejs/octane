import { transformSync } from 'esbuild';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compileReactFixture } from '../../../../test-utils/differential-precompile.js';

const fixture = join(import.meta.dirname, '../_fixtures/devtools-diff.tsrx');
const cacheDirectory = join(import.meta.dirname, '.react-cache');
const upstreamSrc = join(import.meta.dirname, '../../upstream/src');

function compileUpstreamModule(name: string, extension: '.ts' | '.tsx'): string {
	const sourcePath = join(upstreamSrc, `${name}${extension}`);
	const adapter = transformSync(readFileSync(sourcePath, 'utf8'), {
		loader: 'tsx',
		jsx: 'automatic',
		jsxImportSource: 'react',
		target: 'esnext',
		format: 'esm',
		sourcefile: sourcePath,
	});
	const rewritten = adapter.code.replace(
		/from\s+["']\.\/([\w.-]+)["']/g,
		(_match, specifier: string) => `from "./react-devtools-${specifier}.js"`,
	);
	const outFile = join(cacheDirectory, `react-devtools-${name}.js`);
	writeFileSync(outFile, rewritten);
	return outFile;
}

export async function setup(): Promise<void> {
	rmSync(cacheDirectory, { recursive: true, force: true });
	mkdirSync(cacheDirectory, { recursive: true });
	// Compile the internal module first, then the public index barrel so the
	// differential resolves the same entrypoint consumers import.
	compileUpstreamModule('devtools', '.tsx');
	const publicEntry = compileUpstreamModule('index', '.ts');
	writeFileSync(join(cacheDirectory, 'react-devtools.js'), readFileSync(publicEntry));
	compileReactFixture(fixture, {
		fixtureDir: join(import.meta.dirname, '../_fixtures'),
		cacheDir: cacheDirectory,
		rewrites: [[/from\s+["']@octanejs\/tanstack-devtools["']/g, 'from "@tanstack/react-devtools"']],
		fixtures: ['devtools-diff.tsrx'],
		depsFrom: import.meta.url,
	});
}

export async function teardown(): Promise<void> {}
