/**
 * Volar (IDE language-service) mappings for octane .tsrx files.
 *
 * Editors load this entry point to get a TYPED virtual TSX file the
 * TypeScript language service can analyse — hover, autocomplete, go-to-def,
 * diagnostics — without ever running our template-clone codegen. The TSX
 * output is intentionally NOT the same shape as the runtime emit produced
 * by `compile()`: it's a parallel pipeline that runs `@tsrx/core`'s shared
 * `createJsxTransform` (the same machinery that powers tsrx-react / tsrx-
 * preact's Volar paths) in `typeOnly: true` mode.
 *
 * Caller contract:
 *   - Input: the original .tsrx source string + filename.
 *   - Output: a `VolarMappingsResult` (see @tsrx/core/types) containing
 *     `code` (generated TSX), `mappings` (per-token offsets the language
 *     server uses to translate position queries from .tsrx → virtual TSX
 *     and back), `cssMappings`, `errors`, and the source AST.
 *
 * Why a separate file: `compile.js` is the runtime-codegen path and ships
 * to every consumer (Vite plugin, build pipeline). The Volar path pulls in
 * extra @tsrx/core surface (`createJsxTransform`, `createVolarMappingsResult`,
 * `dedupeMappings`) that build-time consumers don't need; isolating it
 * keeps the runtime build small.
 */

import {
	analyzeTsrx,
	createJsxTransform,
	createVolarMappingsResult,
	dedupeMappings,
	error as collectCompileError,
	parseModule,
} from '@tsrx/core';
import { buildFatSegments, decodeSourceMappings } from './fat-segments.js';
import { analyzeNativeChangeDiagnostics } from './native-change-diagnostics.js';
import { analyzeStrongMode } from './strong-mode.js';
import { analyzeNativeReadDiagnostics } from './native-read-diagnostics.js';
import { jsxImportSourcePragmaModule } from './pragma.js';
import {
	DOM_RENDERER_MODULE,
	normalizeRendererConfig,
	resolveRendererForFile,
} from './renderers.js';

/**
 * Platform descriptor for `createJsxTransform`. Mirrors `tsrx-react`'s React
 * descriptor with the small set of differences for octane:
 *
 *   - `imports.errorBoundary` / `imports.dynamic` point at octane
 *     itself (we don't ship separate sub-packages for these — the runtime
 *     exports them directly).
 *   - `jsx.classAttrName: 'class'` because octane keeps authored
 *     `class` instead of rewriting to React's `className`.
 *   - `jsx.multiRefStrategy: 'array'` — the octane runtime accepts a
 *     plain array of refs natively (see the multi-ref attribute path in
 *     `src/runtime.ts`'s ref binding), so no `mergeRefs` helper is needed.
 *   - `validation.requireUseServerForAwait: false` — no server-component
 *     concept in octane (no top-level await validation gates).
 *   - `serverModule` — octane's `module server { … }` dialect plus its
 *     boundary `import { fn } from 'server'` (docs/ssr.md). The shared
 *     type-only transform lowers it to plain checkable TS (hoisted block
 *     imports + a namespace-valued binding); verbatim it can never
 *     typecheck (TS1147 in-block import, TS2307 boundary import). The
 *     runtime compiler (`compile.js`) owns the dialect's real semantics
 *     (isolation validation, SSR namespace, RPC stubs) and is unaffected.
 *
 * `imports.suspense` and `imports.fragment` aren't real components in
 * octane (we lower `@try`/`@pending` to `tryBlock` and fragments to
 * concrete templates), but the descriptor still needs a value because the
 * shared transform emits TSX-level `<Fragment>` / `<Suspense>` wrappers
 * when running in TSX mode. We point them at `octane` so editors at
 * least don't fail to resolve the imports; users won't actually see those
 * names in source. (Volar TSX is virtual — its imports never run.)
 */
const OCTANE_PLATFORM = {
	name: 'octane',
	imports: {
		fragment: 'octane',
		suspense: 'octane',
		dynamic: 'octane',
		errorBoundary: 'octane',
		forOfIterableHelper: 'octane/tsrx-iterable',
		// Host-element spreads in the virtual TSX lower to
		// `__normalize_spread_props(...)`; the shared transform imports the
		// helpers from this module (preserving prop types — see octane/tsrx-spread).
		refProp: 'octane/tsrx-spread',
	},
	jsx: {
		rewriteClassAttr: false,
		classAttrName: 'class',
		multiRefStrategy: 'array',
	},
	validation: {
		requireUseServerForAwait: false,
	},
	serverModule: {
		blockName: 'server',
		importSpecifier: 'server',
	},
};

