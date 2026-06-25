/**
 * Differential parity: the SAME `.tsrx` runs through @octane-ts/query (octane) AND
 * real @tanstack/react-query (the setup rewrites `@octane-ts/query` →
 * `@tanstack/react-query`). For a synchronous `initialData` query the rendered
 * result shape (data + status + flags) must be byte-identical — proving the
 * octane binding wires up query-core exactly like react-query.
 */
import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

const CACHED = resolve(__dirname, '../_fixtures/cached-diff.tsrx');
const CACHE = resolve(__dirname, '.react-cache');

describe('differential: @octane-ts/query vs real @tanstack/react-query', () => {
	it('CachedApp: initialData query renders byte-identical result shape', async () => {
		const d = await mountDifferential(CACHED, 'CachedApp', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});
});
