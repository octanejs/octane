import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { octane } from '../octane/src/compiler/vite.js';

export default defineConfig({
	plugins: [octane()],
	test: {
		name: 'rive',
		include: ['tests/**/*.test.ts'],
		environment: 'jsdom',
		globals: false,
	},
	resolve: {
		alias: [
			{
				find: /^@rive-app\/canvas$/,
				replacement: resolve(import.meta.dirname, 'tests/_stubs/rive-app-canvas.ts'),
			},
			{
				find: /^@octanejs\/rive$/,
				replacement: resolve(import.meta.dirname, 'src/index.ts'),
			},
		],
	},
});
