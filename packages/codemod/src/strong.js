import { applyFixes, pruneImports } from '@octanejs/cli/fix';

/**
 * @typedef {import('./compiler.js').Compiler} Compiler
 * @typedef {{ code: string, severity: string, message: string, line: number }} Finding
 *
 * @typedef {Object} StrongResult
 * @property {string} code the module after every fix the compiler allowed
 * @property {boolean} strong whether it kept `"use strong"`
 * @property {string[]} fixed the diagnostic codes a fix resolved
 * @property {Finding[]} blockers the Strong errors left, when it did not
 */

const DIRECTIVE = /^(\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*)"use strong";\n\n?/;
const MAX_ROUNDS = 6;

/**
 * Compile a module the codemod emitted in Strong mode and repair what the
 * compiler reports, until it compiles clean or nothing more can be fixed.
 *
 * The repairs are the compiler's own suggested edits, as `octane analyze --fix`
 * applies them, plus the rewrites that keep React's behavior exactly:
 *
 * - an explicit dependency list the compiler reports as equivalent to the one
 *   it infers is dropped;
 * - state initialized from a prop is captured lazily, `useState(() => prop)`,
 *   which is what `useState(prop)` meant in React.
 *
 * Strong errors that remain mean the module needs a person. With `force`
 * unset the module falls back to compatibility mode so the migrated app still
 * builds, and the errors are reported as the work left to make it Strong.
 *
 * @param {Compiler} compiler
 * @param {string} code
 * @param {string} filename
 * @param {{ force?: boolean }} [options]
 * @returns {StrongResult}
 */
export function strengthen(compiler, code, filename, { force = false } = {}) {
	/** @type {string[]} */
	const fixed = [];
	let diagnostics = [];
	for (let round = 0; round < MAX_ROUNDS; round++) {
		const result = compiler.collectDiagnostics(code, filename, { strong: true });
		if (result.error != null) {
			return fallback(code, [thrown(result.error)], fixed, force);
		}
		diagnostics = result.diagnostics;
		const fixes = diagnostics.flatMap((diagnostic) => fixesFor(code, diagnostic));
		if (fixes.length === 0) break;
		const { text, applied } = applyFixes(code, fixes);
		if (applied.length === 0) break;
		code = pruneImports(text);
		for (const fix of applied) fixed.push(fix.code);
	}
	const blockers = diagnostics
		.filter((diagnostic) => diagnostic.severity === 'error')
		.map((diagnostic) => finding(diagnostic));
	if (blockers.length === 0) return { code, strong: true, fixed, blockers };
	return fallback(code, blockers, fixed, force);
}

/**
 * @param {string} code
 * @param {Finding[]} blockers
 * @param {string[]} fixed
 * @param {boolean} force
 * @returns {StrongResult}
 */
function fallback(code, blockers, fixed, force) {
	if (force) return { code, strong: true, fixed, blockers };
	// The module builds in compatibility mode; what kept it there is work
	// left, not a failure.
	const kept = blockers.map((blocker) => ({ ...blocker, severity: 'warning' }));
	return { code: code.replace(DIRECTIVE, '$1'), strong: false, fixed, blockers: kept };
}

/**
 * @param {any} diagnostic
 * @returns {Finding}
 */
function finding(diagnostic) {
	return {
		code: diagnostic.code,
		severity: diagnostic.severity,
		message: String(diagnostic.message).replace(`[${diagnostic.code}] `, ''),
		line: diagnostic.start?.line ?? 1,
	};
}

/** @param {any} error */
function thrown(error) {
	return {
		code: error?.code ?? 'COMPILE_ERROR',
		severity: 'error',
		message: String(error?.message ?? error),
		line: error?.loc?.line ?? 1,
	};
}

/**
 * The edits that resolve one diagnostic, as `applyFixes` takes them.
 *
 * @param {string} code
 * @param {any} diagnostic
 * @returns {{ code: string, edits: { start: number, end: number, text: string }[] }[]}
 */
function fixesFor(code, diagnostic) {
	/** @type {{ code: string, edits: { start: number, end: number, text: string }[] }[]} */
	const fixes = [];
	for (const suggestion of diagnostic.suggestions ?? []) {
		if (Array.isArray(suggestion?.edits) && suggestion.edits.length > 0) {
			fixes.push({ code: diagnostic.code, edits: suggestion.edits });
			break;
		}
	}
	if (fixes.length > 0) return fixes;
	const start = diagnostic.start?.offset;
	const end = diagnostic.end?.offset;
	if (typeof start !== 'number' || typeof end !== 'number') return fixes;

	if (diagnostic.code === 'OCTANE_STRONG_EXPLICIT_DEPENDENCIES' && diagnostic.severity === 'hint') {
		// `useEffect(fn, [a])` -> `useEffect(fn)`: the compiler infers `[a]`.
		const comma = /,\s*$/.exec(code.slice(0, start));
		if (comma && code[start] === '[') {
			fixes.push({ code: diagnostic.code, edits: [{ start: comma.index, end, text: '' }] });
		}
	}
	if (diagnostic.code === 'OCTANE_STRONG_UNLINKED_PROP_STATE') {
		const before = /\S\s*$/.exec(code.slice(0, start))?.[0][0];
		const value = code.slice(start, end);
		if (before === '(') {
			// useState(prop): React captured the value once, as a lazy
			// initializer does.
			const body = /^[\w$.]+$/.test(value) ? value : `(${value})`;
			fixes.push({ code: diagnostic.code, edits: [{ start, end, text: `() => ${body}` }] });
		} else if (before === ',') {
			// useReducer(reducer, prop): an explicit initializer is the
			// deliberate capture.
			fixes.push({
				code: diagnostic.code,
				edits: [{ start: end, end, text: ', (initial) => initial' }],
			});
		}
	}
	return fixes;
}
