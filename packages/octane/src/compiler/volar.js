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
	acorn,
	createJsxTransform,
	createVolarMappingsResult,
	dedupeMappings,
	parseModule,
	tsPlugin,
} from '@tsrx/core';
import { analyzeNativeChangeDiagnostics } from './native-change-diagnostics.js';
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
		// helpers from this module (identity-typed — see octane/tsrx-spread).
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
const GeneratedOutputParser = acorn.Parser.extend(tsPlugin({ jsx: true }));

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

function createRendererTypePrelude(renderer) {
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
	if (intrinsics === undefined) return '';
	return `/** @jsxImportSource ${intrinsics} */\n`;
}

function shiftGeneratedOffsets(mappings, offset) {
	if (offset === 0) return mappings;
	return mappings.map((mapping) => ({
		...mapping,
		generatedOffsets: mapping.generatedOffsets.map((generatedOffset) => generatedOffset + offset),
	}));
}

// The shared type-only printer keeps a scoped-style placeholder as a bare JSX
// expression statement. Without separators, a preceding JSX statement and a
// following `return` are parsed as one malformed expression. Insert explicit
// statement terminators and return their original-code offsets so Volar
// mappings can be shifted with the output.
function terminateStylePlaceholderStatements(code) {
	const marker = '<style></style>';
	const insertions = new Set();
	let from = 0;
	while (true) {
		const start = code.indexOf(marker, from);
		if (start < 0) break;
		const lineStart = code.lastIndexOf('\n', start - 1) + 1;
		const nextLine = code.indexOf('\n', start + marker.length);
		const lineEnd = nextLine < 0 ? code.length : nextLine;
		if (code.slice(lineStart, lineEnd).trim() !== marker) {
			from = start + marker.length;
			continue;
		}
		let before = start - 1;
		while (before >= 0 && /\s/.test(code[before])) before--;
		if (code[before] === '>') insertions.add(before + 1);
		const end = start + marker.length;
		if (code[end] !== ';') insertions.add(end);
		from = end;
	}
	const positions = [...insertions].sort((a, b) => a - b);
	let output = '';
	let cursor = 0;
	for (const position of positions) {
		output += code.slice(cursor, position) + ';';
		cursor = position;
	}
	return { code: output + code.slice(cursor), insertions: positions };
}

function shiftGeneratedInsertions(mappings, insertions) {
	if (insertions.length === 0) return mappings;
	return mappings.map((mapping) => {
		const generatedLengths = mapping.generatedLengths ?? mapping.lengths;
		return {
			...mapping,
			generatedOffsets: mapping.generatedOffsets.map(
				(offset) => offset + insertions.filter((position) => position <= offset).length,
			),
			generatedLengths: generatedLengths.map((length, index) => {
				const start =
					mapping.generatedOffsets[Math.min(index, mapping.generatedOffsets.length - 1)];
				return (
					length +
					insertions.filter((position) => start < position && position < start + length).length
				);
			}),
		};
	});
}

/**
 * Parse emitted compiler code for diagnostics tooling. Runtime client/server
 * emitters do not retain one complete transformed tree, so consumers that
 * need an output-coordinate AST must parse the final artifact instead.
 *
 * @param {string} code
 * @returns {unknown}
 * @internal
 */
export function __parseGeneratedModuleAst(code) {
	return GeneratedOutputParser.parse(code, {
		sourceType: 'module',
		ecmaVersion: 'latest',
		allowReturnOutsideFunction: true,
		locations: true,
		preserveParens: true,
	});
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
 * `astTrace` is an opt-in diagnostics hook used by tooling such as the
 * playground. It exposes the copy-on-write transform tree and an AST parsed
 * from the final virtual TSX. The normal language-service path does not pay
 * for that second parse.
 *
 * @param {{ loose?: boolean, renderers?: unknown, astTrace?: boolean | 'transform' | 'generated' }} [options]
 * @returns {import('@tsrx/core/types').VolarMappingsResult & {
 *   diagnostics: readonly unknown[],
 *   astTrace?: { transformedAst: unknown, generatedAst?: unknown }
 * }}
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
	// The `module server { … }` dialect is lowered to plain checkable TS by
	// the shared transform itself (via the platform's `serverModule` option)
	// before the typeOnly print. The lowering is copy-on-write inside
	// @tsrx/core: `ast` (passed below as `ast_from_source`) stays the
	// original parse, and replacement nodes keep authored locations so
	// mappings/hover still work.
	const transformed = octaneTransform(ast, source, filename, {
		collect: true,
		loose: !!options?.loose,
		typeOnly: true,
		errors,
		comments,
	});
	// After the transform: the copy-on-write lowering must not observe the
	// marker mid-flight, and `ast` is what ships below as `sourceAst`.
	markNativeTemplateBodies(ast);
	const prelude = hasAuthoredLeadingPragma(ast, comments)
		? ''
		: createRendererTypePrelude(renderer);
	const result = createVolarMappingsResult({
		ast: transformed.ast,
		ast_from_source: ast,
		source,
		generated_code: transformed.code,
		source_map: transformed.map,
		errors,
	});
	const mappings = shiftGeneratedOffsets(dedupeMappings(result.mappings), prelude.length);
	const terminated = terminateStylePlaceholderStatements(prelude + result.code);
	const code = terminated.code;
	return {
		...result,
		code,
		mappings: shiftGeneratedInsertions(mappings, terminated.insertions),
		diagnostics,
		...(options?.astTrace
			? {
					astTrace: {
						transformedAst: transformed.ast,
						...(options.astTrace === 'transform'
							? null
							: {
									generatedAst: __parseGeneratedModuleAst(code),
								}),
					},
				}
			: null),
	};
}
