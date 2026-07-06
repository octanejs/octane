// Vitest globalSetup: prepare BOTH sides of the pipeline before any test loads.
//   • tests/.bridged/<name>.tsx — the codemod output (unmodified React → bridge)
//     that the octane() plugin then compiles + slots when a test imports it.
//   • tests/.react/<name>.mjs   — the *original* example compiled with esbuild's
//     real-React automatic JSX runtime, for the differential oracle.
// Both run here in pure Node (esbuild's binary protocol breaks under jsdom).
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';
import { bridge } from '../src/codemod.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(here, '..', 'examples');
const bridgedDir = join(here, '.bridged');
const reactDir = join(here, '.react');

// Only the bridgeable examples get mounted; e4 is the wall (detector blocks it).
const BRIDGEABLE = [
	'e1-counter',
	'e2-context',
	'e3-store',
	'e5-portal',
	'e6-imperative',
	'e7-suspense',
	'e8-store-app',
];

export async function setup() {
	for (const dir of [bridgedDir, reactDir]) {
		await rm(dir, { recursive: true, force: true });
		await mkdir(dir, { recursive: true });
	}
	for (const name of BRIDGEABLE) {
		const source = await readFile(join(examplesDir, `${name}.tsx`), 'utf8');

		// Octane side — bridge, then octane() compiles the .tsx on import.
		await writeFile(join(bridgedDir, `${name}.tsx`), bridge(source).source);

		// React side — the ORIGINAL source through esbuild's real-React JSX runtime.
		const { code } = transformSync(source, {
			loader: 'tsx',
			jsx: 'automatic',
			jsxImportSource: 'react',
			format: 'esm',
			target: 'esnext',
			sourcefile: `${name}.tsx`,
		});
		await writeFile(join(reactDir, `${name}.mjs`), code);
	}
}

export async function teardown() {
	await rm(bridgedDir, { recursive: true, force: true });
	await rm(reactDir, { recursive: true, force: true });
}
