import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PKG_ROOT = join(__dirname, '..');
const REGISTRY = join(PKG_ROOT, 'registry');
const STYLES = join(REGISTRY, 'styles');

// Every registry item across every style tree. The registry serves one tree per primitive base,
// so a check that only walked the default style would leave two thirds of what ships unasserted.
function allItems(): Array<{
	name: string;
	files: Array<Record<string, unknown>>;
	[k: string]: any;
}> {
	const items = [];
	for (const style of readdirSync(STYLES).sort()) {
		for (const file of readdirSync(join(STYLES, style)).sort()) {
			if (!file.endsWith('.json')) continue;
			const parsed = JSON.parse(readFileSync(join(STYLES, style, file), 'utf8'));
			items.push({ ...parsed, name: `${style}/${parsed.name}` });
		}
	}
	return items;
}

describe('@octanejs/shadcn — registry emit', () => {
	it('is current with the sources (build --check)', () => {
		expect(() =>
			execFileSync(process.execPath, ['scripts/build-registry.mjs', '--check'], {
				cwd: PKG_ROOT,
				stdio: 'pipe',
			}),
		).not.toThrow();
	});

	it('claims a registry dependency only when the emitted source actually imports it', () => {
		// An unconditional dependency makes the CLI install files the component
		// never uses — for @octane/utils that also drags in clsx and
		// tailwind-merge, which a consumer of e.g. aspect-ratio does not need.
		const files = readdirSync(REGISTRY).filter(
			(file) => file.endsWith('.json') && file !== 'registry.json',
		);
		for (const file of files) {
			const item = JSON.parse(readFileSync(join(REGISTRY, file), 'utf8'));
			if (item.type !== 'registry:ui') continue;
			const content = item.files.map((entry: { content: string }) => entry.content).join('\n');
			const declared: string[] = item.registryDependencies ?? [];
			for (const [dep, specifier] of [
				['@octane/utils', "'@/lib/utils'"],
				['@octane/types', "'@/lib/types'"],
			] as const) {
				expect(
					declared.includes(dep),
					`${item.name} declares ${dep}=${declared.includes(dep)} but imports it=${content.includes(specifier)}`,
				).toBe(content.includes(specifier));
			}
		}
	});

	it('emits schema-shaped items whose registryDependencies resolve within the registry', () => {
		const files = readdirSync(REGISTRY).filter((file) => file.endsWith('.json'));
		const index = JSON.parse(readFileSync(join(REGISTRY, 'registry.json'), 'utf8'));
		expect(index.name).toBe('octane');
		const names = new Set(index.items.map((item: { name: string }) => item.name));
		expect(names.size).toBe(index.items.length);
		for (const file of files) {
			if (file === 'registry.json') continue;
			const item = JSON.parse(readFileSync(join(REGISTRY, file), 'utf8'));
			expect(item.$schema).toBe('https://ui.shadcn.com/schema/registry-item.json');
			expect(names.has(item.name)).toBe(true);
			expect(item.files.length).toBeGreaterThan(0);
			for (const entry of item.files) {
				expect(typeof entry.content).toBe('string');
				expect(entry.content.length).toBeGreaterThan(0);
				// Emitted sources use consumer-alias imports, never package-relative ones.
				expect(entry.content).not.toMatch(/from '\.\.?\/[^']*'/);
			}
			for (const dep of item.registryDependencies ?? []) {
				// Deps are namespace-qualified (@octane/x) so the CLI never falls
				// back to the default @shadcn registry; they must resolve locally.
				expect(dep.startsWith('@octane/'), `${item.name} → ${dep} not namespaced`).toBe(true);
				expect(names.has(dep.slice('@octane/'.length)), `${item.name} → ${dep} unresolved`).toBe(
					true,
				);
			}
		}
	});

	it('every @octanejs import in emitted content is a declared, pinned dependency', () => {
		// The guard that catches an item shipping code whose runtime the CLI
		// would never install (the sonner regression).
		//
		// Covers EVERY style tree, not just the default: each base imports a different primitive,
		// so a missing pin in one base is invisible from another. Dependencies are declared per
		// PACKAGE while components import by SUBPATH (`@octanejs/base-ui/accordion`,
		// `@octanejs/aria/components`), so the spec is reduced to its package root before lookup —
		// comparing the raw spec would report every deep import as unpinned.
		const packageRoot = (spec: string) => spec.split('/').slice(0, 2).join('/');

		for (const item of allItems()) {
			for (const entry of item.files) {
				for (const match of String(entry.content).matchAll(/from '(@octanejs\/[^']+)'/g)) {
					const pkg = packageRoot(match[1]);
					const dep = (item.dependencies ?? []).find((d: string) => d.startsWith(pkg + '@'));
					expect(dep, `${item.name} imports ${match[1]} without a pinned dependency`).toBeTruthy();
				}
			}
		}
	});

	it('pins cross-binding npm dependencies to exact versions', () => {
		// Siblings are declared `workspace:*`, a protocol the shadcn CLI cannot
		// install, so the emit must carry the sibling's concrete version. Read that
		// version rather than hard-coding it: a literal here goes stale on every
		// sibling release, which is the drift the emit exists to avoid.
		const versionOf = (name: string) =>
			JSON.parse(readFileSync(join(PKG_ROOT, '..', name, 'package.json'), 'utf8')).version;

		// Asserted per style, because the pin that matters differs by base — the point is that
		// whichever primitive a style is built on arrives with a concrete version.
		const styleItem = (style: string, name: string) =>
			JSON.parse(readFileSync(join(REGISTRY, 'styles', style, `${name}.json`), 'utf8'));

		expect(styleItem('radix-nova', 'button').dependencies).toContain(
			`@octanejs/radix@${versionOf('radix')}`,
		);
		expect(styleItem('base-nova', 'button').dependencies).toContain(
			`@octanejs/base-ui@${versionOf('base-ui')}`,
		);
		expect(styleItem('aria-nova', 'button').dependencies).toContain(
			`@octanejs/aria@${versionOf('aria')}`,
		);
		expect(styleItem('radix-nova', 'spinner').dependencies).toContain(
			`@octanejs/lucide@${versionOf('lucide')}`,
		);
	});

	it('never emits an uninstallable local protocol', () => {
		for (const file of readdirSync(REGISTRY).filter((name) => name.endsWith('.json'))) {
			const item = JSON.parse(readFileSync(join(REGISTRY, file), 'utf8'));
			for (const dependency of item.dependencies ?? []) {
				expect(dependency, `${file} emits ${dependency}`).not.toMatch(/@(?:workspace|catalog):/);
			}
		}
	});
});
