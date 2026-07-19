/**
 * Shared `@jsxImportSource` pragma detection.
 *
 * Two callers, two input shapes, one contract: TypeScript's per-file pragma
 * position and spelling.
 *
 *  - `bundler.js` decides mixed-toolchain module OWNERSHIP from raw source
 *    text via `findLeadingJsxImportSourcePragma` (host-owned files are never
 *    parsed, so a leading-trivia text scan is the right cost model).
 *  - `volar.js` decides whether an AUTHORED pragma already exists on parse
 *    artifacts (comment nodes) via `jsxImportSourcePragmaModule` on each
 *    comment's text.
 *
 * This module is deliberately dependency-free and neutral: the Volar entry is
 * isolated so runtime-build consumers never pull the language-service
 * surface, so shared pieces must not live in (or import) `volar.js`.
 */

const JSX_IMPORT_SOURCE_PRAGMA = /@jsxImportSource\s+([^\s*]+)/;

/**
 * Match one comment's text against TS's `@jsxImportSource` pragma and return
 * its module specifier, or `null`. Accepts the body of a line or block
 * comment; delimiters may be present or stripped, because `*` never starts a
 * module specifier, so a block-comment closer cannot bleed into the match.
 *
 * @param {string} text
 * @returns {string | null}
 */
export function jsxImportSourcePragmaModule(text) {
	const match = JSX_IMPORT_SOURCE_PRAGMA.exec(text);
	return match === null ? null : match[1];
}

/**
 * Read the module specifier of a LEADING `@jsxImportSource` pragma from raw
 * source text, or `null`.
 *
 * "Leading" matches where TypeScript reads pragmas from: comments (line or
 * block) in the trivia before the module's first token — a BOM and whitespace
 * may precede, but any code (including a directive-prologue string such as
 * `'use strict'`) ends the scan. TS honors the FIRST pragma, so the first
 * match wins.
 *
 * @param {string} code
 * @returns {string | null}
 */
export function findLeadingJsxImportSourcePragma(code) {
	const length = code.length;
	let i = code.charCodeAt(0) === 0xfeff ? 1 : 0;
	for (;;) {
		while (i < length && /\s/.test(code[i])) i++;
		if (code.startsWith('//', i)) {
			const newline = code.indexOf('\n', i);
			const end = newline === -1 ? length : newline;
			const pragmaModule = jsxImportSourcePragmaModule(code.slice(i + 2, end));
			if (pragmaModule !== null) return pragmaModule;
			if (newline === -1) return null;
			i = newline + 1;
			continue;
		}
		if (code.startsWith('/*', i)) {
			const close = code.indexOf('*/', i + 2);
			if (close === -1) return null;
			const pragmaModule = jsxImportSourcePragmaModule(code.slice(i + 2, close));
			if (pragmaModule !== null) return pragmaModule;
			i = close + 2;
			continue;
		}
		return null;
	}
}
