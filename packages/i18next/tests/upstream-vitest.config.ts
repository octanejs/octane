import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const upstreamRoot = process.env.I18NEXT_PRISTINE_ROOT
	? resolve(process.env.I18NEXT_PRISTINE_ROOT)
	: resolve(import.meta.dirname, '../upstream');

export default defineConfig({
	root: upstreamRoot,
	cacheDir: resolve(upstreamRoot, '.vite-cache'),
	test: {
		name: 'i18next-pristine',
		include: ['test/**/*.spec.{js,jsx}'],
		exclude: ['test/typescript/**'],
		environment: 'happy-dom',
		setupFiles: [resolve(upstreamRoot, 'test/setup.js')],
		maxWorkers: 1,
		server: {
			deps: {
				// jest-dom 6.x declares no vitest peer, so its /vitest entry resolves
				// a different vitest instance than the runner's; that copy's chai.use
				// shadows snapshot matchers on the shared chai. Inline it so vitest's
				// core resolver binds vitest to the running instance.
				inline: ['@testing-library/jest-dom'],
			},
		},
	},
	oxc: {
		jsx: { runtime: 'automatic', importSource: 'react' },
	},
});