const octaneTransform = createJsxTransform(OCTANE_PLATFORM);
const octaneTransformWithAuthoredSuspense = createJsxTransform({
	...OCTANE_PLATFORM,
	hooks: {
		createPendingBoundary(_content, _fallback, context) {
			// Reuse the authored value binding without replacing its mapped import.
			// Returning null keeps the shared boundary lowering; only its redundant
			// helper import is suppressed. Other directive imports remain unchanged.
			context.needs_suspense = false;
			return null;
		},
	},
});

/** @param {import('@tsrx/core/types').AST.Program} ast */
function selectOctaneTransform(ast) {
	const hasSuspenseImport = ast.body.some(
		(statement) =>
			statement.type === 'ImportDeclaration' &&
			statement.importKind !== 'type' &&
			statement.source.value === OCTANE_PLATFORM.imports.suspense &&
			statement.specifiers.some(
				(specifier) =>
					specifier.type === 'ImportSpecifier' &&
					specifier.importKind !== 'type' &&
					specifier.local.name === 'Suspense' &&
					(specifier.imported.name ?? specifier.imported.value) === 'Suspense',
			),
	);
	return hasSuspenseImport ? octaneTransformWithAuthoredSuspense : octaneTransform;
}

/**
 * Does the parsed file carry an authored `@jsxImportSource` pragma in its
 * LEADING comments (the position TS reads pragmas from)? Decided on the parse
 * artifacts — the collected comment nodes and the first statement's offset —
 * not by re-scanning text. `@tsrx/core` ≥0.1.43 re-emits preserved leading
 * comments into the virtual TSX, so when this is true the authored pragma is
 * already in the generated code and no renderer-config prelude may be added:
 * TS honors the FIRST pragma, so a prelude would shadow the authored one.
 */
function hasAuthoredLeadingPragma(ast, comments) {
	const firstStatementStart = ast.body?.[0]?.start;
	return comments.some(
		(comment) =>
			(firstStatementStart == null || comment.end <= firstStatementStart) &&
			jsxImportSourcePragmaModule(comment.value) !== null,
	);
}

function createRendererTypePragma(renderer, ast) {
	// A `.tsrx` file's JSX is octane's dialect BY DEFINITION, so the built-in
	// DOM renderer pins the virtual TSX to octane's jsx-runtime types even when
	// the registry entry declares no `intrinsics`. Without the pragma the host
	// tsconfig's `jsxImportSource` leaks in — in an octane project that is
	// already `octane` (no observable change), but in a mixed-host program (a
	// React shell hosting islands through `octane/react`, tsrx-tsc over a
	// `react-jsx` tsconfig) every island would be typed against REACT's JSX and
	// reject octane's real contract (`class`, native event payloads, …).
	// An authored leading pragma still wins (checked by the caller).
	const intrinsics =
		renderer.intrinsics ??
		(renderer.module === DOM_RENDERER_MODULE && renderer.target === 'dom'
			? DOM_RENDERER_MODULE
			: undefined);
	if (intrinsics === undefined) return null;
	const start = ast.loc?.start ?? { line: 1, column: 0 };
	return {
		type: 'Block',
		// @tsrx/core's semantic-comment formatter turns this into the canonical
		// `/** @jsxImportSource … */` spelling during the one type-only print.
		value: `*@jsxImportSource ${intrinsics}`,
		start: ast.start ?? 0,
		end: ast.start ?? 0,
		loc: { start: { ...start }, end: { ...start } },
		context: null,
	};
}

/**
 * Published consumer contract of this entry point: functions whose body is a
 * native `@{ … }` template are identifiable on `sourceAst` via
 * `metadata.native_tsrx_body === true`, with the body node's `start`/`end`
 * spanning `@{` through `}`. TanStack's octane route-generator plugin
 * (`@octanejs/tanstack-router/generator-plugin`) masks route files by that
 * marker before babel-based route transforms parse them. `@tsrx/core` used to
 * stamp it during parsing and now marks only the transformed clone (reachable
 * solely through `metadata.path` back-references), so re-stamp the parse tree
 * here: a `JSXCodeBlock` body IS a native template body.
 *
 * @param {unknown} root
 */
