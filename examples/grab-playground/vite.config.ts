import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import type tailwindcss from '@tailwindcss/vite';
import { octane } from '../../packages/octane/src/compiler/vite.js';

const playgroundRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(playgroundRoot, '../..');
const require = createRequire(resolve(playgroundRoot, 'package.json'));
const grabPkg = resolve(repoRoot, 'packages/grab');
const octaneSrc = resolve(repoRoot, 'packages/octane/src');
const tailwindPlugin = require('@tailwindcss/vite').default as typeof tailwindcss;

export default defineConfig({
	root: playgroundRoot,
	plugins: [
		octane({
			requireDirective: true,
		}),
		tailwindPlugin(),
	],
	define: {
		'process.env.NODE_ENV': JSON.stringify('development'),
		'process.env.VERSION': JSON.stringify('[DEV]'),
		'process.env.IS_DEMO': JSON.stringify(''),
		'process.env.REACT_GRAB_SOURCE_LOCATIONS': JSON.stringify(''),
	},
	resolve: {
		alias: [
			{
				find: /^@octanejs\/grab$/,
				replacement: resolve(grabPkg, 'src/index.ts'),
			},
			{
				find: /^@octanejs\/grab\/styles\.css$/,
				replacement: resolve(grabPkg, 'src/styles.css'),
			},
			{
				find: /^@octanejs\/grab\/primitives$/,
				replacement: resolve(grabPkg, 'src/primitives.ts'),
			},
			{
				find: /^@octanejs\/grab\/core$/,
				replacement: resolve(grabPkg, 'src/core/index.tsx'),
			},
			{
				find: /^octane$/,
				replacement: resolve(octaneSrc, 'index.ts'),
			},
			{
				find: /^octane\/(.+)$/,
				replacement: `${octaneSrc}/$1`,
			},
		],
		extensions: ['.tsrx', '.tsx', '.ts', '.mjs', '.js', '.jsx', '.json'],
		conditions: ['browser', 'development', 'import', 'module', 'default'],
	},
	server: {
		port: 5299,
		fs: {
			allow: [repoRoot],
		},
	},
	optimizeDeps: {
		exclude: ['octane', '@octanejs/grab'],
	},
});
