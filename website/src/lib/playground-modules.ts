// Turns the playground's virtual files into the module graph the sandbox
// executes: compiles each file (octane compiler for `.tsrx`/`.tsx`, sucrase's
// react-jsx transform for `.react.tsx` React-host files), rewrites import
// specifiers with es-module-lexer's exact offsets, and topo-sorts the sibling
// graph so modules arrive at the sandbox dependencies-first.
//
// Specifier policy (the parent-side half of the sandbox security boundary —
// see playground-sandbox.ts for the CSP that backs it):
//   ./File[.ext]        → sibling file, rewritten to a `__pg_module:<name>__`
//                         token the sandbox swaps for a blob URL
//   octane, octane/react, react family → left bare; the sandbox import map
//                         resolves them (octane → local runtime blobs)
//   other octane/*      → error (not available in the playground)
//   https://esm.sh/*    → allowed verbatim; any other URL → error
//   any other bare id   → https://esm.sh/<id>?external=octane — `external`
//                         makes esm.sh leave `import 'octane'` bare so the
//                         import map pins bindings to the runtime singleton
//
// Client-only: load via dynamic import from an effect (never during SSR).
import { compilePlayground, type CompileDiagnostic } from './playground.ts';
import { moduleToken } from './playground-sandbox.ts';

export interface PlaygroundFile {
	name: string;
	source: string;
}

export interface ModuleGraph {
	ok: true;
	entry: string;
	entryKind: 'octane' | 'react';
	/** Dependency order — every module precedes its importers. */
	modules: { name: string; code: string }[];
	warnings: { file: string; diagnostic: CompileDiagnostic }[];
	/** Per-file compiled output (pre-rewrite), for the "Compiled output" pane. */
	compiled: Map<string, string>;
}

export interface ModuleGraphFailure {
	ok: false;
	error: string;
}

/** Import specifiers the sandbox import map resolves — leave them bare. */
const IMPORT_MAP_SPECIFIERS = new Set([
	'octane',
	'octane/react',
	'react',
	'react/jsx-runtime',
	'react/jsx-dev-runtime',
	'react-dom',
	'react-dom/client',
]);

/** File-kind helpers — `.react.tsx` marks a React-host file (see D1/plan). */
export function isReactHostFile(name: string): boolean {
	return name.endsWith('.react.tsx');
}

const SIBLING_EXTENSIONS = ['', '.tsrx', '.tsx', '.react.tsx'];

// Compilation is re-run on every debounced keystroke; memoize per (name,
// source) so only the edited file recompiles.
const compileCache = new Map<string, { source: string; result: CachedCompile }>();
type CachedCompile =
	| { ok: true; code: string; warnings: CompileDiagnostic[] }
	| { ok: false; error: string };

