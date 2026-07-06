// The DETECTOR — a deterministic, extensible rule registry that classifies
// how far a piece of React *source* is from running on Octane.
//
// Design goals the user asked for:
//   • generic + extensible: behaviour lives in a flat `rules` array; adding a
//     capability = pushing one `{ id, detect, autofix? }` object.
//   • no AI: every decision is a pure function of the source text.
//   • single source of truth: API-level classification is imported straight
//     from the MCP's REACT_API_MAP (bridge.js) and the compiler's HOOK_NAMES,
//     so this can never drift from what the runtime actually supports.
//
// The most valuable output is NOT the fix — it's the localized diff of
// "React surface used" vs "Octane surface supported", per finding, with a
// severity that decides whether we autofix, flag for the MCP, or block.

import { REACT_API_MAP } from '../../octane-mcp-server/src/bridge.js';
import { HOOK_NAMES } from '../../octane/src/compiler/compile.js';

export { REACT_API_MAP, HOOK_NAMES };

// Severity ladder. `autofix` = a safe deterministic rewrite exists;
// `flag` = a real divergence with no safe rewrite → hand to the MCP;
// `block` = cannot run without a semantic port (class→hooks etc.).
export const SEVERITY = { ok: 0, autofix: 1, flag: 2, block: 3 };
export const VERDICT_BY_MAX = ['bridgeable', 'bridgeable-autofix', 'needs-review', 'needs-rework'];

function lineOf(source, index) {
	let line = 1;
	for (let i = 0; i < index && i < source.length; i++) if (source[i] === '\n') line++;
	return line;
}

// Blank out comments (so a word like "onChange" in prose isn't a finding) while
// PRESERVING byte offsets and newlines — line numbers stay exact and string
// literals survive intact so `from 'react'` is still detectable. A production
// detector would walk a real AST; this is the honest text-scan equivalent.
//
// State machine over four modes. `code` copies verbatim (and blanks comment
// bodies to spaces); the three string modes copy verbatim so specifiers live.
const STRING_OPEN = { "'": 'squote', '"': 'dquote', '`': 'template' };
const STRING_CLOSE = { squote: "'", dquote: '"', template: '`' };

function blankComments(source) {
	let out = '';
	let state = 'code';
	for (let i = 0; i < source.length; i++) {
		const c = source[i];
		const d = source[i + 1];
		const space = c === '\n' || c === '\t' ? c : ' ';

		if (state === 'line') {
			if (c === '\n') state = 'code';
			out += state === 'code' ? c : space;
		} else if (state === 'block') {
			if (c === '*' && d === '/') {
				out += '  ';
				i++;
				state = 'code';
			} else out += space;
		} else if (state !== 'code') {
			// inside a string/template literal
			out += c;
			if (c === '\\') out += source[++i] ?? '';
			else if (c === STRING_CLOSE[state]) state = 'code';
		} else if (c === '/' && d === '/') {
			out += '  ';
			i++;
			state = 'line';
		} else if (c === '/' && d === '*') {
			out += '  ';
			i++;
			state = 'block';
		} else {
			out += c;
			if (c in STRING_OPEN) state = STRING_OPEN[c];
		}
	}
	return out;
}

// Which named specifiers a file imports from a given module, with byte offset.
function namedImports(source, moduleName) {
	const found = [];
	const re = new RegExp(
		`import\\s+(type\\s+)?\\{([^}]*)\\}\\s*from\\s*['"]${moduleName.replace('/', '\\/')}['"]`,
		'g',
	);
	let m;
	while ((m = re.exec(source))) {
		const typeOnly = Boolean(m[1]);
		const names = m[2]
			.split(',')
			.map((s) =>
				s
					.trim()
					.split(/\s+as\s+/)[0]
					.trim(),
			)
			.filter(Boolean);
		found.push({ index: m.index, typeOnly, names });
	}
	return found;
}

