import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// The multi-base registry contract, asserted on the emitted artifacts.
//
// The registry follows shadcn's own mechanism rather than inventing a namespace: base and visual
// style compose into components.json's single `style` field, which the CLI substitutes into the
// registry URL. `{style}` and `{name}` are the only placeholders shadcn@4.14.1 substitutes, and
// it never parses the style string — so `base-nova` resolving to the Base UI sources is entirely
// this registry's responsibility, and nothing in the CLI would catch getting it wrong.
//
// What that means for these tests: they check the properties a CONSUMER depends on — that a style
// serves its own base's primitive, that every cross-reference resolves inside the same style tree,
// and that the shared items exist under all of them. They do not re-assert file counts, which
// change every time a family lands.
const PKG_ROOT = join(__dirname, '..');
const REGISTRY = join(PKG_ROOT, 'registry');
const STYLES = join(REGISTRY, 'styles');

const DEFAULT_STYLE = 'base-nova';

// style -> the primitive package its components must import.
const EXPECTED_PRIMITIVE: Record<string, string> = {
	'base-nova': '@octanejs/base-ui',
	'radix-nova': '@octanejs/radix',
	'aria-nova': '@octanejs/aria',
};

// Base-agnostic items. Every style tree needs its own copy: `registryDependencies` resolve
// through the SAME templated URL, so `@octane/utils` requested under `aria-nova` is fetched from
// `styles/aria-nova/utils.json` and would 404 if only the default style carried it.
const SHARED = ['utils', 'types', 'theme', 'use-mobile'];

const styles = () => readdirSync(STYLES).sort();
const itemNames = (style: string) =>
	readdirSync(join(STYLES, style))
		.filter((f) => f.endsWith('.json'))
		.map((f) => f.slice(0, -5));
const item = (style: string, name: string) =>
	JSON.parse(readFileSync(join(STYLES, style, `${name}.json`), 'utf8'));

describe('@octanejs/shadcn — multi-base registry', () => {
	it('ships a tree for every base', () => {
		expect(styles()).toEqual(['aria-nova', 'base-nova', 'radix-nova']);
	});

	it('serves the default style at the un-styled path, so a URL without {style} resolves', () => {
		// A consumer whose registry URL omits the {style} segment still has to get something
		// coherent rather than a 404.
		for (const name of itemNames(DEFAULT_STYLE)) {
			const root = join(REGISTRY, `${name}.json`);
			expect(existsSync(root), `registry/${name}.json is missing`).toBe(true);
			expect(readFileSync(root, 'utf8')).toBe(
				readFileSync(join(STYLES, DEFAULT_STYLE, `${name}.json`), 'utf8'),
			);
		}
	});

	for (const style of Object.keys(EXPECTED_PRIMITIVE)) {
		it(`${style} components import only their own base's primitive`, () => {
			const expected = EXPECTED_PRIMITIVE[style];
			const foreign = Object.values(EXPECTED_PRIMITIVE).filter((p) => p !== expected);

			let checked = 0;
			for (const name of itemNames(style)) {
				const parsed = item(style, name);
				for (const file of parsed.files ?? []) {
					const content: string = file.content ?? '';
					for (const other of foreign) {
						expect(
							content.includes(`from '${other}`),
							`${style}/${name} imports ${other}, which belongs to another base`,
						).toBe(false);
					}
					if (content.includes(`from '${expected}`)) checked += 1;
				}
			}
			// Guards the assertion above from being vacuous: if nothing imported the primitive at
			// all, the "no foreign import" check would pass on an empty tree.
			expect(checked, `${style} has no component importing ${expected}`).toBeGreaterThan(0);
		});

		it(`${style} carries the base-agnostic items`, () => {
			for (const name of SHARED) {
				expect(existsSync(join(STYLES, style, `${name}.json`)), `${style}/${name}`).toBe(true);
			}
		});

		it(`${style} resolves every registryDependency within its own tree`, () => {
			const names = new Set(itemNames(style));
			for (const name of itemNames(style)) {
				for (const dep of item(style, name).registryDependencies ?? []) {
					// Namespaced deps are re-fetched through the same templated URL, so they must
					// exist under THIS style.
					expect(dep.startsWith('@octane/'), `${style}/${name} -> ${dep}`).toBe(true);
					expect(
						names.has(dep.slice('@octane/'.length)),
						`${style}/${name} depends on ${dep}, absent from styles/${style}/`,
					).toBe(true);
				}
			}
		});

		it(`${style} pins its @octanejs dependencies to a version`, () => {
			// An unpinned sibling would install whatever is latest at that moment, which is not
			// what this registry was tested against.
			for (const name of itemNames(style)) {
				for (const dep of item(style, name).dependencies ?? []) {
					if (!dep.startsWith('@octanejs/')) continue;
					expect(dep, `${style}/${name} dependency "${dep}" is unpinned`).toMatch(/@\d+\.\d+\.\d+/);
				}
			}
		});
	}

	it('emits the consumer alias shape, never the package-internal relative layout', () => {
		// The CLI rewrites nothing on install beyond its own alias config, so a leaked `../../lib`
		// would land in the consumer's project and fail to resolve.
		for (const style of styles()) {
			for (const name of itemNames(style)) {
				for (const file of item(style, name).files ?? []) {
					const content: string = file.content ?? '';
					expect(
						/from '(?:\.\.\/)+(?:lib|hooks)\//.test(content),
						`${style}/${name} leaks a relative package path`,
					).toBe(false);
				}
			}
		}
	});
});
