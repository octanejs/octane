import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, it, vi } from 'vitest';

// @parity-case conformance:use-sync-external-store-main-entry-warning
it('warns once in development when the main entry point loads, as the published package does', async () => {
	const error = vi.spyOn(console, 'error').mockImplementation(() => {});
	createRequire(resolve(import.meta.dirname, '../upstream-artifact/package/package.json'))(
		'./index.js',
	);
	expect(error).toHaveBeenCalledTimes(1);
	expect(error.mock.calls[0][0]).toMatch(
		/^The main 'use-sync-external-store' entry point is not supported/,
	);

	error.mockClear();
	await import('@octanejs/use-sync-external-store');
	expect(error).toHaveBeenCalledTimes(1);
	expect(error.mock.calls[0][0]).toMatch(
		/^The main '@octanejs\/use-sync-external-store' entry point is not supported/,
	);
	error.mockRestore();
});
