import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const packageRoot = resolve(import.meta.dirname, '..');
const upstreamRoot = process.env.TANSTACK_STORE_PRISTINE_ROOT
	? resolve(process.env.TANSTACK_STORE_PRISTINE_ROOT)
	: resolve(packageRoot, 'upstream');

export default defineConfig({
	root: packageRoot,
	cacheDir: resolve(packageRoot, '.upstream-vitest-cache'),
	test: {
		name: 'tanstack-store-pristine-suite',
		include: [resolve(upstreamRoot, 'tests/index.test.tsx')],
		environment: 'jsdom',
		globals: true,
		setupFiles: [resolve(upstreamRoot, 'tests/test-setup.ts')],
		server: {
			deps: {
				fallbackCWD: packageRoot,
				inline: [
					'use-sync-external-store',
					'use-sync-external-store/shim/with-selector',
					'@tanstack/store',
					'@tanstack/react-store',
				],
			},
		},
	},
	esbuild: {
		target: 'es2020',
		tsconfigRaw: {
			compilerOptions: {
				esModuleInterop: true,
				jsx: 'react-jsx',
				jsxImportSource: 'react',
				module: 'ESNext',
				moduleResolution: 'Bundler',
				target: 'ES2020',
			},
		},
	},
});