// ── The rule registry ──────────────────────────────────────────────────────
export const rules = [
	{
		id: 'react-hook-import-collision',
		severity: SEVERITY.autofix,
		detect(source) {
			const out = [];
			for (const imp of namedImports(source, 'react')) {
				if (imp.typeOnly) continue;
				const builtins = imp.names.filter((n) => HOOK_NAMES.has(n));
				if (builtins.length) {
					out.push({
						line: lineOf(source, imp.index),
						snippet: builtins.join(', '),
						note: `builtin hooks imported from 'react' would collide with the compiler's injected 'octane' import — strip them (the compiler owns the binding).`,
					});
				}
			}
			return out;
		},
	},
	{
		id: 'react-import-rehome',
		severity: SEVERITY.autofix,
		detect(source) {
			// Non-builtin `react` value imports (memo, createContext, forwardRef,
			// Suspense, use, …) don't collide, but they must resolve to the compat
			// shim rather than real react — a mechanical re-home, not a no-op.
			const out = [];
			for (const imp of namedImports(source, 'react')) {
				if (imp.typeOnly) continue;
				const rehome = imp.names.filter((n) => !HOOK_NAMES.has(n));
				if (rehome.length) {
					out.push({
						line: lineOf(source, imp.index),
						snippet: rehome.join(', '),
						note: `re-home to the compat shim — Octane homes these on 'octane', not 'react'.`,
					});
				}
			}
			return out;
		},
	},
	{
		id: 'react-dom-rehome',
		severity: SEVERITY.autofix,
		detect(source) {
			const out = [];
			for (const mod of ['react-dom', 'react-dom/client']) {
				for (const imp of namedImports(source, mod)) {
					out.push({
						line: lineOf(source, imp.index),
						snippet: `${mod}: ${imp.names.join(', ')}`,
						note: `createPortal/flushSync/createRoot/hydrateRoot live on 'octane', not '${mod}' — re-home to the compat entry.`,
					});
				}
			}
			return out;
		},
	},
	{
		id: 'forwardRef',
		severity: SEVERITY.autofix,
		detect(source) {
			const out = [];
			const re = /\bforwardRef\s*(?:<[^>]*>)?\s*\(/g;
			let m;
			while ((m = re.exec(source))) {
				out.push({
					line: lineOf(source, m.index),
					snippet: 'forwardRef(...)',
					note: `no forwardRef — rewrite to React-19 refs-as-props (accept ref as a normal prop).`,
				});
			}
			return out;
		},
	},
	{
		id: 'controlled-input',
		severity: SEVERITY.flag,
		detect(source) {
			const out = [];
			// A form element carrying BOTH `value=` and `onChange=` is the controlled
			// pattern Octane does not model — no safe deterministic rewrite.
			const re = /<(input|textarea|select)\b([^>]*?)>/gs;
			let m;
			while ((m = re.exec(source))) {
				const attrs = m[2];
				if (/\bvalue\s*=/.test(attrs) && /\bonChange\s*=/.test(attrs)) {
					out.push({
						line: lineOf(source, m.index),
						snippet: `<${m[1]} value=… onChange=…>`,
						note: `controlled input: Octane inputs are native/uncontrolled with no value-reassertion and no synthetic per-keystroke onChange. Behavioural — route to the MCP/hand-port (use onInput + uncontrolled).`,
					});
				}
			}
			return out;
		},
	},
	{
		id: 'class-component',
		severity: SEVERITY.block,
		detect(source) {
			const out = [];
			const re = /\bclass\s+(\w+)[^{]*\bextends\s+(?:React\.)?(?:Pure)?Component\b/g;
			let m;
			while ((m = re.exec(source))) {
				out.push({
					line: lineOf(source, m.index),
					snippet: `class ${m[1]} extends Component`,
					note: `no class components — class→hooks is a semantic rewrite (lifecycle→effects, error boundary→@try/ErrorBoundary). Hand/MCP port.`,
				});
			}
			return out;
		},
	},
];

// API-surface classification driven straight off REACT_API_MAP (word-boundary
// scan, same as bridge.js). Produces the "used vs supported" diff with the
// map's own status → severity.
const STATUS_SEVERITY = {
	same: SEVERITY.ok,
	partial: SEVERITY.flag,
	rewrite: SEVERITY.autofix,
	unsupported: SEVERITY.block,
};

function apiSurface(source) {
	const rows = [];
	for (const [name, meta] of Object.entries(REACT_API_MAP)) {
		const count = (source.match(new RegExp(`\\b${name}\\b`, 'g')) ?? []).length;
		if (count)
			rows.push({
				name,
				count,
				status: meta.status,
				severity: STATUS_SEVERITY[meta.status],
				note: meta.note,
			});
	}
	return rows.sort((a, b) => b.severity - a.severity || b.count - a.count);
}

export function detect(source, filename = '<source>') {
	// Scan comment-blanked code so prose never triggers a finding. Byte offsets
	// are preserved, so every `line` below still points at the real source line.
	const code = blankComments(source);
	const findings = [];
	for (const rule of rules) {
		for (const hit of rule.detect(code)) {
			findings.push({ ruleId: rule.id, severity: rule.severity, ...hit });
		}
	}
	const surface = apiSurface(code);
	const maxSeverity = Math.max(
		0,
		...findings.map((f) => f.severity),
		...surface.map((r) => r.severity),
	);
	return {
		filename,
		verdict: VERDICT_BY_MAX[maxSeverity],
		maxSeverity,
		findings: findings.sort((a, b) => b.severity - a.severity || a.line - b.line),
		surface,
	};
}
