import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { compile } from '../../octane/src/compiler/compile.js';
import { octane } from '../../octane/src/compiler/vite.js';

const packageRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(packageRoot, '../..');
const adaptedRoot = resolve(packageRoot, 'tests/upstream') + '/';

export default defineConfig({
	root: packageRoot,
	test: {
		name: 'i18next-adapted',
		include: ['tests/upstream/**/*.spec.{js,jsx}'],
		exclude: ['tests/upstream/typescript/**'],
		environment: 'happy-dom',
		setupFiles: ['tests/_setup.adapted.ts'],
	},
	plugins: [
		{
			name: 'i18next-adapted-javascript',
			enforce: 'pre',
			transform(source, id) {
				const file = id.split('?')[0];
				if (file.startsWith(adaptedRoot) && /\.jsx?$/.test(file)) {
					// Upstream keeps its JSX fixtures in .js/.jsx files. Compile
					// those fixtures with the same authored TSX compiler as consumers.
					return compile(source, file.replace(/\.jsx?$/, '.tsx'), { dev: true });
				}
			},
		},
		octane(),
	],
	resolve: {
		dedupe: ['vitest', 'octane', 'i18next'],
		alias: [
			{
				find: /^@octanejs\/testing-library$/,
				replacement: resolve(repoRoot, 'packages/testing-library/src/index.ts'),
			},
		],
	},
});
