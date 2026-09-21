/**
 * Typed theme tokens — declare a token contract once in plain `.ts` and let
 * TypeScript check every consumer natively (the R3/R4 surface; the compile-path
 * half, R5, resolves `var(--*)` references inside scoped `<style>` blocks
 * against this same contract object through the host-facts seam).
 *
 * API-shape decision (recorded for U10/U8): `defineThemeTokens(tokens, options)`
 * takes a `defineVars`-shaped object literal and returns the same nested shape
 * with every leaf a `var(--name, fallback)` string, mirroring the in-repo
 * `CSSVarTheme<T>` precedent (`styled-components` `createTheme`). Leaf values
 * ARE `var(--*)` strings, so `style={{ color: tokens.colors.bg }}` and generated
 * CSS text consume them with no `<style>` grammar change, and static `<style>`
 * CSS spells the identical `var(--name)` reference the contract declares — the
 * shape holds whether the consumption verdict lands on `var(--*)`-typed
 * references or a new form. Criteria: StyleX familiarity, minimal diff from
 * today's `<style>` authoring (CSS stays static text), one contract object
 * shared by both gates.
 *
 * Reserved top-level keys: `raw`, `vars`, and `css` describe the contract
 * itself, so token groups cannot use those names.
 */

type TokenLeaf = string | number;

/** A declared token tree: nested groups whose leaves are strings or numbers. */
type TokenTree = {
	readonly [key: string]: TokenLeaf | TokenTree;
};

/** Emission-time view covering partial (variant) trees: absent keys are skipped. */
type AnyTokenTree = {
	readonly [key: string]: TokenLeaf | AnyTokenTree | undefined;
};

/** Literal leaf types widen to their primitive so `42` never satisfies a `string` token. */
type WidenLeaf<V> = V extends string ? string : V extends number ? number : never;

/** The declared tree with every leaf replaced by its `var(--name, fallback)` reference. */
type TokenRefs<T> = {
	[K in keyof T]: T[K] extends TokenLeaf ? string : TokenRefs<T[K]>;
};

/** The declared tree with every leaf replaced by its bare `--name` custom property. */
type TokenVars<T> = {
	[K in keyof T]: T[K] extends TokenLeaf ? `--${string}` : TokenVars<T[K]>;
};

/**
 * Variant overrides against a declared contract: every group optional, every
 * present key must be a declared token, and leaf values keep the declared
 * primitive type — a missing contract key is a type error (declare the contract
 * explicitly), a typo'd or wrong-typed key is a type error (R4).
 */
export type ThemeTokenValues<T> = {
	[K in keyof T]?: T[K] extends TokenLeaf ? WidenLeaf<T[K]> : ThemeTokenValues<T[K]>;
};

/** One named override set, emitted under its own selector and/or media query. */
export interface ThemeVariant<T> {
	/**
	 * Selector the override declarations emit under, e.g. `".dark"` or
	 * `'[data-theme="dark"]'`. Defaults to the base `selector` (":root").
	 */
	selector?: string;
	/**
	 * Media query wrapping the override, e.g. `"(prefers-color-scheme: dark)"`.
	 * The declarations land on `selector` (or the base selector) inside it.
	 */
	media?: string;
	/** Token overrides — every key must be a declared contract token. */
	values: ThemeTokenValues<T>;
}

export interface ThemeTokensOptions<T extends TokenTree> {
	/**
	 * Custom-property name prefix: `prefix: "app"` emits `--app-colors-bg`.
	 * Omit for unprefixed `--colors-bg`. Reach for one when multiple design
	 * systems share a page, since custom properties collide globally.
	 */
	prefix?: string;
	/** Selector the base declarations emit under. Defaults to `":root"`. */
	selector?: string;
	/**
	 * Named variant overrides, each checked against the declared contract and
	 * emitted in declaration order after the base block.
	 */
	variants?: { readonly [name: string]: ThemeVariant<T> };
}

/** The object `defineThemeTokens` returns: typed references plus emission artifacts. */
export type ThemeTokens<T extends TokenTree> = TokenRefs<T> & {
	/** The declared values exactly as authored. */
	readonly raw: T;
	/** Same shape as the contract, leaves are bare custom-property names. */
	readonly vars: TokenVars<T>;
	/** The full stylesheet: base selector block plus every variant block. */
	readonly css: string;
};

/** Map every leaf of a declared tree through `leafFn`, preserving the group shape. */
function mapLeaves(
	tree: TokenTree,
	path: readonly string[],
	leafFn: (path: readonly string[], value: TokenLeaf) => string,
): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const key of Object.keys(tree)) {
		const value = tree[key];
		const next = path.concat(key);
		out[key] =
			typeof value === 'object' && value !== null
				? mapLeaves(value, next, leafFn)
				: leafFn(next, value);
	}
	return out;
}

