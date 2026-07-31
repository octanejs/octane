import { describe, it, expect } from 'vitest';
import { shouldSkipOctaneTransform } from '../src/should-skip-transform.js';

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
});
