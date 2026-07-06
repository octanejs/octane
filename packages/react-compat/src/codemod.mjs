// The CODEMOD — deterministic, extensible source rewrites.
//
// Structure mirrors the detector: behaviour lives in a flat `transforms`
// array. Each transform is one small, single-purpose function that takes
// source and returns `{ source, changes }`. Adding a rewrite = pushing one
// object. `bridge()` folds them left-to-right and reports what ran.
//
// Why this is the *whole* codemod: the compat shim (src/shim.ts) absorbs every
// API-shimmable divergence at runtime — `forwardRef` becomes a refs-as-props
// wrapper, `useDebugValue` a no-op, `createPortal`/`flushSync` are re-homed —
// so bridging a well-behaved package reduces to reconciling its imports:
//   1. builtin hooks must be dropped from the `react` import (the compiler
//      re-injects them from 'octane'; leaving them causes a duplicate binding),
//   2. everything else React re-homes to the compat shim.
// Anything the shim CANNOT absorb (controlled inputs, class components) is not
// touched here — the detector flags it for the MCP/hand-port.
//
// POC NOTE: these transforms are conservative regex rewrites over import
// statements only (never function bodies), which is safe because imports have a
// fixed grammar. A production version would run over a ts-morph AST; the
// registry shape stays identical, only each `apply` swaps text-matching for
// node-matching.

import { HOOK_NAMES } from '../../octane/src/compiler/compile.js';

const COMPAT = '@octanejs/react-compat';
const COMPAT_DOM = '@octanejs/react-compat/dom';

// Shared helper: rewrite every `import { … } from '<module>'` in `source`.
// `mapper({ typeOnly, specs })` returns either:
//   • a string  → the replacement import statement, or
//   • ''        → drop the statement entirely, or
//   • null      → leave it untouched.
// Type-only imports are passed through verbatim (erased at compile; harmless).
function rewriteImportsFrom(source, moduleName, mapper) {
	const escaped = moduleName.replace(/[/\\]/g, '\\$&');
	const re = new RegExp(
		`import\\s+(type\\s+)?\\{([^}]*)\\}\\s*from\\s*['"]${escaped}['"]\\s*;?`,
		'g',
	);
	return source.replace(re, (full, typeKw, body) => {
		if (typeKw) return full; // leave `import type …` alone
		const specs = body
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
		const replacement = mapper({ specs });
		return replacement == null ? full : replacement;
	});
}

const emitImport = (specs, module) =>
	specs.length ? `import { ${specs.join(', ')} } from '${module}';` : '';

// ── The transform registry ─────────────────────────────────────────────────
export const transforms = [
	{
		id: 'reconcile-react-imports',
		description:
			'Drop builtin hooks from `react` imports (the compiler re-injects them); re-home the rest to the compat shim.',
		apply(source) {
			const changes = [];
			const out = rewriteImportsFrom(source, 'react', ({ specs }) => {
				const dropped = specs.filter((s) => HOOK_NAMES.has(baseName(s)));
				const kept = specs.filter((s) => !HOOK_NAMES.has(baseName(s)));
				if (dropped.length) changes.push(`stripped builtin hooks: ${dropped.join(', ')}`);
				if (kept.length) changes.push(`re-homed to ${COMPAT}: ${kept.join(', ')}`);
				return emitImport(kept, COMPAT);
			});
			return { source: out, changes };
		},
	},
	{
		id: 'reconcile-react-dom-imports',
		description: 'Re-home `react-dom` / `react-dom/client` imports to the compat dom shim.',
		apply(source) {
			const changes = [];
			let out = source;
			for (const mod of ['react-dom/client', 'react-dom']) {
				out = rewriteImportsFrom(out, mod, ({ specs }) => {
					changes.push(`re-homed ${mod} → ${COMPAT_DOM}: ${specs.join(', ')}`);
					return emitImport(specs, COMPAT_DOM);
				});
			}
			return { source: out, changes };
		},
	},
];

// `useX as alias` → `useX` for the HOOK_NAMES membership test.
function baseName(spec) {
	return spec.split(/\s+as\s+/)[0].trim();
}

// Fold every transform over the source, in order. Returns the bridged source
// plus a flat log of what each transform changed (empty log = already runnable).
export function bridge(source) {
	const log = [];
	let current = source;
	for (const t of transforms) {
		const { source: next, changes } = t.apply(current);
		current = next;
		for (const c of changes) log.push({ transform: t.id, change: c });
	}
	return { source: current, log };
}