function markNativeTemplateBodies(root) {
	const seen = new WeakSet();
	/** @param {unknown} value */
	const visit = (value) => {
		if (!value || typeof value !== 'object' || seen.has(value)) return;
		seen.add(value);
		if (Array.isArray(value)) {
			for (const item of value) visit(item);
			return;
		}
		const node = /** @type {Record<string, any>} */ (value);
		if (node.body && !Array.isArray(node.body) && node.body.type === 'JSXCodeBlock') {
			(node.metadata ??= {}).native_tsrx_body = true;
		}
		for (const key in node) {
			if (key !== 'metadata' && key !== 'loc') visit(node[key]);
		}
	};
	visit(root);
}

/**
 * Compile a .tsrx source string to a Volar `VolarMappingsResult`.
 *
 * Parse → JSX transform (typeOnly) → wrap as Volar payload. We always run
 * with `collect: true` so the parser records errors instead of throwing
 * mid-pipeline; that way a syntactically-broken file still produces a
 * partial virtual TSX the language server can show diagnostics against.
 *
 * @param {string} source
 * @param {string} [filename]
 * Renderer selection deliberately uses the same canonical filename resolver as
 * build-time compilation. A renderer may expose a JSX import-source module via
 * `intrinsics`; when present, the virtual TSX gets a file-local pragma so host
 * element types cannot leak into files owned by another renderer.
 *
 * @param {{ loose?: boolean, renderers?: unknown, strong?: boolean, nativeReads?: boolean }} [options]
 * @returns {import('./index.js').VolarCompileResult}
 */
export function compileToVolarMappings(source, filename, options) {
	/** @type {import('@tsrx/core/types').CompileError[]} */
	const errors = [];
	/** @type {import('@tsrx/core/types').AST.CommentWithLocation[]} */
	const comments = [];
	const ast = parseModule(source, filename, {
		collect: true,
		loose: !!options?.loose,
		preserveParens: true,
		keywordTokens: true,
		errors,
		comments,
	});
	analyzeTsrx(ast, filename, {
		collect: true,
		loose: !!options?.loose,
		to_ts: true,
		errors,
		comments,
	});
	const rendererConfig = normalizeRendererConfig(options?.renderers);
	const renderer = resolveRendererForFile(rendererConfig, filename ?? 'untitled.tsrx');
	const diagnostics = analyzeNativeChangeDiagnostics(ast, source, filename, {
		dom: renderer.target === 'dom',
		renderer,
		rendererBoundaries: rendererConfig.boundaries,
		rendererRegistry: rendererConfig.registry,
	}).diagnostics;
	const strongDiagnostics =
		options?.strong === true || source.includes('use strong')
			? analyzeStrongMode(ast, source, filename, options).diagnostics
			: null;
	if (strongDiagnostics !== null) diagnostics.push(...strongDiagnostics);
	const nativeReadDiagnostics = analyzeNativeReadDiagnostics(ast, source, filename, {
		...options,
		renderer,
		rendererBoundaries: rendererConfig.boundaries,
		rendererRegistry: rendererConfig.registry,
	});
	diagnostics.push(...nativeReadDiagnostics);
	// The renderer pragma belongs to the semantic comment set consumed by
	// @tsrx/core's type-only Program print. This keeps code and mappings in one
	// coordinate system instead of prepending text and shifting every mapping.
	const rendererPragma = hasAuthoredLeadingPragma(ast, comments)
		? null
		: createRendererTypePragma(renderer, ast);
	const printComments = rendererPragma === null ? comments : [rendererPragma, ...comments];
	// The `module server { … }` dialect is lowered to plain checkable TS by
	// the shared transform itself (via the platform's `serverModule` option)
	// before the typeOnly print. The lowering is copy-on-write inside
	// @tsrx/core: `ast` (passed below as `ast_from_source`) stays the
	// original parse, and replacement nodes keep authored locations so
	// mappings/hover still work.
	const transform = selectOctaneTransform(ast);
	const transformed = transform(ast, source, filename, {
		collect: true,
		loose: !!options?.loose,
		// @tsrx/core routes `typeOnly: true` to its TSX esrap language with
		// `boundaryTokens: true`. Structural delimiters then carry their own
		// one-character mappings without changing the virtual TSX bytes.
		typeOnly: true,
		errors,
		comments: printComments,
	});
	if (strongDiagnostics !== null || nativeReadDiagnostics.length > 0) {
		for (const diagnostic of [...(strongDiagnostics ?? []), ...nativeReadDiagnostics]) {
			collectCompileError(
				diagnostic.message,
				diagnostic.filename ?? null,
				{
					start: diagnostic.start.offset,
					end: diagnostic.end.offset,
					loc: {
						start: { line: diagnostic.start.line, column: diagnostic.start.column },
						end: { line: diagnostic.end.line, column: diagnostic.end.column },
					},
				},
				errors,
				undefined,
				diagnostic.code,
			);
		}
	}
	// After the transform: the copy-on-write lowering must not observe the
	// marker mid-flight, and `ast` is what ships below as `sourceAst`.
	markNativeTemplateBodies(ast);
	const result = createVolarMappingsResult({
		ast: transformed.ast,
		ast_from_source: ast,
		source,
		generated_code: transformed.code,
		source_map: transformed.map,
		errors,
	});
	const mappings = dedupeMappings(result.mappings);
	return {
		...result,
		mappings,
		diagnostics,
		generatedAst: transformed.ast,
	};
}

