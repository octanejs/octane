import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';

// The `:global(…)` forms the Styling docs promise, pinned as compiled output
// on both the client and the server so a @tsrx/core bump cannot silently move
// them. `:global` unscopes only the wrapped part of a selector; the hash lands
// on the first scoped compound, and later scoped compounds get `:where(.hash)`,
// which is what makes a scoped rule outrank a bare global of the same shape.

const SOURCE = `
export const theme = <style>
	.note { color: red; }
</style>;

export function Card() @{
	<>
		<style>
			.card .title { color: black; }
			:global(.toast) { color: green; }
			.card :global(.note) { color: blue; }
			:global(.theme-dark) .card { color: white; }
			.card:global(.is-open) { color: pink; }
			.note { color: purple; }
			:global { .banner { color: teal; } body { margin: 0; } }
			.card { :global { .note { color: olive; } } }
			.card { :global(.note) { color: navy; } }
			.card { .title { color: gray; } }
		</style>
		<article class="card"><h2 class="title">{'t'}</h2></article>
		<p class="note">{'n'}</p>
		<div class={theme.$class}>{'x'}</div>
	</>
}
`;

const ID = 'style-global-forms.tsrx';
const COMPILE_OPTIONS = { hmr: false, dev: false };

function injections(mode: 'client' | 'server'): Map<string, string> {
	const { code } = compile(SOURCE, ID, { ...COMPILE_OPTIONS, mode });
	const sheets = new Map<string, string>();
	for (const match of code.matchAll(/injectStyle\("(tsrx-[a-z0-9]+)",\s*"((?:[^"\\]|\\.)*)"/g)) {
		sheets.set(match[1], match[2]);
	}
	return sheets;
}

describe(':global forms — compiled selector shapes', () => {
	it.for(['client', 'server'] as const)(
		'[%s] unscopes only the wrapped part and hashes the first scoped compound',
		(mode) => {
			const sheets = injections(mode);
			const [[themeHash, themeCss], [hash, css]] = [...sheets];
			expect(themeHash).not.toBe(hash);

			// A scoped descendant rule: the hash on the first compound, `:where` on
			// the rest, so the rule's specificity is (0,2,0), not (0,3,0).
			expect(css).toContain(`.card.${hash} .title:where(.${hash}) { color: black; }`);
			// Bare: a plain page-wide rule with no hash anywhere.
			expect(css).toContain('.toast { color: green; }');
			expect(css).not.toMatch(new RegExp(`\\.toast[^{]*${hash}`));
			// Prefixed: reaches below the scoped `.card` only.
			expect(css).toContain(`.card.${hash} .note { color: blue; }`);
			// Leading: the own element under an unscoped ancestor.
			expect(css).toContain(`.theme-dark .card.${hash} { color: white; }`);
			// Compound: the own element with an unscoped class on it.
			expect(css).toContain(`.card.${hash}.is-open { color: pink; }`);
			// The scoped `.note` (0,2,0) that beats a bare `:global(.note)` (0,1,0).
			// The sibling `<p class="note">` keeps the rule live; without a match it
			// would be removed as unused and the pin would prove nothing.
			expect(css).toContain(`.note.${hash} { color: purple; }`);
			expect(css).not.toContain('(unused)');
			// A theme rule carries its hash too, so it beats a bare global as well.
			expect(themeCss).toContain(`.note.${themeHash} { color: red; }`);

			// Block form: the wrapper is dropped (kept as a comment) and every rule
			// inside is page-wide, `body` included.
			expect(css).toContain('.banner { color: teal; } body { margin: 0; }');
			expect(css).not.toMatch(new RegExp(`(\\.banner|body)[^{]*${hash}`));
			// Nested under a scoped rule, the block reaches below `.card` only: the
			// same output as the prefixed selector form, prefix written once.
			expect(css).toMatch(
				new RegExp(`\\.card\\.${hash} \\{ (?:/\\*[^*]*\\*/ )?\\.note \\{ color: olive; \\}`),
			);
			expect(css).toContain(`.card.${hash} { .note { color: navy; } }`);
			expect(css).not.toContain(`.note.${hash} { color: olive; }`);
			expect(css).not.toContain(`.note.${hash} { color: navy; }`);
			// Plain nesting scopes both parts.
			expect(css).toContain(`.card.${hash} { .title.${hash} { color: gray; } }`);
		},
	);

	it.for(['client', 'server'] as const)(
		'[%s] rejects :global in the middle of a selector with CSS_GLOBAL_PLACEMENT',
		(mode) => {
			const source = `
export function Card() @{
	<>
		<style>.card :global(.x) .title { color: black; }</style>
		<article class="card"><h2 class="title">{'t'}</h2></article>
	</>
}
`;
			expect(() =>
				compile(source, 'style-global-middle.tsrx', { ...COMPILE_OPTIONS, mode }),
			).toThrow(expect.objectContaining({ code: 'tsrx-css-global-placement' }));
		},
	);
});
