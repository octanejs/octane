import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const packageRoot = resolve(import.meta.dirname, '..');
const upstreamRoot = process.env.FLOATING_UI_PRISTINE_ROOT
	? resolve(process.env.FLOATING_UI_PRISTINE_ROOT)
	: resolve(packageRoot, 'upstream');

export default defineConfig({
	root: packageRoot,
	cacheDir: resolve(packageRoot, '.upstream-vitest-cache'),
	define: {
		__DEV__: true,
	},
	test: {
		name: 'floating-ui-pristine-suite',
		include: [
			resolve(upstreamRoot, 'packages/react/test/unit/**/*.test.{ts,tsx}'),
			resolve(upstreamRoot, 'packages/react-dom/test/index.test.tsx'),
		],
		environment: 'jsdom',
		globals: true,
		setupFiles: [
			resolve(upstreamRoot, 'packages/react/test/unit/setupTests.ts'),
			resolve(upstreamRoot, 'packages/react-dom/test/setupTests.ts'),
		],
		server: {
			deps: {
				fallbackCWD: packageRoot,
				inline: [
					'@floating-ui/dom',
					'@floating-ui/react',
					'@floating-ui/react-dom',
					'@floating-ui/utils',
					'react',
					'react-dom',
				],
			},
		},
	},
	resolve: {
		alias: [
			{
				find: /^@floating-ui\/core$/,
				replacement: resolve(upstreamRoot, 'packages/core/src/index.ts'),
			},
			{
				find: /^@floating-ui\/dom$/,
				replacement: resolve(upstreamRoot, 'packages/dom/src/index.ts'),
			},
			{
				find: /^@floating-ui\/react\/utils$/,
				replacement: resolve(upstreamRoot, 'packages/react/src/utils.ts'),
			},
			{
				find: /^@floating-ui\/react-dom$/,
				replacement: resolve(upstreamRoot, 'packages/react-dom/src/index.ts'),
			},
			{
				find: /^@floating-ui\/utils$/,
				replacement: resolve(upstreamRoot, 'packages/utils/src/index.ts'),
			},
			{
				find: /^@floating-ui\/utils\/dom$/,
				replacement: resolve(upstreamRoot, 'packages/utils/src/dom.ts'),
			},
			{
				find: /^tabbable$/,
				replacement: resolve(packageRoot, 'node_modules/tabbable-pristine/dist/index.esm.js'),
			},
		],
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
