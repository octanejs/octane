import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

it('keeps the binding public surface free of React imports and types', function () {
	for (const file of [
		'index.ts',
		'markdown-async.ts',
		'markdown-hooks.tsrx',
		'processor.ts',
		'project.ts',
		'types.ts',
		'url-transform.ts',
	]) {
		const source = readFileSync(join(import.meta.dirname, '../../src', file), 'utf8');
		expect(source).not.toMatch(/from ['"]react(?:\/|['"])/);
		expect(source).not.toMatch(/\bReact(?:Element|Node|Component|JSX)\b/);
	}
});