// ── Type-only INSPECTION ────────────────────────────────────────────────────
//
// `compileToVolarMappings` above is the EDITOR's pipeline: its mappings carry
// Volar capability data, are shaped for the language server's position
// queries, and any change to them changes hover, go-to-definition, diagnostics
// and completion. Navigation tooling wants something different — exact authored
// ranges, including the END a Volar mapping cannot express — and must not be
// able to perturb the editor to get it.
//
// So this is a parallel entry over the SAME parse and the SAME transform, with
// `inspect: true` (which anchors each lowered directive on its authored
// keyword) and without `createVolarMappingsResult`. Nothing here feeds the
// language server, and with the flag clear the transform is byte-identical, so
// the editor is unaffected by construction.

/** `@`-prefixed keyword each template directive opens with. */
const DIRECTIVE_KEYWORDS = {
	JSXIfExpression: '@if',
	JSXForExpression: '@for',
	JSXTryExpression: '@try',
	JSXSwitchExpression: '@switch',
};

/**
 * The generated text each directive resolves to.
 *
 * Two kinds. A directive the transform REWRITES (`@for` → a `map_iterable`
 * call) has no keyword left in the output, so the transform anchors the helper
 * on it — see `stamp_directive_origin` in @tsrx/core. A directive it PRESERVES
 * as JavaScript (`@switch`) still emits its keyword; the map already reaches
 * it, and only the authored END needs claiming.
 */
const DIRECTIVE_GENERATED_NAMES = {
	JSXForExpression: ['__map_iterable'],
	JSXSwitchExpression: ['switch'],
	// `@if` becomes a ternary whose arms are hoisted statics with generated
	// names, so there is no stable text to match — but the transform anchors
	// exactly one token on the keyword, so the offset alone identifies it.
	JSXIfExpression: null,
	// `@try` names the OUTERMOST boundary it produced: the `<Suspense>` when a
	// `@pending` clause is present, the error boundary otherwise. Only one of
	// the two is ever stamped, so listing both is not ambiguous.
	JSXTryExpression: ['Suspense', 'TsrxErrorBoundary'],
};

/** The same, for clause keywords the parser records a span for. */
const CLAUSE_GENERATED_NAMES = {
	case: ['case'],
	default: ['default'],
};

/**
 * Claim each directive's KEYWORD span for the code it lowered to.
 *
 * `buildFatSegments` resolves a segment's source end as "the smallest parsed
 * node starting at this offset". A directive's keyword is not a node — the
 * smallest node starting at `@for` is the whole `@for … @empty …` block — so
 * without this the anchor would report a 69-character range for a 4-character
 * keyword and swamp everything inside it. The generated text disambiguates the
 * anchored token from the rest of the lowering.
 *
 * @param {any} ast @param {string} source
 * @returns {Map<number, { end: number, texts: Set<string> }>}
 */
