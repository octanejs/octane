// Explains Strong-mode diagnostics from the generated catalog. Both MCP
// servers serve this text: the stdio server here, and the hosted one
// (website-mcp) through the `@octanejs/mcp-server/strong` export, so the two
// cannot drift. The catalog is a JSON copy of
// packages/octane/src/compiler/strong-diagnostics.js written by
// `pnpm strong:diagnostics`, because this package does not depend on the
// compiler at runtime. A JSON import keeps it bundleable: the hosted server
// has no package filesystem to read it from.
import catalog from './strong-diagnostics.json' with { type: 'json' };

export const STRONG_CATALOG = catalog;

// Registration text shared by both servers, so an agent sees the same trigger
// wherever it connects.
export const STRONG_EXPLAIN_TOOL = {
	name: 'octane_strong_explain',
	title: 'Explain a Strong mode diagnostic',
	description:
		'Use when a compile error or `octane analyze` finding has an OCTANE_STRONG_* code, or when migrating a module to Strong mode. Returns what the code detects, the Octane replacement, its docs URL, and before/after recipes for the React idiom it rejects. Pass `code` (full or short, for example RENDER_REF_READ), or `recipe`; pass neither for the index of codes and recipes.',
	codeDescription:
		'Diagnostic code, full (OCTANE_STRONG_RENDER_REF_READ) or without its prefix (RENDER_REF_READ), any case.',
	recipeDescription: `Migration recipe id: ${catalog.recipes.map((recipe) => recipe.id).join(', ')}.`,
};

const BY_CODE = new Map(catalog.diagnostics.map((entry) => [entry.code, entry]));
const BY_RECIPE = new Map(catalog.recipes.map((recipe) => [recipe.id, recipe]));
const SECTION_TITLES = new Map(catalog.sections.map((section) => [section.id, section.title]));

/** @param {string} id */
export function strongRecipeUrl(id) {
	return `${catalog.docsUrl}#recipe-${id}`;
}

/**
 * The docs URL for a catalogued code, or undefined for any other code.
 *
 * @param {string} code
 */
export function strongDiagnosticUrl(code) {
	return BY_CODE.get(code)?.url;
}

// Accepts the full code, the code without its `OCTANE_STRONG_` or `OCTANE_`
// prefix, any case, the bracketed form a compile error prints, kebab case, and
// a docs URL whose fragment is the code's anchor.
function normalizeCode(input) {
	return input
		.trim()
		.replace(/^.*#/, '')
		.toUpperCase()
		.replace(/[\s-]+/g, '_')
		.replace(/[^A-Z0-9_]/g, '');
}

/**
 * Resolve user input to a catalogued code.
 *
 * @param {string} input
 * @returns {string | null}
 */
export function resolveStrongCode(input) {
	const normalized = normalizeCode(input);
	if (normalized === '') return null;
	for (const candidate of [normalized, `OCTANE_STRONG_${normalized}`, `OCTANE_${normalized}`]) {
		if (BY_CODE.has(candidate)) return candidate;
	}
	return null;
}

function normalizeRecipe(input) {
	return input
		.trim()
		.replace(/^.*#/, '')
		.toLowerCase()
		.replace(/[\s_]+/g, '-')
		.replace(/^recipe-/, '');
}

const shortCode = (code) => code.replace(/^OCTANE_(?:STRONG_)?/, '');

function editDistance(a, b) {
	let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
	for (let i = 1; i <= a.length; i++) {
		const current = [i];
		for (let j = 1; j <= b.length; j++) {
			current[j] = Math.min(
				previous[j] + 1,
				current[j - 1] + 1,
				previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
			);
		}
		previous = current;
	}
	return previous[b.length];
}

/**
 * Catalogued codes that resemble unknown input: shared words first, then
 * spelling distance, so a typo or a partial name still finds its code.
 *
 * @param {string} input
 * @param {number} [limit]
 */
export function closeStrongCodes(input, limit = 5) {
	const wanted = shortCode(normalizeCode(input));
	if (wanted === '') return [];
	const words = new Set(wanted.split('_').filter(Boolean));
	return catalog.diagnostics
		.map((entry) => {
			const short = shortCode(entry.code);
			const shared = short.split('_').filter((word) => words.has(word)).length;
			const distance = editDistance(wanted, short);
			return { code: entry.code, shared, distance, length: short.length };
		})
		.filter(
			(match) => match.shared > 0 || match.distance <= Math.max(2, Math.floor(match.length / 3)),
		)
		.sort((a, b) => b.shared - a.shared || a.distance - b.distance)
		.slice(0, limit)
		.map((match) => match.code);
}

function formatRecipe(recipe, heading = '###') {
	return [
		`${heading} ${recipe.title} (\`${recipe.id}\`)`,
		'',
		`- React: \`${recipe.react}\``,
		`- Strong: \`${recipe.strong}\``,
		`- Reports: ${recipe.codes.map((code) => `\`${code}\``).join(', ')}`,
		`- Docs: ${strongRecipeUrl(recipe.id)}`,
		'',
		'Before:',
		'',
		'```tsx',
		recipe.before.trimEnd(),
		'```',
		'',
		'After:',
		'',
		'```tsx',
		recipe.after.trimEnd(),
		'```',
		'',
		recipe.note,
	].join('\n');
}

