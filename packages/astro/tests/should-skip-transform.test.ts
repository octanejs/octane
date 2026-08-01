import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
	isInstalledOctaneCompilerTarget,
	shouldSkipOctaneTransform,
} from '../src/should-skip-transform.js';

const thisPackageServer = join(dirname(fileURLToPath(import.meta.url)), '../src/server.js');

describe('shouldSkipOctaneTransform', () => {
	it('skips Vite virtual modules and Astro/static assets', () => {
		expect(shouldSkipOctaneTransform('\0astro:octane:opts')).toBe(true);
		expect(shouldSkipOctaneTransform('/src/pages/index.astro')).toBe(true);
		expect(shouldSkipOctaneTransform('/src/styles/app.css')).toBe(true);
	});

	it('allows project Octane sources', () => {
		expect(shouldSkipOctaneTransform('/src/components/Counter.tsrx')).toBe(false);
		expect(shouldSkipOctaneTransform('/src/components/Badge.tsx')).toBe(false);
		expect(shouldSkipOctaneTransform('/src/lib/store.ts')).toBe(false);
	});

	it('skips ordinary node_modules packages', () => {
		expect(shouldSkipOctaneTransform('/app/node_modules/astro/dist/runtime.js')).toBe(true);
		expect(shouldSkipOctaneTransform('/app/node_modules/react/index.js')).toBe(true);
		expect(
			shouldSkipOctaneTransform(
				'/app/node_modules/.pnpm/astro@5.0.0/node_modules/astro/dist/core.js',
			),
		).toBe(true);
	});

	it('allows installed @octanejs bindings and octane under node_modules', () => {
		expect(shouldSkipOctaneTransform('/app/node_modules/@octanejs/zustand/src/index.ts')).toBe(
			false,
		);
		expect(
			shouldSkipOctaneTransform(
				'/app/node_modules/.pnpm/@octanejs+tanstack-query@0.1.0/node_modules/@octanejs/tanstack-query/src/QueryClientProvider.tsrx',
			),
		).toBe(false);
		expect(shouldSkipOctaneTransform('/app/node_modules/octane/src/index.ts')).toBe(false);
		expect(
			shouldSkipOctaneTransform(
				'/app/node_modules/.pnpm/octane@0.1.0/node_modules/octane/src/runtime.ts',
			),
		).toBe(false);
	});

	it('still skips @octanejs/astro itself under node_modules', () => {
		expect(shouldSkipOctaneTransform('/app/node_modules/@octanejs/astro/src/server.js')).toBe(true);
		expect(
			shouldSkipOctaneTransform(
				'/app/node_modules/.pnpm/@octanejs+astro@0.0.1/node_modules/@octanejs/astro/src/client.js',
			),
		).toBe(true);
	});

	it('skips only this package root after Vite realpath, not a consumer packages/astro app', () => {
		expect(shouldSkipOctaneTransform(thisPackageServer)).toBe(true);
		expect(shouldSkipOctaneTransform(thisPackageServer + '?v=hmr')).toBe(true);
		expect(shouldSkipOctaneTransform('/apps/packages/astro/src/islands/Counter.tsrx')).toBe(false);
		expect(
			shouldSkipOctaneTransform('/home/jesse/wsl-projects/oss/octane/packages/octane/src/index.ts'),
		).toBe(false);
	});
});

describe('isInstalledOctaneCompilerTarget', () => {
	it('recognizes binding packages that must bypass project include globs', () => {
		expect(
			isInstalledOctaneCompilerTarget('/app/node_modules/@octanejs/zustand/src/index.tsrx'),
		).toBe(true);
		expect(isInstalledOctaneCompilerTarget('/app/node_modules/octane/src/index.ts')).toBe(true);
		expect(isInstalledOctaneCompilerTarget('/src/components/octane/Counter.tsrx')).toBe(false);
		expect(isInstalledOctaneCompilerTarget('/app/node_modules/@octanejs/astro/src/server.js')).toBe(
			false,
		);
	});

	it('recognizes Vite-realpathed workspace bindings next to this package', () => {
		const testsDir = dirname(fileURLToPath(import.meta.url));
		const zustandSource = join(testsDir, '../../zustand/src/index.ts');
		const octaneRuntime = join(testsDir, '../../octane/src/index.ts');
		expect(isInstalledOctaneCompilerTarget(zustandSource)).toBe(true);
		expect(isInstalledOctaneCompilerTarget(octaneRuntime)).toBe(true);
		expect(isInstalledOctaneCompilerTarget(zustandSource + '?t=1')).toBe(true);
		// This integration itself must not be an ownership-bypass compile target.
		expect(isInstalledOctaneCompilerTarget(thisPackageServer)).toBe(false);
		// A consumer app at packages/astro is not a sibling of THIS package root.
		expect(isInstalledOctaneCompilerTarget('/apps/packages/astro/src/Counter.tsrx')).toBe(false);
	});
});
