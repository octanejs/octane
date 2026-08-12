/**
 * Adapted from packages/tiptap/upstream/src/use-client.spec.ts.
 *
 * @vitest-environment node
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function firstStatement(entry: string): string {
	const path = resolve(import.meta.dirname, '../../', entry);
	return readFileSync(path, 'utf8')
		.replace(/^\uFEFF/, '')
		.split('\n')[0]
		.trimEnd();
}

describe('use client boundary', function () {
	// Per upstream/src/use-client.spec.ts:14 (./index.ts entry).
	it('./index.ts starts with the "use client" directive', function () {
		expect(firstStatement('src/index.ts')).toMatch(/^(['"])use client\1;?$/);
	});

	// Per upstream/src/use-client.spec.ts:14 (./menus/index.ts entry).
	it('./menus/index.ts starts with the "use client" directive', function () {
		expect(firstStatement('src/menus/index.ts')).toMatch(/^(['"])use client\1;?$/);
	});
});