async function compileFile(file: PlaygroundFile): Promise<CachedCompile> {
	const cached = compileCache.get(file.name);
	if (cached && cached.source === file.source) return cached.result;
	let result: CachedCompile;
	if (isReactHostFile(file.name)) {
		// React-host files bypass the octane compiler: sucrase strips types and
		// applies the automatic react-jsx transform (no type-checking — this is
		// a demo surface, not a toolchain).
		try {
			const { transform } = await import('sucrase');
			const out = transform(file.source, {
				transforms: ['typescript', 'jsx'],
				jsxRuntime: 'automatic',
				jsxImportSource: 'react',
				production: true,
			});
			result = { ok: true, code: out.code, warnings: [] };
		} catch (error) {
			result = {
				ok: false,
				error: `${file.name}: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	} else {
		result = compilePlayground(file.source, file.name);
	}
	compileCache.set(file.name, { source: file.source, result });
	return result;
}

/** Resolve `./Name[.ext]` against the file set, with extension inference. */
function resolveSibling(specifier: string, names: Set<string>): string | null {
	const base = specifier.slice(2);
	for (const ext of SIBLING_EXTENSIONS) {
		if (names.has(base + ext)) return base + ext;
	}
	return null;
}

/**
 * Compile every file and produce the rewritten, dependency-ordered module
 * graph for the sandbox. Never throws.
 */
export async function buildModuleGraph(
	files: PlaygroundFile[],
	entry: string,
): Promise<ModuleGraph | ModuleGraphFailure> {
	if (!files.some((f) => f.name === entry)) {
		return { ok: false, error: `Entry file "${entry}" does not exist.` };
	}
	const names = new Set(files.map((f) => f.name));
	if (names.size !== files.length) {
		return { ok: false, error: 'Playground file names must be unique.' };
	}

	const { init, parse } = await import('es-module-lexer');
	await init;

	const compiled = new Map<string, string>();
	const rewritten = new Map<string, string>();
	const siblingDeps = new Map<string, string[]>();
	const warnings: ModuleGraph['warnings'] = [];

	for (const file of files) {
		const out = await compileFile(file);
		if (!out.ok) return { ok: false, error: out.error };
		compiled.set(file.name, out.code);
		for (const diagnostic of out.warnings) warnings.push({ file: file.name, diagnostic });

		let imports;
		try {
			[imports] = parse(out.code, file.name);
		} catch (error) {
			return {
				ok: false,
				error: `${file.name}: could not parse compiled output for imports (${
					error instanceof Error ? error.message : String(error)
				})`,
			};
		}

		// Rewrite specifiers back-to-front so earlier offsets stay valid.
		let code = out.code;
		const deps: string[] = [];
		for (let i = imports.length - 1; i >= 0; i--) {
			const record = imports[i];
			// `n` is the decoded specifier for static and simple dynamic imports;
			// undefined for computed dynamic imports like import(someVar) — those
			// resolve at runtime where the sandbox CSP is the backstop.
			const specifier = record.n;
			if (specifier === undefined || record.s < 0) continue;
			// Static import spans exclude the quotes; dynamic import spans (d > -1)
			// include them — requote when splicing a dynamic specifier.
			const dynamic = record.d > -1;
			const replaceWith = (value: string) => {
				const spliced = dynamic ? JSON.stringify(value) : value;
				code = code.slice(0, record.s) + spliced + code.slice(record.e);
			};

			if (specifier.startsWith('./')) {
				const resolved = resolveSibling(specifier, names);
				if (!resolved) {
					return {
						ok: false,
						error: `${file.name}: "${specifier}" does not match any playground file.`,
					};
				}
				if (!deps.includes(resolved)) deps.push(resolved);
				replaceWith(moduleToken(resolved));
			} else if (specifier.startsWith('../') || specifier.startsWith('/')) {
				return {
					ok: false,
					error: `${file.name}: "${specifier}" — only sibling "./File" imports are supported.`,
				};
			} else if (IMPORT_MAP_SPECIFIERS.has(specifier)) {
				// Left bare — the sandbox import map owns these.
			} else if (specifier.startsWith('octane/')) {
				return {
					ok: false,
					error: `${file.name}: "${specifier}" is not available in the playground (only "octane" and "octane/react" are).`,
				};
			} else if (specifier.startsWith('https://esm.sh/')) {
				// Already an esm.sh URL — allowed verbatim.
			} else if (/^(https?:)?\/\//.test(specifier) || specifier.includes(':')) {
				return {
					ok: false,
					error: `${file.name}: "${specifier}" — only https://esm.sh/ URLs are supported for URL imports.`,
				};
			} else {
				replaceWith(`https://esm.sh/${specifier}?external=octane`);
			}
		}
		rewritten.set(file.name, code);
		siblingDeps.set(file.name, deps);
	}

	// Topo-sort the sibling graph (DFS from the entry; unreferenced files are
	// appended afterwards so their compile errors/warnings still surface).
	const order: string[] = [];
	const state = new Map<string, 'visiting' | 'done'>();
	let cycle: string[] | null = null;
	const visit = (name: string, chain: string[]) => {
		if (cycle || state.get(name) === 'done') return;
		if (state.get(name) === 'visiting') {
			cycle = [...chain.slice(chain.indexOf(name)), name];
			return;
		}
		state.set(name, 'visiting');
		for (const dep of siblingDeps.get(name) ?? []) visit(dep, [...chain, name]);
		state.set(name, 'done');
		order.push(name);
	};
	visit(entry, []);
	for (const file of files) visit(file.name, []);
	if (cycle) {
		return {
			ok: false,
			error: `Circular imports between playground files are not supported: ${(cycle as string[]).join(' → ')}.`,
		};
	}
	// DFS post-order IS dependencies-first — the only ordering the sandbox
	// needs (it looks the entry up by name, not position).
	const modules = order.map((name) => ({ name, code: rewritten.get(name)! }));

	return {
		ok: true,
		entry,
		entryKind: isReactHostFile(entry) ? 'react' : 'octane',
		modules,
		warnings,
		compiled,
	};
}
