import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const upstreamRoot = process.env.LIVESTORE_PRISTINE_ROOT
	? resolve(process.env.LIVESTORE_PRISTINE_ROOT)
	: resolve(import.meta.dirname, '../upstream');

export default defineConfig({
	cacheDir: resolve(upstreamRoot, '.vite-cache'),
	test: {
		name: 'livestore-pristine',
		root: upstreamRoot,
		include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
		environment: 'node',
		setupFiles: [resolve(upstreamRoot, 'test/setup.ts')],
		globals: true,
		server: { deps: { inline: ['@effect/vitest'] } },
	},
	esbuild: {
		target: 'es2020',
		tsconfigRaw: {
			compilerOptions: {
				esModuleInterop: true,
				jsx: 'react-jsx',
				module: 'ESNext',
				moduleResolution: 'Bundler',
				target: 'ES2020',
			},
		},
	},
	resolve: {
		alias: {
			'@livestore/wa-sqlite/dist/wa-sqlite.mjs': '@livestore/wa-sqlite/dist/wa-sqlite.node.mjs',
		},
	},
});
