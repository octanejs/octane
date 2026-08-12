import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('valtio debug labels', () => {
	it('omits React DevTools debug labels from the snapshot hook', () => {
		const source = readFileSync(resolve(packageRoot, 'src/react.ts'), 'utf8');
		expect(source).not.toContain('useDebugValue');
	});
});
