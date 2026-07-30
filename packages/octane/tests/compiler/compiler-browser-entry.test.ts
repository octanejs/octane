// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// `octane/compiler` is imported directly by browser consumers — the website
// playground compiles in the page, and CDN consumers (esm.sh, jsdelivr) load
// the subpath unbundled, so nothing tree-shakes an unused re-export away for
// them. A Node builtin anywhere in the subpath's module graph therefore reaches
// the browser as a polyfill shim or a hard resolution failure. The bundler and
// Vite plugin keep their Node dependencies behind `octane/compiler/bundler` and
// `octane/compiler/vite`, which no browser consumer imports.

const COMPILER_SRC = resolve(import.meta.dirname, '..', '..', 'src', 'compiler');

/** Matches the specifier of a static `import`/`export ... from` declaration. */
const STATIC_SPECIFIER = /(?:^|\n)\s*(?:import|export)\b[\s\S]*?from\s*['"]([^'"]+)['"]/g;

/**
 * Walk the module graph reachable from `entry` through octane's own relative
 * imports, returning every Node builtin specifier found and the import chain
 * that reaches it.
 */
function findNodeBuiltins(
	entry: string,
	readSource: (file: string) => string = (file) => readFileSync(file, 'utf8'),
) {
	const found: Array<{ builtin: string; chain: string[] }> = [];
	const seen = new Set<string>();

	const visit = (file: string, chain: string[]) => {
		if (seen.has(file)) return;
		seen.add(file);

		const source = readSource(file);
		const here = [...chain, file.slice(COMPILER_SRC.length + 1)];

		for (const [, specifier] of source.matchAll(STATIC_SPECIFIER)) {
			if (specifier.startsWith('node:')) {
				found.push({ builtin: specifier, chain: here });
			} else if (specifier.startsWith('.')) {
				visit(join(dirname(file), specifier), here);
			}
		}
	};

	visit(entry, []);
	return found;
}

describe('octane/compiler in the browser', () => {
	it('reaches no Node builtin from the compiler entry', () => {
		const offenders = findNodeBuiltins(join(COMPILER_SRC, 'index.js'));

		expect(offenders.map(({ builtin, chain }) => `${builtin} via ${chain.join(' -> ')}`)).toEqual(
			[],
		);
	});

	it('follows relative imports to detect a transitive Node builtin', () => {
		const entry = join(COMPILER_SRC, 'oracle-entry.js');
		const dependency = join(COMPILER_SRC, 'oracle-dependency.js');
		const modules = new Map([
			[entry, "export { sentinel } from './oracle-dependency.js';"],
			[
				dependency,
				"import { readFileSync } from 'node:fs';\nexport const sentinel = readFileSync;",
			],
		]);

		const offenders = findNodeBuiltins(entry, (file) => {
			const source = modules.get(file);
			if (source === undefined) throw new Error(`Unexpected oracle module: ${file}`);
			return source;
		});

		expect(offenders).toEqual([
			{
				builtin: 'node:fs',
				chain: ['oracle-entry.js', 'oracle-dependency.js'],
			},
		]);
	});
});