function collectDirectiveOrigins(ast, source) {
	/** @type {Map<number, { end: number, texts: Set<string> }>} */
	const origins = new Map();
	const seen = new WeakSet();
	/** @param {any} node */
	const visit = (node) => {
		if (!node || typeof node !== 'object' || seen.has(node)) return;
		seen.add(node);
		if (Array.isArray(node)) {
			for (const item of node) visit(item);
			return;
		}
		const keyword = DIRECTIVE_KEYWORDS[node.type];
		const names = DIRECTIVE_GENERATED_NAMES[node.type];
		if (
			keyword !== undefined &&
			names !== undefined && // `null` is a valid entry: match by offset alone
			typeof node.start === 'number' &&
			source.startsWith(keyword, node.start)
		) {
			origins.set(node.start, {
				end: node.start + keyword.length,
				texts: names === null ? null : new Set(names),
			});
		}
		// `@else`: the clause block starts at its `{`, so the transform anchors
		// the alternate arm on the keyword span the parser recorded.
		if (
			node.type === 'JSXIfExpression' &&
			node.alternateKeyword &&
			typeof node.alternateKeyword.start === 'number' &&
			source.startsWith('@else', node.alternateKeyword.start)
		) {
			origins.set(node.alternateKeyword.start, {
				end: node.alternateKeyword.start + '@else'.length,
				texts: null,
			});
		}
		// `@empty`: the clause block starts at its `{`, so the transform anchors
		// the arm it became on the keyword span the parser recorded. No node
		// starts at that offset, so the offset alone identifies the segment.
		if (
			node.type === 'JSXForExpression' &&
			node.emptyKeyword &&
			typeof node.emptyKeyword.start === 'number' &&
			source.startsWith('@empty', node.emptyKeyword.start)
		) {
			origins.set(node.emptyKeyword.start, {
				end: node.emptyKeyword.start + '@empty'.length,
				texts: null,
			});
		}
		// `@pending` / `@catch`: each clause becomes the `fallback` prop of the
		// boundary it produced, and the clause block starts at its `{`, so the
		// parser's keyword span is the only authored range that names it.
		if (node.type === 'JSXTryExpression') {
			for (const [keyword, span] of [
				['@pending', node.pendingKeyword],
				['@catch', node.handlerKeyword],
			]) {
				if (span && typeof span.start === 'number' && source.startsWith(keyword, span.start)) {
					origins.set(span.start, {
						end: span.start + keyword.length,
						texts: new Set(['fallback']),
					});
				}
			}
		}
		// `@case` / `@default`: the arm node starts before its keyword, so the
		// parser records the keyword's own span (see #lastClauseKeywordSpan).
		if (node.type === 'SwitchCase' && node.keyword) {
			const clause = node.test == null ? 'default' : 'case';
			if (
				typeof node.keyword.start === 'number' &&
				source.startsWith('@' + clause, node.keyword.start)
			) {
				origins.set(node.keyword.start, {
					end: node.keyword.start + clause.length + 1,
					texts: new Set(CLAUSE_GENERATED_NAMES[clause]),
				});
			}
		}
		for (const key in node) {
			if (key === 'metadata' || key === 'loc') continue;
			visit(node[key]);
		}
	};
	visit(ast);
	return origins;
}

/**
 * Compile a .tsrx source string to the typed virtual TSX plus the position
 * artifacts navigation tooling needs: the authored and generated Programs, and
 * fat segments (the print's map widened with the authored source END).
 *
 * @param {string} source
 * @param {string} [filename]
 * @param {{ renderers?: unknown }} [options]
 * @returns {{
 *   code: string,
 *   sourceAst: import('./index.js').CompilerProgram,
 *   generatedAst: import('./index.js').CompilerProgram,
 *   segments: (import('./index.js').CompileInspection['segments'][number] & { exact?: true })[],
 * }}
 */
export function compileTypesInspection(source, filename, options) {
	/** @type {import('@tsrx/core/types').CompileError[]} */
	const errors = [];
	/** @type {import('@tsrx/core/types').AST.CommentWithLocation[]} */
	const comments = [];
	const ast = parseModule(source, filename, {
		collect: true,
		loose: true,
		preserveParens: true,
		keywordTokens: true,
		errors,
		comments,
	});
	analyzeTsrx(ast, filename, { collect: true, loose: true, to_ts: true, errors, comments });
	const rendererConfig = normalizeRendererConfig(options?.renderers);
	const renderer = resolveRendererForFile(rendererConfig, filename ?? 'untitled.tsrx');
	const rendererPragma = hasAuthoredLeadingPragma(ast, comments)
		? null
		: createRendererTypePragma(renderer, ast);
	const transform = selectOctaneTransform(ast);
	const transformed = transform(ast, source, filename, {
		collect: true,
		loose: true,
		typeOnly: true,
		inspect: true,
		errors,
		comments: rendererPragma === null ? comments : [rendererPragma, ...comments],
	});
	markNativeTemplateBodies(ast);
	return {
		code: transformed.code,
		sourceAst: ast,
		generatedAst: transformed.ast,
		segments: buildFatSegments(
			decodeSourceMappings(transformed.map?.mappings ?? ''),
			source,
			ast,
			transformed.code,
			collectDirectiveOrigins(ast, source),
		),
	};
}
