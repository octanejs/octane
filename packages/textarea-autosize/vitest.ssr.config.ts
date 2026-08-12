import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { octane } from '../octane/src/compiler/vite.js';

export default defineConfig({
	root: new URL('.', import.meta.url).pathname,
	plugins: [octane({ requireDirective: true, ssr: true }), react()],
	resolve: {
		dedupe: ['react', 'react-dom'],
		alias: [
			{
				find: /^octane$/,
				replacement: new URL('../octane/src/server/index.ts', import.meta.url).pathname,
			},
			{
				find: /^use-composed-ref$/,
				replacement: new URL(
					'../../node_modules/use-composed-ref/dist/use-composed-ref.esm.js',
					import.meta.url,
				).pathname,
			},
			{
				find: /^use-isomorphic-layout-effect$/,
				replacement: new URL(
					'../../node_modules/use-isomorphic-layout-effect/dist/use-isomorphic-layout-effect.esm.js',
					import.meta.url,
				).pathname,
			},
			{
				find: /^use-latest$/,
				replacement: new URL(
					'../../node_modules/use-latest/dist/use-latest.esm.js',
					import.meta.url,
				).pathname,
			},
		],
	},
	test: {
		environment: 'node',
		include: ['tests/ssr/**/*.test.ts'],
		server: {
			deps: {
				inline: ['use-composed-ref', 'use-isomorphic-layout-effect', 'use-latest'],
			},
		},
	},
});
