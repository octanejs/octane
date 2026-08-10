import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { octane } from '../octane/src/compiler/vite.js';

export default defineConfig({
	root: new URL('.', import.meta.url).pathname,
	plugins: [octane({ requireDirective: true }), react()],
	resolve: {
		dedupe: ['react', 'react-dom'],
		alias: {
			octane: new URL('../octane/src/index.ts', import.meta.url).pathname,
			'use-composed-ref': new URL(
				'../../node_modules/use-composed-ref/dist/use-composed-ref.esm.js',
				import.meta.url,
			).pathname,
			'use-isomorphic-layout-effect': new URL(
				'../../node_modules/use-isomorphic-layout-effect/dist/use-isomorphic-layout-effect.esm.js',
				import.meta.url,
			).pathname,
			'use-latest': new URL('../../node_modules/use-latest/dist/use-latest.esm.js', import.meta.url)
				.pathname,
		},
	},
	test: {
		environment: 'jsdom',
		include: ['tests/**/*.test.ts'],
		exclude: ['tests/browser/**/*.test.ts', 'tests/ssr/**/*.test.ts'],
		server: {
			deps: {
				inline: ['use-composed-ref', 'use-isomorphic-layout-effect', 'use-latest'],
			},
		},
	},
});
