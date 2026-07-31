import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PKG_ROOT = join(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8'));
const exports: Record<string, string> = pkg.exports;

const BASES = [
	['radix', ''],
	['react-aria', 'react-aria/'],
	['base-ui', 'base-ui/'],
] as const;

const pascal = (kebab: string) =>
	kebab
		.split('-')
		.map((part) => part[0].toUpperCase() + part.slice(1))
		.join('');

const baseFiles = (base: string) => {
	const dir = join(PKG_ROOT, 'src', 'bases', base, 'ui');
	return existsSync(dir)
		? readdirSync(dir)
				.filter((f) => f.endsWith('.tsrx'))
				.sort()
		: [];
};

// The package is consumed two ways and they must not drift apart: the shadcn
// CLI installs from registry/, and an application can import a family directly
// by subpath. A component that exists in src/ but is reachable by neither is
// invisible; one that is reachable by only one is a surface inconsistency a
// consumer hits as a missing import or a missing registry item.
describe('@octanejs/shadcn — published surface', () => {
	it('exposes no barrel entry', () => {
		// Distribution is registry-first with per-family subpaths. A "." entry
		// would re-introduce `import { Button, Dialog } from '@octanejs/shadcn'`,
		// which pulls every family (and every base's primitives) into a consumer
		// bundle to use one component.
		expect(exports['.']).toBeUndefined();
		expect(pkg.main).toBeUndefined();
		expect(pkg.module).toBeUndefined();
	});

	for (const [base, prefix] of BASES) {
		const files = baseFiles(base);
		if (files.length === 0) continue;

		it(`maps every ${base} source file to a subpath`, () => {
			const missing = files.filter((f) => {
				const sub = `./${prefix}${pascal(f.replace(/\.tsrx$/, ''))}`;
				return exports[sub] !== `./src/bases/${base}/ui/${f}`;
			});
			expect(missing, `${base} sources with no matching exports entry`).toEqual([]);
		});

		it(`points every ${base} subpath at a file that exists`, () => {
			const dangling = Object.entries(exports)
				.filter(([sub]) => sub.startsWith(`./${prefix}`) && sub !== './theme.css')
				.filter(([, target]) => target.includes(`/bases/${base}/`))
				.filter(([, target]) => !existsSync(join(PKG_ROOT, target)))
				.map(([sub]) => sub);
			expect(dangling, `${base} subpaths resolving to nothing`).toEqual([]);
		});
	}

	it('keeps the subpath families and the registry items in step', () => {
		// Radix is the default base, so its families are the ones the registry
		// currently emits; the other bases get their own registry namespaces.
		const registryItems = new Set(
			readdirSync(join(PKG_ROOT, 'registry'))
				.filter((f) => f.endsWith('.json') && f !== 'registry.json')
				.map((f) => f.replace(/\.json$/, '')),
		);
		const uncovered = baseFiles('radix')
			.map((f) => f.replace(/\.tsrx$/, ''))
			.filter((name) => !registryItems.has(name));
		expect(uncovered, 'radix families with no registry item').toEqual([]);
	});
});
