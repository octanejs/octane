import type { CompileDiagnostic } from 'octane/compiler';
import type { Compiler, Finding, StrongResult } from './types.js';
import { applyFixes, pruneImports } from '@octanejs/cli/fix';
import { parseSync, type Argument, type CallExpression } from '@tsrx/oxc/parser';
import { finding, thrown } from './compiler.js';

/**
 * The source without the directive the codemod added: its own line after any
 * leading comments and `"use client"`, or, at the very top, that line and the
 * blank line after it. `line` is where it stood and `lines` how many went.
 */
function withoutDirective(code: string) {
	const top = '"use strong";\n\n';
	if (code.startsWith(top)) return { code: code.slice(top.length), line: 1, lines: 2 };
	const match = /^"use strong";\n/m.exec(code);
	if (!match) return { code, line: 0, lines: 0 };
	return {
		code: code.slice(0, match.index) + code.slice(match.index + match[0].length),
		line: code.slice(0, match.index).split('\n').length,
		lines: 1,
	};
}
const MAX_ROUNDS = 6;
const UNLINKED_PROP_STATE = 'OCTANE_STRONG_UNLINKED_PROP_STATE';

/**
 * Compile a module the codemod emitted in Strong mode and repair what the
 * compiler reports, until it compiles clean or nothing more can be fixed.
 *
 * The repairs are the compiler's own suggested edits, as `octane analyze --fix`
 * applies them, plus the rewrites that keep React's behavior exactly:
 *
 * - an explicit dependency list the compiler reports as equivalent to the one
 *   it infers is dropped;
 * - state initialized from a prop is captured once, with the argument
 *   evaluated on every render and a callable initializer run at mount.
 *
 * Strong errors that remain mean the module needs a person. With `force`
 * unset the module falls back to compatibility mode so the migrated app still
 * builds, and the errors are reported as the work left to make it Strong.
 */
export function strengthen(
	compiler: Compiler,
	code: string,
	filename: string,
	{
		force = false,
		withEffectReceivers,
		withEffectProperties,
		withEffectSnapshots,
		withLinkedState,
	}: {
		force?: boolean;
		withEffectReceivers?: () => string;
		withEffectProperties?: () => string;
		withEffectSnapshots?: () => string;
		withLinkedState?: () => string;
	} = {},
): StrongResult {
	const original = code;
	const fixed: string[] = [];
	let diagnostics: CompileDiagnostic[] = [];
	for (let round = 0; round <= MAX_ROUNDS; round++) {
		const result = compiler.collectDiagnostics(code, filename, { strong: true });
		if (result.error != null) {
			// A module that compatibility mode cannot compile either has no
			// Strong blocker to report; the compile failure is its own error.
			const compat = compiler.collectDiagnostics(withoutDirective(code).code, filename, {});
			return fallback(code, compat.error == null ? [thrown(result.error)] : [], fixed, force);
		}
		diagnostics = result.diagnostics;
		// The last pass checks the final edit without attempting another repair.
		if (round === MAX_ROUNDS) break;
		const stateArguments = propStateArguments(code, filename, diagnostics);
		const fixes = diagnostics.flatMap((diagnostic) => fixesFor(code, diagnostic, stateArguments));
		if (fixes.length === 0) break;
		const { text, applied } = applyFixes(code, fixes);
		if (applied.length === 0) break;
		code = pruneImports(text);
		for (const fix of applied) fixed.push(fix.code);
	}
	const blockers = diagnostics.filter((diagnostic) => diagnostic.severity === 'error').map(finding);
	if (blockers.length === 0) return { code, strong: true, fixed, blockers };
	const retries = blockers.every((b) => b.code === 'OCTANE_STRONG_EXPLICIT_DEPENDENCIES')
		? [withEffectReceivers, withEffectProperties]
		: withEffectSnapshots &&
			  blockers.every(
					(b) =>
						b.code === 'OCTANE_STRONG_EXPLICIT_DEPENDENCIES' ||
						b.code === 'OCTANE_STRONG_READ_ONLY_STATE',
			  )
			? [withEffectSnapshots]
			: withLinkedState && blockers.every((b) => b.code === 'OCTANE_STRONG_RENDER_STATE_UPDATE')
				? [withLinkedState]
				: null;
	if (retries) {
		let previous = original;
		for (const retry of retries) {
			const candidate = retry?.();
			if (!candidate || candidate === previous || candidate === original) continue;
			const checked = strengthen(compiler, candidate, filename);
			if (checked.strong) return checked;
			previous = candidate;
		}
	}
	return fallback(code, blockers, fixed, force);
}