function formatDiagnostic(entry) {
	const lines = [
		`# ${entry.code}`,
		'',
		`- Severity: ${entry.severity}`,
		`- Section: ${SECTION_TITLES.get(entry.section) ?? entry.section}`,
		`- Docs: ${entry.url}`,
	];
	if (entry.primitives?.length) {
		lines.push(`- Primitives: ${entry.primitives.map((name) => `\`${name}\``).join(', ')}`);
	}
	lines.push(
		'',
		'## What it detects',
		'',
		entry.detects,
		'',
		'## Replacement',
		'',
		entry.replacement,
	);
	const recipes = catalog.recipes.filter((recipe) => recipe.codes.includes(entry.code));
	if (recipes.length > 0) {
		lines.push('', '## Recipes');
		for (const recipe of recipes) lines.push('', formatRecipe(recipe));
	}
	return lines.join('\n');
}

function formatIndex() {
	const lines = [
		'# Octane Strong mode diagnostics',
		'',
		'Strong mode is an opt-in compile-time contract: add `"use strong"` before a module\'s imports, or set `compiler: { strong: true }`. Pass `code` (for example `RENDER_REF_READ`) for what a diagnostic detects, its replacement, and its recipes, or `recipe` for one migration recipe. The `migrate-to-strong` skill has the full migration workflow.',
		'',
		`Docs: ${catalog.docsUrl}`,
	];
	for (const section of catalog.sections) {
		lines.push('', `## ${section.title}`, '');
		for (const entry of catalog.diagnostics) {
			if (entry.section !== section.id) continue;
			lines.push(`- \`${entry.code}\`${entry.severity === 'error' ? '' : ` (${entry.severity})`}`);
		}
	}
	lines.push('', '## Recipes', '');
	for (const recipe of catalog.recipes) {
		lines.push(`- \`${recipe.id}\` (${recipe.title}): \`${recipe.react}\` → \`${recipe.strong}\``);
	}
	return lines.join('\n');
}

function unknownCode(input) {
	const close = closeStrongCodes(input);
	const lines = [`Unknown Strong diagnostic code \`${input}\`.`];
	if (close.length > 0) {
		lines.push('', 'Did you mean:', '', ...close.map((code) => `- \`${code}\``));
	} else {
		lines.push(
			'',
			'Known codes:',
			'',
			...catalog.diagnostics.map((entry) => `- \`${entry.code}\``),
		);
	}
	lines.push(
		'',
		'Call octane_strong_explain with no arguments for the index of codes and recipes.',
	);
	return lines.join('\n');
}

function unknownRecipe(input) {
	return [
		`Unknown Strong recipe \`${input}\`. Recipes:`,
		'',
		...catalog.recipes.map((recipe) => `- \`${recipe.id}\`: ${recipe.title}`),
	].join('\n');
}

/**
 * Markdown for the octane_strong_explain tool. With a code, the catalog entry
 * and every recipe that names it; with a recipe, that recipe; with neither, the
 * index. `ok` is false for input that names nothing in the catalog.
 *
 * @param {{ code?: string, recipe?: string }} [input]
 * @returns {{ ok: boolean, text: string }}
 */
export function explainStrong({ code, recipe } = {}) {
	const hasCode = typeof code === 'string' && code.trim() !== '';
	const hasRecipe = typeof recipe === 'string' && recipe.trim() !== '';
	if (!hasCode && !hasRecipe) return { ok: true, text: formatIndex() };

	const sections = [];
	let entry;
	if (hasCode) {
		const resolved = resolveStrongCode(code);
		if (resolved === null) {
			// A recipe id passed as the code still answers the question asked.
			const asRecipe = BY_RECIPE.get(normalizeRecipe(code));
			if (asRecipe === undefined || hasRecipe) return { ok: false, text: unknownCode(code) };
			return { ok: true, text: formatRecipe(asRecipe, '#') };
		}
		entry = BY_CODE.get(resolved);
		sections.push(formatDiagnostic(entry));
	}
	if (hasRecipe) {
		const found = BY_RECIPE.get(normalizeRecipe(recipe));
		if (found === undefined) return { ok: false, text: unknownRecipe(recipe) };
		// The code's own section already lists every recipe that names it.
		if (!entry || !found.codes.includes(entry.code)) sections.push(formatRecipe(found, '#'));
	}
	return { ok: true, text: sections.join('\n\n---\n\n') };
}
