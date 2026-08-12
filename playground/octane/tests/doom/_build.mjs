import { existsSync, mkdirSync, symlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'vite';

const playgroundRoot = resolve(import.meta.dirname, '../..');
const stagingRoot = resolve(process.argv[2]);
const mode = process.argv[3] ?? 'all';
const clientOut = resolve(stagingRoot, 'client');
const serverOut = resolve(stagingRoot, 'server');
const configFile = resolve(playgroundRoot, 'vite.config.ts');

mkdirSync(stagingRoot, { recursive: true });
const stagedModules = resolve(stagingRoot, 'node_modules');
if (!existsSync(stagedModules)) {
	// Resolve playground deps (including `three`) when the SSR bundle keeps them external.
	symlinkSync(resolve(playgroundRoot, 'node_modules'), stagedModules, 'dir');
}

process.env.VITE_DOOM_PROOF = '1';

if (mode !== 'ssr')
	await build({
		root: playgroundRoot,
		configFile,
		configLoader: 'runner',
		logLevel: 'silent',
		build: {
			outDir: clientOut,
			emptyOutDir: true,
			minify: false,
		},
	});

if (mode !== 'client')
	await build({
		root: playgroundRoot,
		configFile,
		configLoader: 'runner',
		logLevel: 'silent',
		build: {
			ssr: resolve(import.meta.dirname, '_ssr-entry.ts'),
			outDir: serverOut,
			emptyOutDir: true,
			minify: false,
			rollupOptions: { output: { entryFileNames: 'entry.mjs' } },
		},
	});

console.log(
	'__OCTANE_DOOM_BUILD_EVIDENCE__' +
		JSON.stringify({ clientOut, serverEntry: resolve(serverOut, 'entry.mjs') }),
);