function fallback(
	code: string,
	blockers: Finding[],
	fixed: string[],
	force: boolean,
): StrongResult {
	if (force) return { code, strong: true, fixed, blockers };
	// The module builds in compatibility mode; what kept it there is work
	// left, not a failure. Its lines are the written file's, without the
	// directive.
	const compat = withoutDirective(code);
	const kept = blockers.map((blocker) => ({
		...blocker,
		severity: 'warning',
		line: blocker.line > compat.line ? blocker.line - compat.lines : blocker.line,
	}));
	return { code: compat.code, strong: false, fixed, blockers: kept };
}

/** The edits that resolve one diagnostic, as `applyFixes` takes them. */
function fixesFor(
	code: string,
	diagnostic: CompileDiagnostic,
	stateArguments: ReturnType<typeof propStateArguments>,
): { code: string; edits: { start: number; end: number; text: string }[] }[] {
	const fixes: { code: string; edits: { start: number; end: number; text: string }[] }[] = [];
	for (const suggestion of diagnostic.suggestions ?? []) {
		if ('edits' in suggestion && suggestion.edits?.length) {
			fixes.push({ code: diagnostic.code, edits: [...suggestion.edits] });
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
	if (diagnostic.code === UNLINKED_PROP_STATE) {
		const match = stateArguments?.get(`${start}:${end}`);
		if (!match) return fixes;
		const { start: from, end: to } = match.argument;
		if (match.reducer) {
			fixes.push({
				code: diagnostic.code,
				edits: [{ start: to, end: to, text: ', (initial) => initial' }],
			});
		} else {
			// Preserve eager evaluation and keep the original type for hook overload inference.
			const capture =
				"(<Input,>(initial: Input): Input => typeof initial === 'function' ? initial : (() => initial) as Input)";
			const text = `${capture}(${code.slice(from, to)})`;
			fixes.push({ code: diagnostic.code, edits: [{ start: from, end: to, text }] });
		}
	}
	return fixes;
}

function propStateArguments(code: string, filename: string, diagnostics: CompileDiagnostic[]) {
	const diagnosticsForState = diagnostics.filter(
		(diagnostic) => diagnostic.code === UNLINKED_PROP_STATE,
	);
	if (diagnosticsForState.length === 0) return;
	const ranges = new Set(
		diagnosticsForState.map(({ start, end }) => `${start?.offset}:${end?.offset}`),
	);
	const { program, errors } = parseSync(filename, code, { preserveParens: true });
	if (errors.length > 0) return;
	const matches = new Map<string, { argument: Argument; reducer: boolean }>();
	function visit(node: unknown): void {
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (!node || typeof node !== 'object' || !('type' in node)) return;
		if (node.type === 'CallExpression') {
			const { arguments: args } = node as CallExpression;
			const argument = args.at(-1);
			if (argument && args.length <= 2 && args.every(({ type }) => type !== 'SpreadElement')) {
				// The diagnostic points to the expression inside any wrappers.
				const { start, end } = unwrapArgument(argument);
				const range = `${start}:${end}`;
				if (ranges.has(range)) matches.set(range, { argument, reducer: args.length === 2 });
			}
		}
		for (const child of Object.values(node)) visit(child);
	}
	visit(program);
	return matches;
}

function unwrapArgument(argument: Argument): Argument {
	switch (argument.type) {
		case 'ChainExpression':
		case 'ParenthesizedExpression':
		case 'TSAsExpression':
		case 'TSInstantiationExpression':
		case 'TSNonNullExpression':
		case 'TSSatisfiesExpression':
		case 'TSTypeAssertion':
			return unwrapArgument(argument.expression);
		default:
			return argument;
	}
}