/** The custom-property name for a leaf path: `--` + optional `prefix-` + dashed path. */
function varName(path: readonly string[], prefix: string): string {
	return `--${prefix}${path.join('-')}`;
}

/** Serialize a (possibly partial) tree's leaves as `--name: value;` declarations. */
function emitDeclarations(
	tree: AnyTokenTree,
	path: readonly string[],
	prefix: string,
	indent: string,
): string {
	let css = '';
	for (const key of Object.keys(tree)) {
		const value = tree[key];
		const next = path.concat(key);
		css +=
			typeof value === 'object' && value !== null
				? emitDeclarations(value, next, prefix, indent)
				: value === undefined
					? ''
					: `${indent}${varName(next, prefix)}: ${value};\n`;
	}
	return css;
}

/** Emit `selector { decls }` at `indent`, or nothing when the tree carried no leaves. */
function emitBlock(selector: string, declarations: string, indent: string): string {
	return declarations === '' ? '' : `${indent}${selector} {\n${declarations}${indent}}\n`;
}

/**
 * Declare a theme-token contract: names and value types checked by TypeScript
 * natively — no compiler machinery. Returns the same shape with every leaf a
 * `var(--name, fallback)` reference, plus `vars` (bare `--name` strings),
 * `raw` (the declared values), and `css` (the emitted `:root` sheet, including
 * every `options.variants` override block).
 *
 * Pass an explicit contract type to make missing or misspelled tokens in the
 * values a type error (`defineThemeTokens<AppTokens>({...})`); variants are
 * always checked against the contract — extra or wrong-typed keys fail the
 * typecheck gate.
 *
 * @example
 * ```ts
 * const tokens = defineThemeTokens(
 *   { colors: { bg: '#fff', fg: '#111' } },
 *   { variants: { dark: { selector: '.dark', values: { colors: { bg: '#000', fg: '#eee' } } } } },
 * );
 * tokens.colors.bg      // "var(--colors-bg, #fff)"
 * tokens.vars.colors.bg // "--colors-bg"
 * tokens.css            // ":root { --colors-bg: #fff; … } .dark { --colors-bg: #000; … }"
 * ```
 */
export function defineThemeTokens<const T extends TokenTree>(
	// `raw`, `vars`, and `css` are reserved output fields — a group with one of
	// those names would be silently overwritten by the emission artifacts, so
	// the signature rejects it (`never` fails the property, not the whole call).
	tokens: T & { readonly raw?: never; readonly vars?: never; readonly css?: never },
	options?: ThemeTokensOptions<T>,
): ThemeTokens<T> {
	if (process.env.NODE_ENV !== 'production') {
		// The type gate above covers TypeScript callers; plain JS gets the same
		// boundary as a warning instead of a silently shadowed token group.
		for (const reserved of ['raw', 'vars', 'css'] as const) {
			if (Object.hasOwn(tokens, reserved)) {
				console.warn(
					`defineThemeTokens: "${reserved}" is a reserved output field — rename that token group; its value is unreachable on the returned object`,
				);
			}
		}
	}
	const prefix = options?.prefix === undefined ? '' : `${options.prefix}-`;
	const baseSelector = options?.selector ?? ':root';

	const refs = mapLeaves(tokens, [], (path, value) => {
		const name = varName(path, prefix);
		if (process.env.NODE_ENV !== 'production') {
			// A fallback containing unbalanced parentheses ends the var()
			// argument list early, silently dropping the rest of the declaration.
			const text = String(value);
			let depth = 0;
			for (let i = 0; i < text.length; i++) {
				if (text.charCodeAt(i) === 40) depth++;
				else if (text.charCodeAt(i) === 41) depth--;
				if (depth < 0) break;
			}
			if (depth !== 0) {
				console.warn(
					`defineThemeTokens: value "${text}" at "${path.join('.')}" contains unbalanced parentheses and may break the var() fallback`,
				);
			}
		}
		return `var(${name}, ${value})`;
	});
	const vars = mapLeaves(tokens, [], (path) => varName(path, prefix));

	let css = emitBlock(baseSelector, emitDeclarations(tokens, [], prefix, '\t'), '');
	const variants = options?.variants;
	if (variants !== undefined) {
		for (const name of Object.keys(variants)) {
			const variant = variants[name];
			if (variant.media !== undefined) {
				const declarations = emitDeclarations(variant.values, [], prefix, '\t\t');
				if (declarations === '') continue;
				css += `@media ${variant.media} {\n${emitBlock(variant.selector ?? baseSelector, declarations, '\t')}}\n`;
			} else {
				css += emitBlock(
					variant.selector ?? baseSelector,
					emitDeclarations(variant.values, [], prefix, '\t'),
					'',
				);
			}
		}
	}

	return Object.assign(refs, { raw: tokens, vars, css }) as ThemeTokens<T>;
}
