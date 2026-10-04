/**
 * Apply the compiler's structured suggestions to a module's source.
 *
 * A suggestion's edits are one unit: the lazy-ref rewrite adds an import,
 * replaces the `useRef` call, and deletes the `if`, and applying only part of
 * that would leave the module broken. A suggestion is skipped whole when any
 * of its edits overlaps an edit already accepted; running `--fix` again picks
 * it up from the rewritten source. An edit identical to an accepted one, such
 * as two rewrites adding the same import, is applied once.
 *
 * @typedef {{ start: number, end: number, text: string }} Edit
 * @typedef {{ code: string, edits: Edit[] }} Fix
 */

/**
 * @param {Edit} a
 * @param {Edit} b
 */
function overlaps(a, b) {
	if (a.start === a.end && b.start === b.end) return a.start === b.start;
	return a.start < b.end && b.start < a.end;
}

/**
 * @param {string} source
 * @param {readonly Fix[]} fixes
 * @returns {{ text: string, applied: Fix[] }}
 */
export function applyFixes(source, fixes) {
	/** @type {Edit[]} */
	const accepted = [];
	/** @type {Fix[]} */
	const applied = [];
	for (const fix of fixes) {
		const fresh = fix.edits.filter(
			(edit) =>
				!accepted.some(
					(other) =>
						other.start === edit.start && other.end === edit.end && other.text === edit.text,
				),
		);
		if (fresh.some((edit) => accepted.some((other) => overlaps(edit, other)))) continue;
		accepted.push(...fresh);
		applied.push(fix);
	}
	let text = source;
	for (const edit of accepted.sort((a, b) => b.start - a.start)) {
		text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
	}
	return { text, applied };
}

/** The hooks a fix can replace, whose imports it may leave unused. */
const REPLACED_HOOKS = new Set(['useCallback', 'useMemo', 'useRef']);

const OCTANE_NAMED_IMPORT =
	/import\s*\{([^}]*)\}\s*from\s*(['"])octane\2([^\S\n]*;)?([^\S\n]*\n)?/g;

/**
 * Drop `useMemo`, `useCallback`, and `useRef` from the `octane` import when
 * the fixes removed their last use. A name that still appears anywhere else,
 * even in a comment, keeps its import: an unused import is harmless, a missing
 * one is not.
 *
 * @param {string} text
 * @param {readonly string[]} candidates hook names a fix replaced
 */
export function pruneImports(text, candidates) {
	const names = candidates.filter((name) => REPLACED_HOOKS.has(name));
	if (names.length === 0) return text;
	return text.replace(
		OCTANE_NAMED_IMPORT,
		(statement, /** @type {string} */ list, quote, semicolon = '', newline = '') => {
			const specifiers = list
				.split(',')
				.map((specifier) => specifier.trim())
				.filter(Boolean);
			const kept = specifiers.filter((specifier) => {
				if (!names.includes(specifier)) return true;
				const uses = text.match(new RegExp(`\\b${specifier}\\b`, 'g'))?.length ?? 0;
				return uses > 1;
			});
			if (kept.length === specifiers.length) return statement;
			if (kept.length === 0) return '';
			return `import { ${kept.join(', ')} } from ${quote}octane${quote}${semicolon}${newline}`;
		},
	);
}
