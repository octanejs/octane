// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { compile } from 'octane/compiler';
import { transformSync } from 'esbuild';
import { readFileSync } from 'node:fs';
describe('component type namespaces', () => {
	for (const mode of ['client', 'server'] as const) {
		for (const dev of [true, false]) {
			it(`erases component type namespaces from ${mode} JavaScript (dev=${dev})`, () => {
				const source = readFileSync(
					new URL('../_fixtures/compiler-type-namespace.tsrx', import.meta.url),
					'utf8',
				);
				const result = compile(source, 'component-namespace.tsrx', { mode, dev });
				// A JavaScript loader must accept the module without another TS transform.
				expect(() => transformSync(result.code, { loader: 'js' })).not.toThrow();
			});
		}
	}
});

describe('generic TypeScript component syntax', () => {
	const source = readFileSync(
		new URL('../_fixtures/compiler-generic-interface.tsrx', import.meta.url),
		'utf8',
	);
	it.each(['client', 'server'] as const)(
		'compiles callable interfaces and qualified JSX types for %s',
		(mode) => {
			const result = compile(source, 'generic-interface.tsrx', { mode });
			expect(() => transformSync(result.code, { loader: 'js' })).not.toThrow();
		},
	);
});
