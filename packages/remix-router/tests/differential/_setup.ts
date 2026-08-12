/** Compile the declared client parity fixtures into an isolated React cache. */
import { join } from 'node:path';
import { compileFixtures } from './_compile-fixtures.js';

const CLIENT_CACHE_DIR = join(import.meta.dirname, '.react-cache');

export async function setup(): Promise<void> {
	compileFixtures(CLIENT_CACHE_DIR, [
		'nested-layouts-diff.tsrx',
		'loader-redirect-error-diff.tsrx',
		'await-deferred-diff.tsrx',
		'pending-navigation-diff.tsrx',
		'declarative-diff.tsrx',
		'navlink-diff.tsrx',
		'forms-diff.tsrx',
		'guards-diff.tsrx',
	]);
}

export async function teardown(): Promise<void> {
	// Cache is regenerated on each run; nothing to clean up.
}
