/** Compile only the SSR oracle fixture into an isolated cache. */
import { join } from 'node:path';
import { compileFixtures } from './_compile-fixtures.js';

const SSR_CACHE_DIR = join(import.meta.dirname, '.react-cache-ssr');

export async function setup(): Promise<void> {
	compileFixtures(SSR_CACHE_DIR, ['static-ssr-diff.tsrx']);
}

export async function teardown(): Promise<void> {
	// Cache is regenerated on each run; nothing to clean up.
}
