import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const upstreamRoot = process.env.REACT_SPRING_PRISTINE_ROOT
	? path.resolve(process.env.REACT_SPRING_PRISTINE_ROOT)
	: path.join(packageRoot, 'upstream');

export default defineConfig({
	cacheDir: path.join(packageRoot, '.pristine-vite-cache'),
	resolve: {
		alias: [
			{
				find: /^@react-spring\/mock-raf$/,
				replacement: path.join(packageRoot, 'node_modules/@react-spring/mock-raf/index.js'),
			},
			{
				find: /^@react-spring\/parallax$/,
				replacement: path.join(upstreamRoot, 'packages/parallax/src/index.tsx'),
			},
			{
				find: /^@react-spring\/(web|native|three|konva|zdog)$/,
				replacement: path.join(upstreamRoot, 'targets/$1/src/index.ts'),
			},
			{
				find: /^@react-spring\/(.*)$/,
				replacement: path.join(upstreamRoot, 'packages/$1/src/index.ts'),
			},
			{
				find: /^react$/,
				replacement: path.join(packageRoot, 'node_modules/react'),
			},
			{
				find: /^react-dom$/,
				replacement: path.join(packageRoot, 'node_modules/react-dom'),
			},
		],
	},
	test: {
		name: 'react-spring-pristine',
		globals: true,
		include: ['packages/**/src/**/*.test.{ts,tsx}', 'targets/**/src/**/*.test.{ts,tsx}'],
		exclude: ['**/*.native.{ts,tsx}', '**/node_modules/**', '**/dist/**', '**/__snapshots__/**'],
		root: upstreamRoot,
		setupFiles: [path.join(upstreamRoot, 'packages/core/test/setup.ts')],
		fakeTimers: {
			toFake: [
				'setTimeout',
				'clearTimeout',
				'setInterval',
				'clearInterval',
				'Date',
				'queueMicrotask',
				'performance',
			],
		},
		browser: {
			enabled: true,
			provider: playwright(),
			headless: true,
			screenshotFailures: false,
			instances: [{ browser: 'chromium' }],
		},
	},
});
